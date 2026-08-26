'use client';

/**
 * DSH Web — orchestrator hook wiring the React UI to the agent engine.
 *
 * Owns: history → WireMessage conversion, system-prompt assembly (persona +
 * workspace snapshot + todo state + plan-mode block), AbortController
 * lifecycle, permission/question promise bridges, stats + title updates and
 * AgentEvent → ChatMessage mapping. Equivalent of upstream dsh's web UI
 * driver that feeds ctx.events back into its transcript view.
 */

import { useCallback, useRef } from 'react';
import { useDshStore } from '@/lib/dsh/store';
import {
  buildExecutors,
  buildToolSchemas,
  runAgentLoop,
  type RunLoopOptionsExt,
} from '@/lib/dsh/agent-loop';
import { PLUGINS, resolveEnabledPluginIds } from '@/lib/dsh/plugins';
import { renderTree } from '@/lib/dsh/tools-vfs';
import { demoEnabledToolNames, runDemoTurn } from '@/lib/dsh/demo-loop';
import { isDemoMode } from '@/lib/dsh/types';
import type { AskUserQuestion } from '@/lib/dsh/plugins';
import type {
  ApprovalRequest,
  ChatMessage,
  ToolCallData,
  WireMessage,
} from '@/lib/dsh/types';

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

function buildSystemPrompt(opts: {
  files: string[];
  workspaceTree: string;
  todos: Array<{ content: string; status: string }>;
  planMode: boolean;
  planDraft?: string;
  systemPromptExtra: string;
}): string {
  const now = new Date();
  const enabled = PLUGINS.filter((p) => !useDshStore.getState().disabledPlugins.includes(p.id));
  const lines: string[] = [
    'You are dsh, the DeepSeek Harness web agent — an everything-is-a-plugin coding harness running entirely in the browser.',
    'You operate against a virtual workspace seeded with a sample repository. Prefer tools over prose for any file inspection or mutation.',
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
  ];

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

export function useDshAgent() {
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  const isRunning = useDshStore((s) => s.isRunning);
  const pendingApproval = useDshStore((s) => s.pendingApproval);
  const pendingAsk = useDshStore((s) => s.pendingAsk);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    const st = useDshStore.getState();
    st.pendingApproval?.resolve(false);
    st.pendingAsk?.resolve({ _dismissed: 'true' });
  }, []);

  const respondApproval = useCallback((ok: boolean) => {
    const pa = useDshStore.getState().pendingApproval;
    if (!pa) return;
    useDshStore.getState().setPendingApproval(null);
    pa.resolve(ok);
  }, []);

  const respondAsk = useCallback((answers: Record<string, string>) => {
    const pa = useDshStore.getState().pendingAsk;
    if (!pa) return;
    useDshStore.getState().setPendingAsk(null);
    pa.resolve(answers);
  }, []);

  const send = useCallback(async (text: string): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed || runningRef.current) return;

    const st0 = useDshStore.getState();
    if (st0.isRunning) return;
    if (!st0.hydrated) {
      // localStorage may still be mid-rehydrate; give it one microtask tick.
      await Promise.resolve();
      if (!useDshStore.getState().hydrated) return;
    }

    /* ---------- session bookkeeping ---------- */
    let sessionId = useDshStore.getState().activeSessionId;
    if (!sessionId || !useDshStore.getState().sessions.some((s) => s.id === sessionId)) {
      sessionId = useDshStore.getState().newSession();
    }
    const sid = sessionId;
    const session = useDshStore.getState().sessions.find((s) => s.id === sid)!;

    const settings = useDshStore.getState().settings;
    const disabledPlugins = useDshStore.getState().disabledPlugins;
    const enabledPluginIds = resolveEnabledPluginIds(disabledPlugins);

    if (session.title === 'New task') {
      useDshStore.getState().renameSession(sid, trimmed.slice(0, 40));
    }

    /* ---------- history ---------- */
    const priorWire = toWireMessages(session.messages);
    const sysPrompt = buildSystemPrompt({
      files: Object.keys(session.workspace),
      workspaceTree: renderTree(session.workspace, '/'),
      todos: session.todos,
      planMode: session.planMode,
      planDraft: session.planDraft,
      systemPromptExtra: settings.systemPromptExtra,
    });
    const wireHistory: WireMessage[] = [
      { role: 'system', content: sysPrompt },
      ...priorWire,
      { role: 'user', content: trimmed },
    ];

    /* ---------- local chat records ---------- */
    useDshStore.getState().addMessage(sid, {
      id: uid(),
      role: 'user',
      content: trimmed,
      status: 'done',
      createdAt: Date.now(),
    });

    const controller = new AbortController();
    abortRef.current = controller;
    runningRef.current = true;
    useDshStore.getState().setIsRunning(true);

    /** assistant message for CURRENT model turn (one per loop iteration) */
    let currentAssistantId: string | null = null;
    let lastAssistantId: string | null = null;
    const toolMsgIdByCallId = new Map<string, string>();

    const ensureAssistant = (): string => {
      if (currentAssistantId) return currentAssistantId;
      const id = uid();
      currentAssistantId = id;
      lastAssistantId = id;
      useDshStore.getState().addMessage(sid, {
        id,
        role: 'assistant',
        content: '',
        reasoning: '',
        status: 'streaming',
        meta: { model: isDemoMode(settings) ? 'demo-script' : settings.model },
        createdAt: Date.now(),
      });
      return id;
    };

    const requestApprovalBridge = async (
      req: Omit<ApprovalRequest, 'id'> & { id?: string },
    ): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        useDshStore.getState().setPendingApproval({
          ...(req as ApprovalRequest),
          id: req.id ?? uid(),
          resolve: resolve,
        });
      });

    const askUserBridge = (questions: AskUserQuestion[]): Promise<string> =>
      new Promise<string>((resolve) => {
        useDshStore.getState().setPendingAsk({
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
      const approved = await requestApprovalBridge({
        toolName: 'exit_plan_mode',
        argsPreview: useDshStore.getState().sessions.find((s) => s.id === sid)?.planDraft
          ? 'Plan draft available in session state.'
          : 'The plan was presented in the conversation above.',
        reason: 'Approving ends plan mode and unlocks write tools.',
      });
      if (approved) useDshStore.getState().setPlanMode(sid, false);
      return approved;
    };

    const handleEvent: RunLoopOptionsExt['onEvent'] = (e) => {
      const store = useDshStore.getState();
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

    const demoActive = isDemoMode(settings);
    try {
      if (demoActive) {
        // Scripted demo engine: same event protocol, REAL tool executors.
        await runDemoTurn({
          sessionId: sid,
          settings,
          userText: trimmed,
          executors: buildExecutors({
            sessionId: sid,
            settings,
            signal: controller.signal,
            onEvent: handleEvent,
          }),
          enabledToolNames: demoEnabledToolNames(disabledPlugins),
          listFiles: () => useDshStore.getState().listWorkspaceFiles(sid),
          readFile: (p) => useDshStore.getState().getFile(sid, p),
          todos: session.todos,
          onEvent: handleEvent,
          signal: controller.signal,
        });
      } else {
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
      }
    } catch (e) {
      // Engine already reports structured errors; this guards against listener crashes.
      const store = useDshStore.getState();
      const aid = ensureAssistant();
      store.patchMessage(sid, aid, {
        content: `Engine failure: ${(e as Error).message}`,
        status: 'error',
        error: (e as Error).message,
      });
    } finally {
      runningRef.current = false;
      useDshStore.getState().setIsRunning(false);
      useDshStore.getState().setPendingApproval(null);
      useDshStore.getState().setPendingAsk(null);
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
