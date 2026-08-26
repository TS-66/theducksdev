/**
 * DSH Web — agent engine: streaming SSE agent loop, permission policy,
 * tool dispatch and subagent delegation.
 *
 * Replicates the deepseek-ai/deepseek-harness client-side control flow
 * (tools/pre-execute approval gate → execute → tool result event → next
 * model turn) entirely in the browser against our stateless /api/chat
 * proxy. Fully serverless-friendly.
 */

import type {
  AgentEvent,
  ApprovalRequest,
  PermissionPolicy,
  RunLoopOptions,
  Settings,
  ToolDefinition,
  ToolSchema,
  WireMessage,
} from './types';
import {
  getToolDefinition,
  PLUGINS,
  TOOL_EXECUTOR_BUILDERS,
  buildToolDefinitions,
  type AskUserQuestion,
  type AskUserQuestionOption,
  type ToolExecutionContext,
} from './plugins';
import { webFetch, webSearch } from './tools-web';
import { useDshStore } from './store';

/* ------------------------- extended loop options --------------------------- */

/**
 * Engine-side extension of the canonical RunLoopOptions: the frozen contract
 * lacks message-history plumbing and the interactive bridges, so this layer
 * lives here (see worklog caveat about promoting these fields later).
 */
export interface RunLoopOptionsExt extends RunLoopOptions {
  /** Full wire history INCLUDING the trailing user message. */
  messages: WireMessage[];
  /** Interactive question bridge; resolves with a formatted JSON string answer. */
  askUser?: (questions: AskUserQuestion[]) => Promise<string>;
  /** Called when the model signals plan readiness; return false to keep planning. */
  onPlanExit?: () => boolean | void | Promise<boolean | void>;
  /** Whether plan mode is active for this run (affects exit_plan_mode). */
  planModeActive?: boolean;
}

/* ------------------------------ constants ---------------------------------- */

/** Per-message cap for tool results pushed back into model context. */
const MAX_TOOL_RESULT_CHARS = 32_000;
const SUBAGENT_PLUGIN_ID = `${PLUGINS.find((p) => p.tools.includes('subagent'))?.id ?? '@deepseek-ai/dsh-tool-subagent'}`;
const ALWAYS_ALLOW = new Set(['todo_write', 'ask_user_question', 'exit_plan_mode']);

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

