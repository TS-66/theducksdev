/**
 * DSH Web — plugin registry, tool definitions and executor builders.
 *
 * Mirrors the "everything is a plugin" architecture of
 * deepseek-ai/deepseek-harness: each shipped tool lives behind a fake-npm
 * package name (`@deepseek-ai/dsh-tool-*`); toggling a plugin removes its
 * tools from the model-facing schema. Tool names/schemas are modelled on the
 * upstream docs/tool-catalog.md.
 */

import type {
  PluginManifest,
  ToolDefinition,
  TodoItem,
} from './types';
import { runShellCommand } from './tools-bash';
import {
  formatGrepOutput,
  formatReadWindow,
  grepMatches,
  matchGlob,
  normalizePath,
} from './tools-vfs';

export const PLUGIN_PREFIX = '@deepseek-ai/';

/* ------------------------------- manifests -------------------------------- */

/** Shipped plugin catalogue, mirroring upstream package names. */
export const PLUGINS: PluginManifest[] = [
  {
    id: `${PLUGIN_PREFIX}dsh-tool-fs`,
    name: 'dsh-tool-fs',
    version: '1.0.0',
    description:
      'Core filesystem tools (read_file / write_file / edit_file) over the session workspace. Because everything is a plugin in dsh, dropping this package swaps out file IO wholesale.',
    tools: ['read_file', 'write_file', 'edit_file'],
    category: 'filesystem',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}dsh-tool-fs-search`,
    name: 'dsh-tool-fs-search',
    version: '1.0.0',
    description:
      'Workspace discovery: glob for path patterns and ripgrep-style grep over contents. Plugins like this one compose cleanly — install search without mutating tools.',
    tools: ['glob', 'grep'],
    category: 'filesystem',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}dsh-tool-bash`,
    name: 'dsh-tool-bash',
    version: '1.0.0',
    description:
      'Runs a simulated bash session backed by the virtual workspace (ls/cat/grep/find/tree plus chaining and redirection). One plugin among many — the harness treats it exactly like every other capability.',
    tools: ['bash'],
    category: 'shell',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}dsh-tool-todo`,
    name: 'dsh-tool-todo',
    version: '1.0.0',
    description:
      'Maintains the shared task checklist surfaced in the UI; the latest todo_write wins. A tiny demonstration that even planning is just another plugin.',
    tools: ['todo_write'],
    category: 'planning',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}dsh-plan-mode`,
    name: 'dsh-plan-mode',
    version: '1.0.0',
    description:
      'Plan mode support: while active the agent may only explore read-only; exit_plan_mode presents the plan for human review before any execution is allowed.',
    tools: ['exit_plan_mode'],
    category: 'meta',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}dsh-tool-subagent`,
    name: 'dsh-tool-subagent',
    version: '1.0.0',
    description:
      'Delegates a focused task to a fresh child agent with its own context, reporting results back to the parent loop. Disabled by default — enable it when you want parallel-style decomposition.',
    tools: ['subagent'],
    category: 'delegation',
    defaultEnabled: false,
  },
  {
    id: `${PLUGIN_PREFIX}dsh-tool-web`,
    name: 'dsh-tool-web',
    version: '1.0.0',
    description:
      'Web access through server-proxied web_search and web_fetch tools, mirroring upstream network tooling while keeping browser CORS safe.',
    tools: ['web_search', 'web_fetch'],
    category: 'web',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}dsh-tool-ask-user`,
    name: 'dsh-tool-ask-user',
    version: '1.0.0',
    description:
      'Pauses the loop and surfaces structured questions with optional choices to the human; answers return as the tool result. Interaction itself is plugin-shaped in dsh.',
    tools: ['ask_user_question'],
    category: 'interaction',
    defaultEnabled: true,
  },
];

/** Plugin ids enabled by default once `disabledPlugins` is empty-ish. */
export const DEFAULT_DISABLED_PLUGINS: string[] = PLUGINS.filter(
  (p) => !p.defaultEnabled,
).map((p) => p.id);

