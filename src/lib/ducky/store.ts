/**
 * Ducky AI | Coder — client state.
 *
 * Zustand v5 store persisted to localStorage (`ducky-coder-store-v1`): sessions
 * (messages + virtual workspace + todos + plan mode), settings and the plugin
 * disable-list. Transient keys (running/approvals) are excluded from
 * persistence. The engine binds tool executors directly to this store.
 *
 * Session shape mirrors the Ducky harness persisted sessions (events =
 * messages here); workspace is an S3-style path→content map.
 */

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type {
  ApprovalRequest,
  ChatMessage,
  Project,
  Session,
  Settings,
  StoredState,
  TodoItem,
} from './types';
import { MODEL_ID } from './models';
import { PLUGINS } from './plugins';
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

/**
 * Build a fresh session. When a project is provided the session STARTS from a
 * copy of its files (and records the linkage); without one the workspace is
 * born EMPTY — no hidden sample repo, by design.
 */
const newSessionObj = (project: Project | null) => ({
  id: uid(),
  title: 'New task',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  starred: false,
  messages: [] as ChatMessage[],
  workspace: project ? { ...project.files } : ({} as Record<string, string>),
  projectId: project ? project.id : (null as string | null | undefined),
  projectName: project?.name as string | undefined,
  todos: [] as TodoItem[],
  planMode: false,
  planDraft: undefined as string | undefined,
  stats: { promptTokens: 0, completionTokens: 0, toolCalls: 0 },
});

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  baseUrl: '', // empty = use the server-configured endpoint (AI_BASE_URL env)
  model: MODEL_ID,
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
  /** Prepend pre-sanitized sessions (backup restore) and select the first one. */
  importSessions(items: Session[]): number;
  clearAllSessions(): void;
  /** Compatibility alias expected by the UI side: clears messages + todos, keeps the session. */
  clearSession(sessionId: string): void;
  /** Compatibility alias for {@link resetWorkspaceToSeed}. */
  resetWorkspace(sessionId: string): void;

  /** Create a project; selects it as the active project. Returns the id. */
  createProject(name: string, files?: Record<string, string>): string;
  /** Point new sessions at this project. */
  selectProject(id: string | null): void;
  renameProject(id: string, name: string): void;
  /** Remove a project. Sessions keep their workspace copies (historical). */
  deleteProject(id: string): void;
  /** Merge files into a project (import / agent writes back). */
  addFilesToProject(id: string, files: Record<string, string>): void;

  addMessage(sessionId: string, msg: ChatMessage): void;
  patchMessage(sessionId: string, id: string, patch: Partial<ChatMessage>): void;
  appendMessageText(sessionId: string, id: string, delta: string): void;
  appendMessageReasoning(sessionId: string, id: string, delta: string): void;

  writeFile(sessionId: string, path: string, content: string): void;
  getFile(sessionId: string, path: string): string | null;
  listWorkspaceFiles(sessionId: string): string[];
  readWorkspaceSnapshot(sessionId: string): Record<string, string>;
  replaceWorkspace(sessionId: string, workspace: Record<string, string>): void;
  /** hard-replace the message array (continue-from-here ledger action) */
  truncateSessionFrom(sessionId: string, messages: ChatMessage[]): void;
  deleteFileEntry(sessionId: string, path: string): boolean;
  /** Move a workspace file to a new path atomically (returns false when from-path missing or to-path collides). */
  renameFileEntry(sessionId: string, from: string, to: string): boolean;
  resetWorkspaceToSeed(sessionId: string): void;

  setTodos(sessionId: string, todos: TodoItem[]): void;
  setPlanMode(sessionId: string, on: boolean): void;
  setPlanDraft(sessionId: string, draft: string): void;
  /** Persist the URL list of the last live web_search for ordinal fetches. */
  setSessionSearchUrls(sessionId: string, urls: string[]): void;
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

/**
 * The workspace a session started with — the baseline "reset" restores to.
 * Resolution order: linked project files → empty (explicit no-project) →
 * classic seed (legacy sessions created before projects existed).
 */
