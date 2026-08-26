/**
 * DSH Web — client state.
 *
 * Zustand v5 store persisted to localStorage (`dsh-web-store-v1`): sessions
 * (messages + virtual workspace + todos + plan mode), settings and the plugin
 * disable-list. Transient keys (running/approvals) are excluded from
 * persistence. The engine binds tool executors directly to this store.
 *
 * Session shape mirrors deepseek-harness persisted sessions (events =
 * messages here); workspace is an S3-style path→content map.
 */

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type {
  ApprovalRequest,
  ChatMessage,
  Settings,
  StoredState,
  TodoItem,
} from './types';
import { SEED_WORKSPACE } from './workspace-seed';
import { normalizePath } from './tools-vfs';
import type { AskUserQuestion } from './plugins';

export type { AskUserQuestion };

/* ------------------------------- helpers ---------------------------------- */

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export const cloneSeedWorkspace = (): Record<string, string> => ({ ...SEED_WORKSPACE });

const newSessionObj = () => ({
  id: uid(),
  title: 'New task',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  starred: false,
  messages: [] as ChatMessage[],
  workspace: cloneSeedWorkspace(),
  todos: [] as TodoItem[],
  planMode: false,
  planDraft: undefined as string | undefined,
  stats: { promptTokens: 0, completionTokens: 0, toolCalls: 0 },
});

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  temperature: 1,
  maxTokens: 8192,
  policy: 'auto',
  systemPromptExtra: '',
  maxToolIterations: 25,
  showReasoning: true,
  demoMode: false,
};

/* --------------------------- throttled persistence -------------------------- */

/**
 * Write-through debounced storage so token-delta spam doesn't hammer
 * localStorage on every keystroke. Real writes flush after ~400ms idle or on
 * pagehide/visibilitychange.
 */
function createThrottledWindowStorage(maxDelayMs = 400): StateStorage {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const pending = new Map<string, string>();

  const flush = (): void => {
    timer = null;
    for (const [k, v] of pending) {
      try {
        window.localStorage.setItem(k, v);
      } catch {
        // quota exceeded — drop silently; session keeps working in memory
      }
    }
    pending.clear();
  };

  const schedule = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, maxDelayMs);
  };

  if (typeof window !== 'undefined') {
    const flushOnLeave = () => {
      if (timer !== null) flush();
    };
    window.addEventListener('pagehide', flushOnLeave);
    window.addEventListener('beforeunload', flushOnLeave);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushOnLeave();
    });
  }

  return {
    getItem: (name) =>
      typeof window === 'undefined'
        ? null
        : pending.has(name)
          ? pending.get(name)!
          : window.localStorage.getItem(name),
    setItem: (name, value) => {
      if (typeof window === 'undefined') return;
      pending.set(name, value);
      schedule();
    },
    removeItem: (name) => {
      if (typeof window === 'undefined') return;
      pending.delete(name);
      try {
        window.localStorage.removeItem(name);
      } catch {
        // noop
      }
    },
  };
}

/* --------------------------------- store ----------------------------------- */

interface DshActions {
  newSession(): string;
  selectSession(id: string): void;
  deleteSession(id: string): void;
  renameSession(id: string, title: string): void;
  toggleStar(id: string): void;
  /** Deep-copy messages/workspace/todos/stats into a fresh session; selects it. Returns the new id ("" if source missing). */
  duplicateSession(id: string): string;
  clearAllSessions(): void;
  /** Compatibility alias expected by the UI side: clears messages + todos, keeps the session. */
  clearSession(sessionId: string): void;
  /** Compatibility alias for {@link resetWorkspaceToSeed}. */
  resetWorkspace(sessionId: string): void;

  addMessage(sessionId: string, msg: ChatMessage): void;
  patchMessage(sessionId: string, id: string, patch: Partial<ChatMessage>): void;
  appendMessageText(sessionId: string, id: string, delta: string): void;
  appendMessageReasoning(sessionId: string, id: string, delta: string): void;

  writeFile(sessionId: string, path: string, content: string): void;
  getFile(sessionId: string, path: string): string | null;
  listWorkspaceFiles(sessionId: string): string[];
  readWorkspaceSnapshot(sessionId: string): Record<string, string>;
  replaceWorkspace(sessionId: string, workspace: Record<string, string>): void;
  deleteFileEntry(sessionId: string, path: string): boolean;
  resetWorkspaceToSeed(sessionId: string): void;