/** Resolve the set of enabled plugin ids given the user's disabled list. */
export function resolveEnabledPluginIds(disabledPlugins: string[]): string[] {
  return PLUGINS.filter((p) => !disabledPlugins.includes(p.id)).map((p) => p.id);
}

/* ---------------------------- tool definitions ----------------------------- */

/** Structured choice rendered by the interactive question dialog. */
export interface AskUserQuestionOption {
  label: string;
  description?: string;
}

/** One question of an `ask_user_question` payload (mirrors upstream schema). */
export interface AskUserQuestion {
  /** Stable id echoed back in the answers map. */
  id: string;
  question: string;
  /** Optional short heading such as "Confirm" or "Choose Mode". */
  header?: string;
  /** Optional choices shown to the user. */
  options?: AskUserQuestionOption[];
  /** Whether the user may pick more than one option (joined with ", "). */
  multi_select?: boolean;
}

const obj = (
  properties: Record<string, unknown>,
  required: string[],
): Record<string, unknown> => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const str = (description: string): Record<string, unknown> => ({ type: 'string', description });
const bool = (description: string): Record<string, unknown> => ({ type: 'boolean', description });
const num = (description: string): Record<string, unknown> => ({ type: 'number', description });

/**
 * All shipped tool definitions, each mapped to its owning plugin.
 * Descriptions are adapted from upstream docs/tool-catalog.md.
 */
