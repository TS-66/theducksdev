'use client';

/**
 * Ducky AI | Coder — orchestrator hook wiring the React UI to the agent engine.
 *
 * Owns: history → WireMessage conversion, system-prompt assembly (persona +
 * workspace snapshot + todo state + plan-mode block), AbortController
 * lifecycle, permission/question promise bridges, stats + title updates and
 * AgentEvent → ChatMessage mapping for the Ducky web UI
 * driver that feeds ctx.events back into its transcript view.
 */

import { useCallback, useRef } from 'react';
import { useDuckyStore } from '@/lib/ducky/store';
import {
  buildExecutors,
  buildToolSchemas,
  runAgentLoop,
  type RunLoopOptionsExt,
} from '@/lib/ducky/agent-loop';
import { PLUGINS, resolveEnabledPluginIds } from '@/lib/ducky/plugins';
import { renderMemoriesForPrompt } from '@/lib/ducky/memory';
import { renderMcpForPrompt } from '@/lib/ducky/mcp';
import { SKILLS } from '@/lib/ducky/skills';
import { inferModelCapabilities, providerOf } from '@/lib/ducky/model-capabilities';
import { renderTree } from '@/lib/ducky/tools-vfs';
import { useDiskStore, type DiskStatus } from '@/lib/ducky/disk';
import { isModelIdSet, isServerLive } from '@/lib/ducky/server-caps';
import type { AskUserQuestion } from '@/lib/ducky/plugins';
import type {
  ApprovalRequest,
  ChatMessage,
  ToolCallData,
  WireMessage,
} from '@/lib/ducky/types';

/* ------------------------------ helpers ----------------------------------- */

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

/** Convert stored chat messages into OpenAI-compatible wire messages. */
export function toWireMessages(messages: ChatMessage[]): WireMessage[] {
  const out: WireMessage[] = [];
  const knownToolCallIds = new Set<string>();

  for (const m of messages) {
    if (m.status === 'streaming') continue; // half-written leftovers never replay
    switch (m.role) {
      case 'system':
        if (m.content.trim()) out.push({ role: 'system', content: m.content });
        break;
      case 'user':
        if (m.content.trim()) out.push({ role: 'user', content: m.content });
        break;
      case 'assistant': {
        const toolCalls: ToolCallData[] | undefined =
          m.toolCalls && m.toolCalls.length > 0 ? m.toolCalls : undefined;
        if (toolCalls) {
          for (const tc of toolCalls) knownToolCallIds.add(tc.id);
          out.push({
            role: 'assistant',
            content: m.content || '',
            tool_calls: toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.function.name, arguments: tc.function.arguments },
            })),
          });
        } else if (m.content.trim()) {
          out.push({ role: 'assistant', content: m.content });
        }
        break;
      }
      case 'tool':
        if (m.toolCallId && knownToolCallIds.has(m.toolCallId)) {
          out.push({
            role: 'tool',
            tool_call_id: m.toolCallId,
            name: m.toolName,
            content: m.content,
          });
        }
        break;
    }
  }

  // Trim dangling leading assistant/tool fragments (e.g. previous aborted runs).
  let i = 0;
  while (
    i < out.length &&
    (out[i].role === 'tool' ||
      (out[i].role === 'assistant' && !(out[i].content ?? '').trim() && !out[i].tool_calls))
  ) {
    i++;
  }
  return i > 0 ? out.slice(i) : out;
}

/** One-line capability brief so the agent knows what this model can consume. */
function modelCapabilityLine(modelId: string, baseUrl: string): string {
  const id = (modelId ?? '').trim();
  if (!id) return '(no model id configured — ask the human to set one in Settings → Connections)';
  const caps = inferModelCapabilities(id);
  const bits = [
    `vision ${caps.inputFormat.supportsImage ? 'yes' : 'no'}`,
    `tool-calls ${caps.supportsToolCall ? 'yes' : 'no'}`,
  ];
  return (
    `Active model "${id}" via ${providerOf(baseUrl)} (${bits.join(' · ')}). ` +
    (caps.inputFormat.supportsImage
      ? 'vision_describe and pasted images work — read screenshots with it.'
      : 'Assume the model CANNOT see images: describe screenshots and pasted visuals in words instead of sending them blindly.') +
    (caps.supportsToolCall ? '' : ' This model may not support tool calls — prefer direct answers over tool chains.')
  );
}