  setTodos(sessionId: string, todos: TodoItem[]): void;
  setPlanMode(sessionId: string, on: boolean): void;
  setPlanDraft(sessionId: string, draft: string): void;
  bumpStats(
    sessionId: string,
    patch: { promptTokens?: number; completionTokens?: number; toolCalls?: number },
  ): void;

  updateSettings(patch: Partial<Settings>): void;
  togglePlugin(pluginId: string): void;

  setIsRunning(v: boolean): void;
  setPendingApproval(req: (ApprovalRequest & { resolve: (b: boolean) => void }) | null): void;
  setPendingAsk(
    q: { questions: AskUserQuestion[]; resolve: (a: Record<string, string>) => void } | null,
  ): void;
  setHydrated(): void;
}

export type DshStore = StoredState &
  DshActions & {
    /* transient */
    isRunning: boolean;
    pendingApproval: (ApprovalRequest & { resolve: (b: boolean) => void }) | null;
    pendingAsk: {
      questions: AskUserQuestion[];
      resolve: (a: Record<string, string>) => void;
    } | null;
    hydrated: boolean;
  };

const mapSession = (
  state: StoredState,
  sessionId: string,
  fn: (s: SessionMutable) => SessionMutable | void,
): StoredState => ({
  ...state,
  sessions: state.sessions.map((s) => {
    if (s.id !== sessionId) return s;
    const copy: SessionMutable = { ...s, messages: [...s.messages], stats: { ...s.stats }, workspace: s.workspace };
    const out = fn(copy) ?? copy;
    out.updatedAt = Date.now();
    return out;
  }),
});

/** Local mutable view used inside update recipes. */
type SessionMutable = StoredState['sessions'][number];

const touchMessageList = (s: SessionMutable, id: string, fn: (m: ChatMessage) => ChatMessage): void => {
  s.messages = s.messages.map((m) => (m.id === id ? fn(m) : m));
};