export function buildToolDefinitions(): ToolDefinition[] {
  const byPlugin = (pluginId: string) => PLUGINS.find((p) => p.id === pluginId)!;

  interface DefSpec {
    name: string;
    pluginId: string;
    description: string;
    parameters: Record<string, unknown>;
    sideEffects?: boolean;
  }

  const specs: DefSpec[] = [
    {
      name: 'read_file',
      pluginId: byPlugin(`${PLUGIN_PREFIX}dsh-tool-fs`).id,
      description:
        'Read a UTF-8 text file from the session workspace and return line-numbered content. Reads are free — prefer reading before writing or editing any file you did not create.',
      parameters: obj(
        {
          path: str('Workspace-relative path of the file to read.'),
          offset: num('1-based first line to return. Defaults to 1.'),
          limit: num('Maximum number of lines to return. Defaults to 2000.'),
        },
        ['path'],
      ),
    },
    {
      name: 'write_file',
      pluginId: byPlugin(`${PLUGIN_PREFIX}dsh-tool-fs`).id,
      description:
        'Create or fully replace a UTF-8 text file in the session workspace. Read-before-write etiquette applies: read an existing file before overwriting so you preserve unrelated content.',
      parameters: obj(
        {
          path: str('Workspace-relative path to write.'),
          content: str('Full UTF-8 text content to write. Parent directories are implicit.'),
        },
        ['path', 'content'],
      ),
      sideEffects: true,
    },
    {
      name: 'edit_file',
      pluginId: byPlugin(`${PLUGIN_PREFIX}dsh-tool-fs`).id,
      description:
        'Edit an existing workspace file by replacing literal text. Read the file first: old_str must match exactly and, unless replace_all is set, must appear exactly once.',
      parameters: obj(
        {
          path: str('Workspace-relative path to edit.'),
          old_str: str('Literal text to replace. Must match exactly.'),
          new_str: str('Literal replacement text. Use an empty string to delete the match.'),
          replace_all: bool('Replace all occurrences. Defaults to false.'),
        },
        ['path', 'old_str', 'new_str'],
      ),
      sideEffects: true,
    },
    {
      name: 'glob',
      pluginId: byPlugin(`${PLUGIN_PREFIX}dsh-tool-fs-search`).id,
      description:
        'Find files whose paths match a glob pattern (*, **, ?, {a,b}). Returns matching file paths, sorted. Does not enumerate directory entries on its own.',
      parameters: obj(
        {
          pattern: str('Glob pattern, e.g. "**/*.ts". Patterns without "/" match basenames at any depth.'),
          path: str('Directory to search in. Defaults to the workspace root.'),
        },
        ['pattern'],
      ),
    },
    {
      name: 'grep',
      pluginId: byPlugin(`${PLUGIN_PREFIX}dsh-tool-fs-search`).id,
      description:
        'Search file contents with a regular expression. Returns matching lines with numbers, grouped by file, capped at max_results matches.',
      parameters: obj(
        {
          pattern: str('Regular expression to search for.'),
          path: str('File or directory to search. Defaults to the whole workspace.'),
          max_results: num('Maximum matches returned. Defaults to 250.'),
        },
        ['pattern'],
      ),
    },
    {
      name: 'bash',
      pluginId: byPlugin(`${PLUGIN_PREFIX}dsh-tool-bash`).id,
      description:
        'Runs a command in a simulated shell backed by the session workspace (pwd/cd/ls/cat/head/tail/echo/touch/mkdir/rm/mv/cp/wc/find/tree/date/whoami/uname/grep, with && || ; chaining, pipes and > >> redirection). Non-zero exits are reported as [exit code: N].',
      parameters: obj(
        {
          command: str('The command line to execute.'),
          timeout_ms: num('Soft timeout hint in milliseconds (the simulated shell executes synchronously and caps output instead).'),
        },
        ['command'],
      ),
      sideEffects: true,
    },
    {
      name: 'todo_write',
      pluginId: byPlugin(`${PLUGIN_PREFIX}dsh-tool-todo`).id,
      description:
        'Replace the session task checklist shown in the UI. Provide the FULL updated list each time; keep items concise and imperative.',
      parameters: obj(
        {
          todos: {
            type: 'array',
            description: 'Complete list of todo items after this update.',
            items: {
              type: 'object',
              properties: {
                content: str('Short imperative description of the task.'),
                status: {
                  type: 'string',
                  enum: ['pending', 'in_progress', 'completed', 'cancelled'],
                  description: 'Current status of this item.',
                },
              },
              required: ['content', 'status'],
            },
          },
        },
        ['todos'],
      ),
    },
    {
      name: 'exit_plan_mode',
      pluginId: byPlugin(`${PLUGIN_PREFIX}dsh-plan-mode`).id,
      description:
        'Signals the plan is ready for review: hands control to the user, who may approve the plan (ending plan mode and unlocking write tools) or send feedback to keep planning.',
      parameters: obj({}, []),
    },
    {
      name: 'subagent',
      pluginId: byPlugin(`${PLUGIN_PREFIX}dsh-tool-subagent`).id,
      description:
        'Delegates a focused task to a fresh child agent with its own context window; the child returns a concise report. Use for bounded research or refactor subtasks that would bloat your own context.',
      parameters: obj(
        {
          objective: str('Self-contained statement of what the child agent must accomplish.'),
          hints: str('Optional extra guidance: files to inspect, style constraints, expected shape of the answer.'),
        },
        ['objective'],
      ),
      sideEffects: true,
    },
    {
      name: 'web_search',
      pluginId: byPlugin(`${PLUGIN_PREFIX}dsh-tool-web`).id,
      description:
        'Search the public web and receive ranked results (title, url, snippet). Use when facts may be newer than training data or verification is needed.',
      parameters: obj(
        {
          query: str('Search query, phrased naturally.'),
          num: num('Number of results, 1-20. Defaults to 8.'),
        },
        ['query'],
      ),
    },
    {
      name: 'web_fetch',
      pluginId: byPlugin(`${PLUGIN_PREFIX}dsh-tool-web`).id,
      description:
        'Fetch a URL server-side and return its readable text content (HTML stripped, capped at ~8000 characters). Prefer known-stable URLs from web_search results.',
      parameters: obj({ url: str('Absolute http(s) URL to fetch.') }, ['url']),
    },
    {
      name: 'ask_user_question',
      pluginId: byPlugin(`${PLUGIN_PREFIX}dsh-tool-ask-user`).id,
      description:
        'Ask the user one or more concise questions when you need confirmation, a choice or missing information before proceeding. Each question carries a stable id echoed back in the answer.',
      parameters: obj(
        {
          questions: {
            type: 'array',
            description: 'Questions to ask before continuing.',
            items: {
              type: 'object',
              properties: {
                id: str('Stable id for this question; echoed in the answer.'),
                question: str('The specific question to ask.'),
                header: str('Optional short heading, e.g. "Confirm" or "Choose Mode".'),
                options: {
                  type: 'array',
                  description: 'Optional choices to show. Put a recommended option first.',
                  items: {
                    type: 'object',
                    properties: {
                      label: str('Short user-facing option label.'),
                      description: str('One sentence explaining the tradeoff.'),
                    },
                    required: ['label'],
                  },
                },
                multi_select: bool('Whether the user may select more than one option. Defaults to false.'),
              },
              required: ['id', 'question'],
            },
          },
        },
        ['questions'],
      ),
    },
  ];

  return specs.map((s) => ({
    name: s.name,
    pluginId: s.pluginId,
    description: s.description,
    parameters: s.parameters,
    ...(s.sideEffects ? { sideEffects: true } : {}),
  }));
}