function buildSystemPrompt(opts: {
  files: string[];
  workspaceTree: string;
  projectName?: string | null;
  todos: Array<{ content: string; status: string }>;
  planMode: boolean;
  planDraft?: string;
  systemPromptExtra: string;
  memoryBlock: string;
  mcpBlock: string;
  disk: { status: DiskStatus; rootName: string };
  modelId: string;
  baseUrl: string;
}): string {
  const now = new Date();
  const enabled = PLUGINS.filter((p) => !useDuckyStore.getState().disabledPlugins.includes(p.id));
  const lines: string[] = [
    'You are Ducky, the Ducky AI coder agent — an everything-is-a-plugin coding harness running entirely in the browser.',
    opts.files.length > 0
      ? `You operate against a virtual workspace${opts.projectName ? ` for the project “${opts.projectName}”` : ''} (${opts.files.length} files). Prefer tools over prose for any file inspection or mutation.`
      : 'You operate against an EMPTY virtual workspace (no project attached). Offer to scaffold files with write tools, or suggest creating/importing a project.',
    `Today is ${now.toISOString()} . OS: simulated linux x86_64 (shell is a safe mini-bash over the workspace).`,
    '',
    '# Enabled plugins',
    ...enabled.map((p) => `- ${p.id}: ${p.tools.join(', ')}`),
    '',
    '# Workspace',
    '```',
    opts.workspaceTree,
    '```',
    '',
    '# Current checklist',
    opts.todos.length
      ? opts.todos
          .map((t) => {
            const box =
              t.status === 'completed' ? '[x]' : t.status === 'in_progress' ? '[~]' : t.status === 'cancelled' ? '[-]' : '[ ]';
            return `- ${box} ${t.content}`;
          })
          .join('\n')
      : '(empty)',
    '',
    '# Durable memory (from memory_save — treat as standing instructions)',
    opts.memoryBlock.trim() ? opts.memoryBlock : '(empty)',
    '',
    '# Skill playbooks (call skill_show to load one before that kind of work)',
    SKILLS.map((s) => `- ${s.name}: ${s.description}`).join('\n'),
    '',
    '# MCP connections (outside apps — call mcp_list before mcp_call)',
    opts.mcpBlock.trim() ? opts.mcpBlock : '(none connected — the human adds them in Settings → Connections → MCP)',
    '',
    '# Model capabilities (inferred from the model id — heuristics, not guarantees)',
    modelCapabilityLine(opts.modelId, opts.baseUrl),
  ];

  if (opts.disk.status === 'connected') {
    lines.push(
      '',
      '# Local disk access (REAL filesystem)',
      `The user connected a real local folder: "${opts.disk.rootName}" (read-write, browser-granted).`,
      '- disk_ls / disk_read / disk_status inspect it; disk_write / disk_edit / disk_delete / disk_mkdir mutate the user\'s ACTUAL computer inside that folder — with great care: read before overwriting, prefer disk_edit over full rewrites, confirm targets before deletes.',
      '- disk_* paths are relative to that folder; the sandbox workspace and the real folder are separate trees — mention where a change landed when both are in play.',
    );
  } else if (opts.disk.status === 'needs-permission') {
    lines.push(
      '',
      '# Local disk access',
      `A folder ("${opts.disk.rootName}") was connected before but needs its permission re-granted — tell the user to click the disk chip in the status bar to reconnect.`,
    );
  }

  if (opts.planMode) {
    lines.push(
      '',
      '# PLAN MODE ACTIVE',
      '- You MUST NOT modify anything (no write_file / edit_file / bash mutations, no deletions). Explore read-only.',
      '- Research the task, then compose a complete implementation plan.',
      '- When ready, call exit_plan_mode to hand the plan to the user. Stay read-only until they approve ending plan mode.',
    );
    if (opts.planDraft?.trim()) {
      lines.push('', '## Draft so far', opts.planDraft);
    }
  }

  if (opts.systemPromptExtra.trim()) {
    lines.push('', '# Operator instructions', opts.systemPromptExtra.trim());
  }

  lines.push(
    '',
    'Be concise but precise; show short code snippets rather than dumping whole files unless asked.',
  );
  void opts.files;
  return lines.join('\n');
}