export const useDshStore = create<DshStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      settings: DEFAULT_SETTINGS,
      disabledPlugins: [],

      isRunning: false,
      pendingApproval: null,
      pendingAsk: null,
      hydrated: false,

      newSession(): string {
        const s = newSessionObj();
        set((st) => ({
          sessions: [s, ...st.sessions],
          activeSessionId: s.id,
        }));
        return s.id;
      },

      selectSession(id) {
        set({ activeSessionId: id });
      },

      deleteSession(id) {
        set((st) => {
          const sessions = st.sessions.filter((s) => s.id !== id);
          const activeSessionId = st.activeSessionId === id ? sessions[0]?.id ?? null : st.activeSessionId;
          return { sessions, activeSessionId };
        });
      },

      renameSession(id, title) {
        set((st) => mapSession(st, id, (s) => ({ ...s, title })));
      },

      toggleStar(id) {
        set((st) => mapSession(st, id, (s) => ({ ...s, starred: !s.starred })));
      },

      duplicateSession(id) {
        const src = get().sessions.find((s) => s.id === id);
        if (!src) return '';
        const copy = {
          id: uid(),
          title: `${src.title} (copy)`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          starred: false,
          messages: src.messages.map((m) => ({ ...m })),
          workspace: { ...src.workspace },
          todos: src.todos.map((t) => ({ ...t })),
          planMode: false, // duplicated session starts with write tools unlocked
          planDraft: undefined as string | undefined,
          stats: { ...src.stats },
        };
        set((st) => ({ sessions: [copy, ...st.sessions], activeSessionId: copy.id }));
        return copy.id;
      },

      clearAllSessions() {
        set({ sessions: [], activeSessionId: null });
      },

      clearSession(sessionId) {
        set((st) =>
          mapSession(st, sessionId, (s) => ({ ...s, messages: [], todos: [] })),
        );
      },

      resetWorkspace(sessionId) {
        set((st) => mapSession(st, sessionId, (s) => ({ ...s, workspace: cloneSeedWorkspace() })));
      },

      addMessage(sessionId, msg) {
        set((st) =>
          mapSession(st, sessionId, (s) => {
            s.messages.push(msg);
          }),
        );
      },

      patchMessage(sessionId, id, patch) {
        set((st) => mapSession(st, sessionId, (s) => touchMessageList(s, id, (m) => ({ ...m, ...patch }))));
      },

      appendMessageText(sessionId, id, delta) {
        if (!delta) return;
        set((st) =>
          mapSession(st, sessionId, (s) => touchMessageList(s, id, (m) => ({ ...m, content: m.content + delta }))),
        );
      },

      appendMessageReasoning(sessionId, id, delta) {
        if (!delta) return;
        set((st) =>
          mapSession(st, sessionId, (s) =>
            touchMessageList(s, id, (m) => ({ ...m, reasoning: (m.reasoning ?? '') + delta })),
          ),
        );
      },

      writeFile(sessionId, path, content) {
        const p = normalizePath(path);
        if (!p) return;
        set((st) =>
          mapSession(st, sessionId, (s) => {
            s.workspace = { ...s.workspace, [p]: content };
          }),
        );
      },

      getFile(sessionId, path) {
        const p = normalizePath(path);
        const sess = get().sessions.find((s) => s.id === sessionId);
        if (!sess || !p || !Object.prototype.hasOwnProperty.call(sess.workspace, p)) return null;
        return sess.workspace[p] ?? null;
      },

      listWorkspaceFiles(sessionId) {
        const sess = get().sessions.find((s) => s.id === sessionId);
        if (!sess) return [];
        return Object.keys(sess.workspace).sort();
      },

      readWorkspaceSnapshot(sessionId) {
        const sess = get().sessions.find((s) => s.id === sessionId);
        return sess ? { ...sess.workspace } : {};
      },

      replaceWorkspace(sessionId, workspace) {
        set((st) => mapSession(st, sessionId, (s) => ({ ...s, workspace: { ...workspace } })));
      },

      deleteFileEntry(sessionId, path) {
        const p = normalizePath(path);
        const sess = get().sessions.find((s) => s.id === sessionId);
        if (!p || !sess || !Object.prototype.hasOwnProperty.call(sess.workspace, p)) return false;
        set((st) =>
          mapSession(st, sessionId, (s) => {
            const next = { ...s.workspace };
            delete next[p];
            s.workspace = next;
          }),
        );
        return true;
      },

      resetWorkspaceToSeed(sessionId) {
        set((st) => mapSession(st, sessionId, (s) => ({ ...s, workspace: cloneSeedWorkspace() })));
      },

      setTodos(sessionId, todos) {
        set((st) => mapSession(st, sessionId, (s) => ({ ...s, todos: todos.map((t) => ({ ...t })) })));
      },

      setPlanMode(sessionId, on) {
        set((st) => mapSession(st, sessionId, (s) => ({ ...s, planMode: on })));
      },

      setPlanDraft(sessionId, draft) {
        set((st) => mapSession(st, sessionId, (s) => ({ ...s, planDraft: draft })));
      },

      bumpStats(sessionId, patch) {
        set((st) =>
          mapSession(st, sessionId, (s) => ({
            ...s,
            stats: {
              promptTokens: s.stats.promptTokens + Math.max(0, patch.promptTokens ?? 0),
              completionTokens: s.stats.completionTokens + Math.max(0, patch.completionTokens ?? 0),
              toolCalls: s.stats.toolCalls + Math.max(0, patch.toolCalls ?? 0),
            },
          })),
        );
      },

      updateSettings(patch) {
        set((st) => ({ settings: { ...st.settings, ...patch } }));
      },

      togglePlugin(pluginId) {
        set((st) => ({
          disabledPlugins: st.disabledPlugins.includes(pluginId)
            ? st.disabledPlugins.filter((id) => id !== pluginId)
            : [...st.disabledPlugins, pluginId],
        }));
      },

      setIsRunning(v) {
        set({ isRunning: v });
      },

      setPendingApproval(req) {
        set({ pendingApproval: req });
      },

      setPendingAsk(q) {
        set({ pendingAsk: q });
      },

      setHydrated() {
        set({ hydrated: true });
      },
    }),
    {
      name: 'dsh-web-store-v1',
      version: 1,
      storage: createJSONStorage(() => createThrottledWindowStorage()),
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
        settings: state.settings,
        disabledPlugins: state.disabledPlugins,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<StoredState>;
        return {
          ...current,
          sessions: Array.isArray(p.sessions) ? p.sessions : [],
          activeSessionId:
            typeof p.activeSessionId === 'string' && p.sessions?.some((s) => s.id === p.activeSessionId)
              ? p.activeSessionId
              : null,
          settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
          disabledPlugins: Array.isArray(p.disabledPlugins) ? p.disabledPlugins : [],
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);

/** Hydration-safe snapshot getter (safe during SSR: returns defaults pre-hydration). */
export function getDshSnapshot(): DshStore {
  return useDshStore.getState();
}