function startingWorkspace(
  s: Pick<Session, 'projectId'>,
  projects: Project[],
): Record<string, string> {
  if (s.projectId != null) {
    const p = projects.find((x) => x.id === s.projectId);
    return p ? { ...p.files } : {};
  }
  if (s.projectId === null) return {};
  return cloneSeedWorkspace();
}

const touchMessageList = (s: SessionMutable, id: string, fn: (m: ChatMessage) => ChatMessage): void => {
  s.messages = s.messages.map((m) => (m.id === id ? fn(m) : m));
};

/**
 * Hero flow: an untouched active session (0 messages) instantly rebinds to
 * the given project (or none) so "pick/create project → type → send" starts
 * from ITS files. Conversations with history keep their workspace.
 */
function rebindEmptyActiveSession(
  st: StoredState,
  nextId: string | null,
): Session[] {
  const active = st.sessions.find((s) => s.id === st.activeSessionId);
  if (!active || active.messages.length > 0) return st.sessions;
  const project = nextId ? st.projects.find((p) => p.id === nextId) ?? null : null;
  return st.sessions.map((s) =>
    s.id === active.id
      ? {
          ...s,
          workspace: project ? { ...project.files } : {},
          projectId: project ? project.id : null,
          projectName: project?.name,
        }
      : s,
  );
}