const truncatePreview = (s: string, max = 600): string =>
  s.length > max ? `${s.slice(0, max)}\n… (+${s.length - max} chars)` : s;

/* --------------------------------- hook ------------------------------------ */

export function useDuckyAgent() {
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  const isRunning = useDuckyStore((s) => s.isRunning);
  const pendingApproval = useDuckyStore((s) => s.pendingApproval);
  const pendingAsk = useDuckyStore((s) => s.pendingAsk);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    const st = useDuckyStore.getState();
    st.pendingApproval?.resolve(false);
    st.pendingAsk?.resolve({ _dismissed: 'true' });
  }, []);

  const respondApproval = useCallback((ok: boolean) => {
    const pa = useDuckyStore.getState().pendingApproval;
    if (!pa) return;
    useDuckyStore.getState().setPendingApproval(null);
    pa.resolve(ok);
  }, []);

  const respondAsk = useCallback((answers: Record<string, string>) => {
    const pa = useDuckyStore.getState().pendingAsk;
    if (!pa) return;
    useDuckyStore.getState().setPendingAsk(null);
    pa.resolve(answers);
  }, []);

  const send = useCallback(async (text: string): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed || runningRef.current) return;

    const st0 = useDuckyStore.getState();
    if (st0.isRunning) return;
    if (!st0.hydrated) {
      // localStorage may still be mid-rehydrate; give it one microtask tick.
      await Promise.resolve();
      if (!useDuckyStore.getState().hydrated) return;
    }

    /* ---------- session bookkeeping ---------- */
    let sessionId = useDuckyStore.getState().activeSessionId;
    if (!sessionId || !useDuckyStore.getState().sessions.some((s) => s.id === sessionId)) {
      sessionId = useDuckyStore.getState().newSession();
    }
    const sid = sessionId;
    const session = useDuckyStore.getState().sessions.find((s) => s.id === sid)!;

    const settings = useDuckyStore.getState().settings;
    const disabledPlugins = useDuckyStore.getState().disabledPlugins;
    const enabledPluginIds = resolveEnabledPluginIds(disabledPlugins);

    if (session.title === 'New task') {
      useDuckyStore.getState().renameSession(sid, trimmed.slice(0, 40));
    }

    /* ---------- history ---------- */
    const priorWire = toWireMessages(session.messages);
    const sysPrompt = buildSystemPrompt({
      files: Object.keys(session.workspace),
      workspaceTree: renderTree(session.workspace, '/'),
      projectName: session.projectName ?? null,
      todos: session.todos,
      planMode: session.planMode,
      planDraft: session.planDraft,
      systemPromptExtra: settings.systemPromptExtra,
      memoryBlock: renderMemoriesForPrompt(10),
      mcpBlock: renderMcpForPrompt(),
      disk: {
        status: useDiskStore.getState().status,
        rootName: useDiskStore.getState().rootName,
      },
      modelId: settings.model,
      baseUrl: settings.baseUrl,
    });
    const wireHistory: WireMessage[] = [
      { role: 'system', content: sysPrompt },
      ...priorWire,
      { role: 'user', content: trimmed },
    ];

    /* ---------- local chat records ---------- */
    useDuckyStore.getState().addMessage(sid, {
      id: uid(),
      role: 'user',
      content: trimmed,
      status: 'done',
      createdAt: Date.now(),
    });

    const controller = new AbortController();
    abortRef.current = controller;
    runningRef.current = true;
    useDuckyStore.getState().setIsRunning(true);

    /** assistant message for CURRENT model turn (one per loop iteration) */
    let currentAssistantId: string | null = null;
    let lastAssistantId: string | null = null;
    const toolMsgIdByCallId = new Map<string, string>();

    const ensureAssistant = (): string => {
      if (currentAssistantId) return currentAssistantId;
      const id = uid();
      currentAssistantId = id;
      lastAssistantId = id;
      useDuckyStore.getState().addMessage(sid, {
        id,
        role: 'assistant',
        content: '',
        reasoning: '',
        status: 'streaming',
        meta: { model: settings.model },
        createdAt: Date.now(),
      });
      return id;
    };

    const requestApprovalBridge = async (
      req: Omit<ApprovalRequest, 'id'> & { id?: string },
    ): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        useDuckyStore.getState().setPendingApproval({
          ...(req as ApprovalRequest),
          id: req.id ?? uid(),
          resolve: resolve,
        });
      });

    const askUserBridge = (questions: AskUserQuestion[]): Promise<string> =>
      new Promise<string>((resolve) => {
        useDuckyStore.getState().setPendingAsk({
          questions,
          resolve: (answers) => {
            const formatted = Object.entries(answers)
              .map(([id, answer]) => `${id}: ${String(answer)}`)
              .join('\n');
            resolve(`{${formatted}}`);
          },
        });
      });

    const onPlanExitBridge = async (): Promise<boolean> => {
      const draftPreview =
        useDuckyStore.getState().sessions.find((s) => s.id === sid)?.planDraft ?? '';
      const approved = await requestApprovalBridge({
        toolName: 'exit_plan_mode',
        argsPreview: draftPreview.trim()
          ? truncatePreview(draftPreview, 1200)
          : 'The plan was presented in the conversation above.',
        reason: 'Approving ends plan mode and unlocks write tools.',
      });
      if (approved) useDuckyStore.getState().setPlanMode(sid, false);
      return approved;
    };

    const handleEvent: RunLoopOptionsExt['onEvent'] = (e) => {
      const store = useDuckyStore.getState();
      switch (e.type) {
        case 'iteration':
          currentAssistantId = null; // next deltas stream into a fresh bubble
          if (e.n > 1) {
            void e.n;
          }
          break;

        case 'text-delta':
          store.appendMessageText(sid, ensureAssistant(), e.delta);
          break;

        case 'reasoning-delta':
          store.appendMessageReasoning(sid, ensureAssistant(), e.delta);
          break;

        case 'tool-call-start': {
          const assistantId = lastAssistantId ?? ensureAssistant();
          // attach the call to the emitting assistant message for faithful replay
          const assistantMsg = store.sessions
            .find((s) => s.id === sid)
            ?.messages.find((m) => m.id === assistantId);
          const callData: ToolCallData = {
            id: e.callId,
            type: 'function',
            function: { name: e.name, arguments: e.argsRaw },
          };
          store.patchMessage(sid, assistantId, {
            toolCalls: [...(assistantMsg?.toolCalls ?? []), callData],
          });

          const toolMsgId = uid();
          toolMsgIdByCallId.set(e.callId, toolMsgId);
          let preview = e.argsRaw;
          try {
            preview = JSON.stringify(JSON.parse(e.argsRaw), null, 2);
          } catch {
            // raw string is fine
          }
          store.addMessage(sid, {
            id: toolMsgId,
            role: 'tool',
            content: truncatePreview(preview || '{}'),
            toolCallId: e.callId,
            toolName: e.name,
            status: 'streaming',
            createdAt: Date.now(),
          });
          break;
        }

        case 'tool-call-end': {
          store.bumpStats(sid, { toolCalls: 1 });
          const msgId = toolMsgIdByCallId.get(e.callId);
          if (msgId) {
            store.patchMessage(sid, msgId, {
              content: e.result,
              durationMs: e.durationMs,
              status: e.ok ? 'done' : 'error',
              error: e.ok ? undefined : e.result,
            });
          }
          break;
        }

        case 'approval-request':
          // The promise bridge (requestApprovalBridge) owns UX; nothing to render here.
          break;

        case 'usage':
          store.bumpStats(sid, {
            promptTokens: e.promptTokens ?? 0,
            completionTokens: e.completionTokens ?? 0,
          });
          if (lastAssistantId && (e.promptTokens != null || e.completionTokens != null)) {
            store.patchMessage(sid, lastAssistantId, {
              meta: {
                model: settings.model,
                promptTokens: e.promptTokens,
                completionTokens: e.completionTokens,
              },
            });
          }
          break;

        case 'error': {
          const aid = ensureAssistant();
          const existing = store.sessions.find((s) => s.id === sid)?.messages.find((m) => m.id === aid);
          // Keep any streamed prose, but never duplicate the message into
          // content — the error Alert below renders `error` exactly once.
          store.patchMessage(sid, aid, {
            content: existing?.content ?? '',
            status: 'error',
            error: e.message,
          });
          break;
        }

        case 'done':
          if (lastAssistantId) {
            const existing = store.sessions
              .find((s) => s.id === sid)
              ?.messages.find((m) => m.id === lastAssistantId);
            if (existing?.status === 'streaming' || existing?.status === undefined) {
              store.patchMessage(sid, lastAssistantId, {
                status: e.aborted ? 'aborted' : 'done',
                content: existing?.content || (e.aborted ? '(stopped before any output)' : ''),
              });
            }
          }
          break;
      }
    };

    // BYOK guard: the user needs their own connection (or a live server
    // fallback) AND a model id before anything is sent.
    const missing: string[] = [];
    if (settings.apiKey.trim() === '' && !isServerLive()) missing.push('API key');
    if (settings.baseUrl.trim() === '' && !isServerLive()) missing.push('base URL');
    if (settings.model.trim() === '' && !isModelIdSet()) missing.push('model');
    if (missing.length > 0) {
      useDuckyStore.getState().addMessage(sid, {
        id: uid(),
        role: 'assistant',
        content:
          `**Connection incomplete — missing ${missing.join(', ')}.**\n\n` +
          'Open Settings → Connections and add your OpenAI-compatible endpoint:\n\n' +
          '- **Base URL** (e.g. `https://api.example.com/v1`)\n' +
          '- **API key** (yours — stored only in this browser)\n' +
          '- **Model** (use Discover to list what your endpoint serves, then Test)\n\n' +
          'Or set `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL_ID` as server env vars once for everyone.',
        reasoning: '',
        status: 'error',
        error: `Connection incomplete (missing ${missing.join(', ')}).`,
        meta: { model: settings.model },
        createdAt: Date.now(),
      });
      // mirror the finally-block cleanup since we return before the try
      runningRef.current = false;
      useDuckyStore.getState().setIsRunning(false);
      useDuckyStore.getState().setPendingApproval(null);
      useDuckyStore.getState().setPendingAsk(null);
      abortRef.current = null;
      return;
    }

    try {
      await runAgentLoop({
        sessionId: sid,
        settings,
        messages: wireHistory,
        tools: buildToolSchemas(enabledPluginIds),
        executors: buildExecutors({
          sessionId: sid,
          settings,
          signal: controller.signal,
          onEvent: handleEvent,
        }),
        onEvent: handleEvent,
        signal: controller.signal,
        requestApproval: requestApprovalBridge,
        askUser: askUserBridge,
        onPlanExit: onPlanExitBridge,
        planModeActive: session.planMode,
      });
    } catch (e) {
      // Engine already reports structured errors; this guards against listener crashes.
      const store = useDuckyStore.getState();
      const aid = ensureAssistant();
      store.patchMessage(sid, aid, {
        content: `Engine failure: ${(e as Error).message}`,
        status: 'error',
        error: (e as Error).message,
      });
    } finally {
      runningRef.current = false;
      useDuckyStore.getState().setIsRunning(false);
      useDuckyStore.getState().setPendingApproval(null);
      useDuckyStore.getState().setPendingAsk(null);
      abortRef.current = null;
    }
  }, []);

  return {
    send,
    stop,
    running: isRunning,
    approval: pendingApproval,
    /** alias consumed by the UI side */
    pendingApproval: pendingApproval,
    ask: pendingAsk,
    /** alias consumed by the UI side */
    pendingAsk: pendingAsk,
    respondApproval,
    respondAsk,
  };
}