let definitionCache: Map<string, ToolDefinition> | null = null;

/** Module-scoped registry used by the agent loop for policy lookups. */
export function getToolDefinition(name: string): ToolDefinition | undefined {
  if (!definitionCache) {
    definitionCache = new Map(buildToolDefinitions().map((d) => [d.name, d]));
  }
  return definitionCache.get(name);
}

/* --------------------------- executor builders ----------------------------- */

/**
 * Execution context handed to every tool executor; wired up per-session by
 * the engine (agent-loop.buildExecutors) against the zustand store.
 */
export interface ToolExecutionContext {
  sessionId: string;
  readFile(path: string): string | null;
  writeFile(path: string, content: string): void;
  deleteFileEntry(path: string): boolean;
  listWorkspaceFiles(): string[];
  /** full path→content snapshot (copies are cheap at vFS scale) */
  readWorkspaceSnapshot(): Record<string, string>;
  /** current shell working dir */
  getCwd(): string;
  setCwd(cwd: string): void;
  /** commit a batched vFS mutation (used by the shell interpreter) */
  syncWorkspace(next: Record<string, string>): void;
  setTodos(todos: TodoItem[]): void;
  webSearch(query: string, num?: number): Promise<string>;
  webFetch(url: string): Promise<string>;
}

export type ToolExecutor = (args: Record<string, unknown>) => Promise<string>;
export type ToolExecutorBuilder = (ctx: ToolExecutionContext) => ToolExecutor;

const asString = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const asNumber = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/* args coercion helpers for typed executors above */

/**
 * Executor implementations keyed by tool name. `subagent`, `ask_user_question`
 * and `exit_plan_mode` are intentionally absent: the agent loop special-cases
 * them before generic dispatch (they need humans / child loops).
 */