export const useDuckyStore = create<DshStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      projects: [],
      activeProjectId: null,
      settings: DEFAULT_SETTINGS,
      disabledPlugins: [],

      isRunning: false,
      pendingApproval: null,
      pendingAsk: null,
      hydrated: false,

      /* ------------------------------ projects ---------------------------- */

      createProject(name, files) {
        const cleanName = name.trim() || 'my-project';
        const p: Project = {
          id: uid(),
          name: cleanName,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          files: files ? { ...files } : {},
        };
        set((st) => ({
          projects: [p, ...st.projects],
          activeProjectId: p.id,
          sessions: rebindEmptyActiveSession(st, p.id),
        }));
        return p.id;
      },

      selectProject(id) {
        const exists = id === null || get().projects.some((p) => p.id === id);
        const nextId = exists ? id : null;
        set((st) => ({
          activeProjectId: nextId,
          sessions: rebindEmptyActiveSession(st, nextId),
        }));
      },

      renameProject(id, name) {
        const clean = name.trim();
        if (!clean) return;
        set((st) => ({
          projects: st.projects.map((p) =>
            p.id === id ? { ...p, name: clean, updatedAt: Date.now() } : p,
          ),
          // keep session display snapshots in sync so labels never lie
          sessions: st.sessions.map((s) =>
            s.projectId === id ? { ...s, projectName: clean } : s,
          ),
        }));
      },

      deleteProject(id) {
        set((st) => ({
          projects: st.projects.filter((p) => p.id !== id),
          activeProjectId: st.activeProjectId === id ? null : st.activeProjectId,
        }));
      },

      addFilesToProject(id, files) {
        set((st) => ({
          projects: st.projects.map((p) =>
            p.id === id
              ? { ...p, files: { ...p.files, ...files }, updatedAt: Date.now() }
              : p,
          ),
        }));
      },

      /* ------------------------------ sessions ----------------------------- */

      newSession(): string {
        const pid = get().activeProjectId;
        const project = pid ? get().projects.find((p) => p.id === pid) ?? null : null;
        const s = newSessionObj(project);
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
          projectId: src.projectId,
          projectName: src.projectName,
          todos: src.todos.map((t) => ({ ...t })),
          planMode: false, // duplicated session starts with write tools unlocked
          planDraft: undefined as string | undefined,
          stats: { ...src.stats },
        };
        set((st) => ({ sessions: [copy, ...st.sessions], activeSessionId: copy.id }));
        return copy.id;
      },

      importSessions(items) {
        const valid = items.filter((s) => s && typeof s.id === 'string' && Array.isArray(s.messages));
        if (valid.length === 0) return 0;
        set((st) => ({
          sessions: [...valid, ...st.sessions],
          activeSessionId: valid[0].id,
        }));
        return valid.length;
      },

      clearAllSessions() {
        set({ sessions: [], activeSessionId: null });
      },

      clearSession(sessionId) {
        set((st) =>
          mapSession(st, sessionId, (s) => ({ ...s, messages: [], todos: [] })),
        );
      },

      /**
       * Restore the session's workspace to its starting point: the linked
       * project's files when one is attached, nothing for empty-start
       * sessions, and the classic seed for legacy (pre-projects) sessions.
       */
      resetWorkspace(sessionId) {
        set((st) =>
          mapSession(st, sessionId, (s) => ({ ...s, workspace: startingWorkspace(s, st.projects) })),
        );
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

      truncateSessionFrom(sessionId, messages) {
        set((st) =>
          mapSession(st, sessionId, (s) => {
            s.messages = messages;
            s.updatedAt = Date.now();
          }),
        );
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

      renameFileEntry(sessionId, from, to) {
        const src = normalizePath(from);
        const dst = normalizePath(to);
        const sess = get().sessions.find((s) => s.id === sessionId);
        if (
          !src ||
          !dst ||
          src === dst ||
          !sess ||
          !Object.prototype.hasOwnProperty.call(sess.workspace, src) ||
          Object.prototype.hasOwnProperty.call(sess.workspace, dst)
        )
          return false;
        set((st) =>
          mapSession(st, sessionId, (s) => {
            const next = { ...s.workspace };
            next[dst] = next[src];
            delete next[src];
            s.workspace = next;
          }),
        );
        return true;
      },

      resetWorkspaceToSeed(sessionId) {
        set((st) =>
          mapSession(st, sessionId, (s) => ({ ...s, workspace: startingWorkspace(s, st.projects) })),
        );
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

      setSessionSearchUrls(sessionId, urls) {
        const capped = urls.slice(0, 20);
        set((st) =>
          mapSession(st, sessionId, (s) => ({
            ...s,
            lastSearchUrls: capped.length > 0 ? capped : undefined,
          })),
        );
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
      name: 'ducky-coder-store-v1',
      version: 2,
      storage: createJSONStorage(() => createThrottledWindowStorage()),
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        settings: state.settings,
        disabledPlugins: state.disabledPlugins,
      }),
      /** v1 → v2: introduce projects (none are auto-created — no hidden sample). */
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<StoredState>;
        return {
          ...p,
          projects: Array.isArray(p.projects) ? p.projects : [],
          activeProjectId:
            typeof p.activeProjectId === 'string' ? p.activeProjectId : null,
        } as StoredState;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<StoredState>;
        const settings = { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) };
        // Rebrand migration: any unknown/legacy model id snaps to the single
        // shipped model — Ducky 3.5 Coder.
        if (settings.model !== MODEL_ID) settings.model = MODEL_ID;
        // Drop stale plugin ids that no longer exist in the registry.
        const knownIds = new Set(PLUGINS.map((pl) => pl.id));
        const projects = Array.isArray(p.projects)
          ? p.projects.filter(
              (x) =>
                x &&
                typeof x.id === 'string' &&
                typeof x.name === 'string' &&
                x.files &&
                typeof x.files === 'object',
            )
          : [];
        const sessions = Array.isArray(p.sessions) ? p.sessions : [];
        // Legacy stamping: pre-project sessions still carrying the sample repo
        // get a readable display name (no project entity is created).
        for (const s of sessions) {
          if (
            s &&
            s.projectId === undefined &&
            s.projectName === undefined &&
            s.workspace &&
            typeof s.workspace === 'object' &&
            Object.prototype.hasOwnProperty.call(s.workspace, 'src/greet.ts')
          ) {
            s.projectName = 'greeting-service';
          }
        }
        return {
          ...current,
          sessions,
          activeSessionId:
            typeof p.activeSessionId === 'string' && sessions.some((s) => s.id === p.activeSessionId)
              ? p.activeSessionId
              : null,
          projects,
          activeProjectId:
            typeof p.activeProjectId === 'string' && projects.some((x) => x.id === p.activeProjectId)
              ? p.activeProjectId
              : null,
          settings,
          disabledPlugins: Array.isArray(p.disabledPlugins)
            ? p.disabledPlugins.filter((id) => knownIds.has(id))
            : [],
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
  return useDuckyStore.getState();
}