function truncate(text: string, max = MAX_TOOL_RESULT_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n[dsh: truncated ${text.length - max} characters]`;
}

/* ----------------------------- schema builders ------------------------------ */

/** Model-facing schemas filtered by enabled plugin ids. */
export function buildToolSchemas(enabledPluginIds: string[]): ToolSchema[] {
  const enabled = new Set(enabledPluginIds);
  return buildToolDefinitions()
    .filter((d) => enabled.has(d.pluginId))
    .map((d) => ({
      type: 'function' as const,
      function: {
        name: d.name,
        description: d.description,
        parameters: d.parameters,
      },
    }));
}

/** Permission-policy decision for one tool call. */
export function resolvePolicyDecision(
  toolDef: Pick<ToolDefinition, 'name' | 'sideEffects'> | undefined,
  policy: PermissionPolicy,
): 'allow' | 'deny' | 'ask' {
  if (!toolDef) return 'allow'; // unknown tools fall through; execution errors clearly
  if (ALWAYS_ALLOW.has(toolDef.name)) return 'allow';
  if (!toolDef.sideEffects) return 'allow';
  switch (policy) {
    case 'readonly':
      return 'deny';
    case 'ask':
      return 'ask';
    default:
      return 'allow';
  }
}

/* -------------------------------- SSE parsing ------------------------------- */

interface DeltaToolCall {
  index: number;
  id: string | null;
  name: string | null;
  argsRaw: string;
}

interface StreamAccumulator {
  content: string;
  reasoning: string;
  toolCalls: Map<number, DeltaToolCall>;
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
}

interface ChatChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

async function consumeSSEResponse(
  res: Response,
  acc: StreamAccumulator,
  handlers: {
    onTextDelta: (delta: string) => void;
    onReasoningDelta: (delta: string) => void;
  },
  signal: AbortSignal,
): Promise<void> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawDone = false;

  const processBlock = (block: string): void => {
    const dataLines = block
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim());
    if (!dataLines.length) return;
    const payload = dataLines.join('\n');
    if (payload === '[DONE]') {
      sawDone = true;
      return;
    }
    let chunk: ChatChunk;
    try {
      chunk = JSON.parse(payload) as ChatChunk;
    } catch {
      return; // tolerate keep-alives / partial provider quirks
    }
    if (chunk.usage) {
      if (typeof chunk.usage.prompt_tokens === 'number') acc.promptTokens = chunk.usage.prompt_tokens;
      if (typeof chunk.usage.completion_tokens === 'number') acc.completionTokens = chunk.usage.completion_tokens;
    }
    const choice = chunk.choices?.[0];
    if (!choice) return;
    const delta = choice.delta;
    if (choice.finish_reason) acc.finishReason = choice.finish_reason;
    if (!delta) return;
    if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length) {
      acc.reasoning += delta.reasoning_content;
      handlers.onReasoningDelta(delta.reasoning_content);
    }
    if (typeof delta.content === 'string' && delta.content.length) {
      acc.content += delta.content;
      handlers.onTextDelta(delta.content);
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = typeof tc.index === 'number' ? tc.index : acc.toolCalls.size;
        let entry = acc.toolCalls.get(idx);
        if (!entry) {
          entry = { index: idx, id: tc.id ?? null, name: null, argsRaw: '' };
          acc.toolCalls.set(idx, entry);
        }
        if (tc.id) entry.id = tc.id;
        if (tc.function?.name) entry.name = tc.function.name;
        if (typeof tc.function?.arguments === 'string') entry.argsRaw += tc.function.arguments;
      }
    }
  };

  try {
    while (true) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sepIdx: number;
      while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        processBlock(block);
        if (sawDone) return;
      }
    }
    // flush any trailing block without final newline pair
    if (!sawDone && buffer.trim()) processBlock(buffer);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // noop
    }
  }
}

/* ------------------------------ shell cwd registry -------------------------- */

const sessionCwdRegistry = new Map<string, string>();

/* ------------------------------ buildExecutors ------------------------------ */

export interface BuildExecutorsOptions {
  sessionId: string;
  settings: Settings;
  signal: AbortSignal;
  onEvent: (e: AgentEvent) => void;
}

/**
 * Bind every TOOL_EXECUTOR_BUILDERS builder plus the special-cased
 * `subagent` executor to a concrete session's virtual workspace.
 */
export function buildExecutors(
  opts: BuildExecutorsOptions,
): Record<string, (args: Record<string, unknown>) => Promise<string>> {
  const ctx: ToolExecutionContext = {
    sessionId: opts.sessionId,
    readFile: (path) => useDshStore.getState().getFile(opts.sessionId, path),
    writeFile: (path, content) => {
      useDshStore.getState().writeFile(opts.sessionId, path, content);
    },
    deleteFileEntry: (path) => useDshStore.getState().deleteFileEntry(opts.sessionId, path),
    listWorkspaceFiles: () => useDshStore.getState().listWorkspaceFiles(opts.sessionId),
    readWorkspaceSnapshot: () => {
      const ws = useDshStore.getState().listWorkspaceFiles(opts.sessionId);
      const st = useDshStore.getState();
      const snapshot: Record<string, string> = {};
      for (const f of ws) snapshot[f] = st.getFile(opts.sessionId, f) ?? '';
      return snapshot;
    },
    getCwd: () => sessionCwdRegistry.get(opts.sessionId) ?? '',
    setCwd: (cwd) => sessionCwdRegistry.set(opts.sessionId, cwd),
    syncWorkspace: (next) => useDshStore.getState().replaceWorkspace(opts.sessionId, next),
    setTodos: (todos) => useDshStore.getState().setTodos(opts.sessionId, todos),
    webSearch: (query, num) => webSearch(query, num),
    webFetch: (url) => webFetch(url),
  };

  const executors: Record<string, (args: Record<string, unknown>) => Promise<string>> = {};
  for (const [name, build] of Object.entries(TOOL_EXECUTOR_BUILDERS)) {
    executors[name] = build(ctx);
  }

  // Delegation needs loop internals, so it is bound here rather than in plugins.
  executors['subagent'] = async (args) => {
    const objective = typeof args.objective === 'string' ? args.objective : '';
    if (!objective.trim()) throw new Error('subagent: "objective" is required');
    const hints = typeof args.hints === 'string' ? args.hints : '';
    const report = await runSubagent(hints ? `${objective}\n\nHints: ${hints}` : objective, {
      settings: opts.settings,
      signal: opts.signal,
      sessionId: opts.sessionId,
    });
    return truncate(report, 16_000);
  };

  return executors;
}

/* ------------------------------- runSubagent -------------------------------- */

export interface SubagentContext {
  settings: Settings;
  signal: AbortSignal;
  /** forward child progress/usage to a parent feed */
  onEvent?: (e: AgentEvent) => void;
  /** share the parent's workspace by session id */
  sessionId?: string;
}

/**
 * Focused child agent: reduced system prompt, reduced toolset (no nested
 * delegation / user interaction / plan mode), ≤6 iterations. Returns the
 * child's final assistant text.
 */
export async function runSubagent(objective: string, sctx: SubagentContext): Promise<string> {
  const baseIds = resolveEnabledPluginIdsFor(sctx.settings);
  const restrictedIds = baseIds.filter(
    (id) =>
      id !== SUBAGENT_PLUGIN_ID &&
      !PLUGINS.find((p) => p.id === id)?.tools.includes('ask_user_question') &&
      !PLUGINS.find((p) => p.id === id)?.tools.includes('exit_plan_mode'),
  );
  const schemas = buildToolSchemas(restrictedIds);

  const sysPrompt =
    'You are dsh-subagent, a focused worker spawned by the main dsh agent. ' +
    'Complete ONLY the objective given. Tools are available against the shared workspace; ' +
    'keep exploration tight and report results concisely in plain text (no preamble, no restating the objective).';

  const history: WireMessage[] = [
    { role: 'system', content: sysPrompt },
    { role: 'user', content: objective },
  ];

  let collected = '';
  await runAgentLoop({
    sessionId: sctx.sessionId ?? 'subagent',
    settings: sctx.settings,
    tools: schemas,
    executors: buildExecutors({
      sessionId: sctx.sessionId ?? 'subagent',
      settings: sctx.settings,
      signal: sctx.signal,
      onEvent: (e) => sctx.onEvent?.(e),
    }),
    onEvent: (e) => {
      if (e.type === 'text-delta') collected += e.delta;
      sctx.onEvent?.(e);
    },
    signal: sctx.signal,
    maxIterations: Math.min(6, Math.max(1, sctx.settings.maxToolIterations)),
    messages: history,
  });

  return collected.trim() || '(subagent finished with no textual output)';
}

function resolveEnabledPluginIdsFor(_settings: Settings): string[] {
  const disabled = useDshStore.getState().disabledPlugins;
  return PLUGINS.filter((p) => !disabled.includes(p.id)).map((p) => p.id);
}

/* ------------------------------- runAgentLoop -------------------------------- */

const POLICY_LABEL: Record<PermissionPolicy, string> = {
  auto: 'auto',
  ask: 'approval-required',
  readonly: 'read-only',
};

/**
 * The core multi-iteration agent loop. Streams deltas through `onEvent`,
 * gates tool calls through the permission policy, executes via
 * `executors`, feeds synthetic assistant/tool messages back and repeats until
 * the model stops, the budget is exhausted or the signal aborts.
 */
export async function runAgentLoop(loopOpts: RunLoopOptionsExt): Promise<void> {
  const { settings, executors, onEvent, signal, messages } = loopOpts;
  const maxIterations = Math.max(1, loopOpts.maxIterations ?? settings.maxToolIterations ?? 25);
  const history: WireMessage[] = [...messages];
  const tools = loopOpts.tools;

  const emitSafe = (e: AgentEvent) => {
    try {
      onEvent(e);
    } catch {
      // UI listeners must never break the loop
    }
  };

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    if (signal.aborted) {
      emitSafe({ type: 'done', aborted: true });
      return;
    }
    emitSafe({ type: 'iteration', n: iteration });

    /* ---------- phase 1: request model turn ---------- */
    let res: Response;
    try {
      res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: settings.baseUrl,
          apiKey: settings.apiKey,
          model: settings.model,
          messages: history,
          ...(tools.length ? { tools } : {}),
          temperature: settings.temperature,
          max_tokens: settings.maxTokens,
          stream: true,
        }),
        signal,
      });
    } catch (e) {
      if (signal.aborted) {
        emitSafe({ type: 'done', aborted: true });
        return;
      }
      emitSafe({
        type: 'error',
        message: `Network error contacting the chat proxy: ${(e as Error).message}`,
      });
      emitSafe({ type: 'done', aborted: false });
      return;
    }

    if (!res.ok || !res.body) {
      let message = `Chat request failed (HTTP ${res.status}).`;
      try {
        const payload = (await res.json()) as { error?: { message?: string } };
        message = payload.error?.message ?? message;
      } catch {
        // generic
      }
      emitSafe({ type: 'error', message });
      emitSafe({ type: 'done', aborted: false });
      return;
    }

    /* ---------- phase 2: consume stream ---------- */
    const acc: StreamAccumulator = {
      content: '',
      reasoning: '',
      toolCalls: new Map(),
      finishReason: null,
      promptTokens: null,
      completionTokens: null,
    };
    try {
      await consumeSSEResponse(res, acc, {
        onTextDelta: (d) => emitSafe({ type: 'text-delta', delta: d }),
        onReasoningDelta: (d) => emitSafe({ type: 'reasoning-delta', delta: d }),
      }, signal);
    } catch (e) {
      if (signal.aborted) {
        emitSafe({ type: 'usage', promptTokens: acc.promptTokens ?? undefined, completionTokens: acc.completionTokens ?? undefined });
        emitSafe({ type: 'done', aborted: true });
        return;
      }
      emitSafe({ type: 'error', message: `Stream error: ${(e as Error).message}` });
      emitSafe({ type: 'done', aborted: false });
      return;
    }

    if (acc.promptTokens !== null || acc.completionTokens !== null) {
      emitSafe({
        type: 'usage',
        promptTokens: acc.promptTokens ?? undefined,
        completionTokens: acc.completionTokens ?? undefined,
      });
    }

    const calls = Array.from(acc.toolCalls.values())
      .sort((a, b) => a.index - b.index)
      .map((c, i) => ({
        id: c.id ?? `call_${iteration}_${i}`,
        name: c.name ?? `unknown_tool_${c.index}`,
        argsRaw: c.argsRaw,
      }));

    /* ---------- phase 3: natural stop ---------- */
    if (!calls.length && acc.finishReason !== 'tool_calls') {
      emitSafe({ type: 'done', aborted: false });
      return;
    }

    /* ---------- phase 4: prepare synthetic assistant message ---------- */
    const assistantMsg: WireMessage = {
      role: 'assistant',
      content: acc.content || (calls.length ? '' : null),
      ...(calls.length
        ? {
            tool_calls: calls.map((c) => ({
              id: c.id,
              type: 'function' as const,
              function: { name: c.name, arguments: c.argsRaw },
            })),
          }
        : {}),
    };
    history.push(assistantMsg);

    /* ---------- phase 5: sequential tool execution ---------- */
    for (const call of calls) {
      let parsedArgs: Record<string, unknown> = {};
      let parseError: string | null = null;
      if (call.argsRaw.trim()) {
        try {
          const parsed: unknown = JSON.parse(call.argsRaw);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            parsedArgs = parsed as Record<string, unknown>;
          } else {
            parseError = 'arguments must be a JSON object';
          }
        } catch (e) {
          parseError = (e as Error).message;
        }
      }

      emitSafe({ type: 'tool-call-start', callId: call.id, name: call.name, argsRaw: call.argsRaw });

      const outcome = await runToolCall(call.name, parsedArgs, {
        parseError,
        executors,
        settings,
        signal,
        loopOpts,
        onApprovalRequest: (req) => emitSafe({ type: 'approval-request', request: req }),
      });

      emitSafe({
        type: 'tool-call-end',
        callId: call.id,
        name: call.name,
        ok: outcome.ok,
        result: truncate(outcome.result, 4_000),
        durationMs: outcome.durationMs,
      });
      history.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.name,
        content: truncate(outcome.result),
      });
    }

    if (signal.aborted) {
      emitSafe({ type: 'done', aborted: true });
      return;
    }
  }

  /* ---------- iteration guard exceeded ---------- */
  emitSafe({
    type: 'text-delta',
    delta: `\n\n[dsh: stopped after reaching the maximum of ${maxIterations} tool iterations.]`,
  });
  emitSafe({ type: 'done', aborted: false });
}

/* --------------------------- special-case handlers -------------------------- */

async function handleAskUser(
  args: Record<string, unknown>,
  deps: ToolCallDeps,
): Promise<{ ok: boolean; message: string }> {
  const raw = Array.isArray(args.questions) ? args.questions : [];
  const questions: AskUserQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id : '';
    const q = typeof rec.question === 'string' ? rec.question : '';
    if (!id || !q) continue;
    const options = Array.isArray(rec.options)
      ? rec.options
          .map((o) => {
            const orc = o as Record<string, unknown>;
            return typeof orc.label === 'string'
              ? { label: orc.label, ...(typeof orc.description === 'string' ? { description: orc.description } : {}) }
              : null;
          })
          .filter((o): o is AskUserQuestionOption => o !== null)
      : undefined;
    questions.push({
      id,
      question: q,
      ...(typeof rec.header === 'string' && rec.header ? { header: rec.header } : {}),
      ...(options ? { options } : {}),
      ...(rec.multi_select === true ? { multi_select: true } : {}),
    });
  }
  if (!questions.length) {
    return { ok: false, message: 'Error: ask_user_question received no valid questions.' };
  }
  if (!deps.loopOpts.askUser) {
    return {
      ok: true,
      message:
        'No interactive user is available in this environment; proceed with your best judgement and note the open question in your reply.',
    };
  }
  try {
    const answer = await deps.loopOpts.askUser(questions);
    return { ok: true, message: `The user answered:\n${answer}` };
  } catch (e) {
    return { ok: false, message: `Error: ${(e as Error).message}` };
  }
}

async function handleExitPlanMode(
  loopOpts: RunLoopOptionsExt,
): Promise<{ ok: boolean; message: string }> {
  if (!loopOpts.planModeActive) {
    return {
      ok: false,
      message: 'Error: plan mode is not currently active. Perform the work directly instead.',
    };
  }
  try {
    const outcome = await loopOpts.onPlanExit?.();
    if (outcome === false) {
      return {
        ok: false,
        message:
          'The user did NOT approve the plan yet. Read their feedback (if any) and keep refining; stay read-only while in plan mode.',
      };
    }
    return { ok: true, message: 'User approved the plan.' };
  } catch (e) {
    return { ok: false, message: `Error presenting plan: ${(e as Error).message}` };
  }
}

/* ---------------------------- runToolCall (gate+exec) ------------------------ */

interface ToolCallDeps {
  parseError: string | null;
  executors: Record<string, (args: Record<string, unknown>) => Promise<string>>;
  settings: Settings;
  signal: AbortSignal;
  loopOpts: RunLoopOptionsExt;
  onApprovalRequest: (req: ApprovalRequest) => void;
}

/**
 * Permission gate + execution for a single resolved tool call.
 * Special-cases `ask_user_question` / `exit_plan_mode`; every other call goes
 * through resolvePolicyDecision → optional approval bridge → executor.
 */
async function runToolCall(
  name: string,
  args: Record<string, unknown>,
  deps: ToolCallDeps,
): Promise<{ result: string; ok: boolean; durationMs: number }> {
  const { loopOpts, settings } = deps;

  if (deps.signal.aborted) {
    return { result: 'Execution skipped: run aborted.', ok: false, durationMs: 0 };
  }

  // --- interactive special cases -------------------------------------------
  if (name === 'ask_user_question') {
    const started = Date.now();
    const r = await handleAskUser(args, deps);
    return { result: r.message, ok: r.ok, durationMs: Date.now() - started };
  }
  if (name === 'exit_plan_mode') {
    const started = Date.now();
    const r = await handleExitPlanMode(loopOpts);
    return { result: r.message, ok: r.ok, durationMs: Date.now() - started };
  }

  // --- permission gate ------------------------------------------------------
  const def = getToolDefinition(name);
  const decision = resolvePolicyDecision(def, settings.policy);
  if (decision === 'deny') {
    return {
      result: `Permission denied: '${name}' is blocked by the current permission policy (${POLICY_LABEL[settings.policy]}).`,
      ok: false,
      durationMs: 0,
    };
  }

  let approved = true;
  if (decision === 'ask') {
    const req: ApprovalRequest = {
      id: uid(),
      toolName: name,
      argsPreview: truncate(JSON.stringify(args, null, 2) || '{}', 1200),
      reason: `'${name}' can modify your workspace.`,
    };
    deps.onApprovalRequest(req);
    if (!loopOpts.requestApproval) {
      return {
        result: `Permission denied: '${name}' requires approval but no approver is connected. Switch the permission policy to Auto to allow it automatically.`,
        ok: false,
        durationMs: 0,
      };
    }
    try {
      approved = await loopOpts.requestApproval(req);
    } catch {
      approved = false;
    }
    if (!approved) {
      return {
        result: `User declined to run '${name}'. Adjust your approach accordingly.`,
        ok: false,
        durationMs: 0,
      };
    }
  }

  // --- execute ---------------------------------------------------------------
  const startedAt = Date.now();
  const fn = deps.executors[name];
  if (!fn) {
    return { result: `Error: tool '${name}' has no registered executor.`, ok: false, durationMs: Date.now() - startedAt };
  }
  try {
    let result = await fn(args);
    if (deps.parseError) {
      result = `Warning: arguments failed strict JSON parsing (${deps.parseError}); executed with best-effort values.\n${result}`;
    }
    return { result, ok: true, durationMs: Date.now() - startedAt };
  } catch (e) {
    return { result: `Error: ${(e as Error).message}`, ok: false, durationMs: Date.now() - startedAt };
  }
}