export const TOOL_EXECUTOR_BUILDERS: Record<string, ToolExecutorBuilder> = {
  read_file:
    (ctx) =>
    async (args) => {
      const p = normalizePath(asString(args.path));
      const content = ctx.readFile(p);
      if (content === null) throw new Error(`File not found: ${p || '/'}`);
      const offset = asNumber(args.offset) ?? 1;
      const limit = asNumber(args.limit) ?? 2000;
      return formatReadWindow(content, offset, limit);
    },

  write_file:
    (ctx) =>
    async (args) => {
      const p = normalizePath(asString(args.path));
      if (!p) throw new Error('write_file: "path" must be a non-empty workspace-relative path');
      const content = asString(args.content);
      ctx.writeFile(p, content);
      return `Wrote ${content.length} bytes to ${p}`;
    },

  edit_file:
    (ctx) =>
    async (args) => {
      const p = normalizePath(asString(args.path));
      const content = ctx.readFile(p);
      if (content === null) throw new Error(`File not found: ${p || '/'} (read it first)`);
      const oldStr = asString(args.old_str);
      const newStr = asString(args.new_str);
      if (!oldStr) throw new Error('edit_file: "old_str" must be a non-empty literal string');
      const replaceAll = args.replace_all === true;
      let count = 0;
      let idx = content.indexOf(oldStr);
      while (idx !== -1) {
        count++;
        idx = content.indexOf(oldStr, idx + Math.max(1, oldStr.length));
      }
      if (count === 0) throw new Error(`edit_file: old_str not found in ${p}. Read the file to confirm exact text.`);
      if (count > 1 && !replaceAll) {
        throw new Error(
          `edit_file: old_str appears ${count} times in ${p}; provide more surrounding context or set replace_all=true.`,
        );
      }
      const next = replaceAll ? content.split(oldStr).join(newStr) : content.replace(oldStr, newStr);
      ctx.writeFile(p, next);
      return `Edited ${p}: ${replaceAll ? count : 1} replacement(s) applied.`;
    },

  glob:
    (ctx) =>
    async (args) => {
      const pattern = asString(args.pattern);
      if (!pattern) throw new Error('glob: "pattern" is required');
      const base = normalizePath(asString(args.path));
      const hits = matchGlob(ctx.readWorkspaceSnapshot(), pattern, base).sort();
      if (!hits.length) return `No files matched ${pattern}${base ? ` under ${base}/` : ''}.`;
      const cap = 100;
      return [
        ...hits.slice(0, cap),
        ...(hits.length > cap ? [`… +${hits.length - cap} more`] : []),
      ].join('\n');
    },

  grep:
    (ctx) =>
    async (args) => {
      const pattern = asString(args.pattern);
      if (!pattern) throw new Error('grep: "pattern" is required');
      const maxResults = Math.min(500, Math.max(1, asNumber(args.max_results) ?? 250));
      try {
        const matches = grepMatches(ctx.readWorkspaceSnapshot(), {
          pattern,
          path: normalizePath(asString(args.path)),
          maxResults,
        });
        return formatGrepOutput(matches, maxResults);
      } catch (e) {
        throw new Error(`grep: invalid regular expression: ${(e as Error).message}`);
      }
    },

  bash:
    (ctx) =>
    async (args) => {
      const command = asString(args.command).trim();
      if (!command) throw new Error('bash: "command" is required');
      void asNumber(args.timeout_ms); // accepted for schema compatibility; interpreter is synchronous
      const snapshot: Record<string, string> = { ...ctx.readWorkspaceSnapshot() };
      const result = runShellCommand(command, snapshot, ctx.getCwd());
      ctx.syncWorkspace(snapshot);
      ctx.setCwd(result.cwd);
      return result.stdout;
    },

  todo_write:
    (ctx) =>
    async (args) => {
      const raw = Array.isArray(args.todos) ? args.todos : null;
      if (!raw) throw new Error('todo_write: "todos" array is required');
      const VALID = new Set(['pending', 'in_progress', 'completed', 'cancelled']);
      const todos: TodoItem[] = [];
      raw.forEach((item, i) => {
        const rec = item as Record<string, unknown>;
        const content = asString(rec.content).trim();
        const status = asString(rec.status);
        if (!content) throw new Error(`todo_write: item ${i} is missing "content"`);
        if (!VALID.has(status)) throw new Error(`todo_write: item ${i} has invalid status "${status}"`);
        todos.push({ content, status: status as TodoItem['status'] });
      });
      ctx.setTodos(todos);
      const counts = {
        pending: todos.filter((t) => t.status === 'pending').length,
        in_progress: todos.filter((t) => t.status === 'in_progress').length,
        completed: todos.filter((t) => t.status === 'completed').length,
        cancelled: todos.filter((t) => t.status === 'cancelled').length,
      };
      return `Checklist updated (${todos.length} items): ${counts.in_progress} in progress, ${counts.completed} completed, ${counts.pending} pending.`;
    },

  web_search:
    (ctx) =>
    async (args) => {
      const query = asString(args.query).trim();
      if (!query) throw new Error('web_search: "query" is required');
      return ctx.webSearch(query, asNumber(args.num));
    },

  web_fetch:
    (ctx) =>
    async (args) => {
      const url = asString(args.url).trim();
      if (!/^https?:\/\//i.test(url)) throw new Error('web_fetch: "url" must be an absolute http(s) URL');
      return ctx.webFetch(url);
    },
};
