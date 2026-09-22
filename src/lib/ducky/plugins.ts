/**
 * Ducky AI | Coder — plugin registry, tool definitions and executor builders.
 *
 * "Everything is a plugin": each shipped tool lives behind a fake-npm
 * package name (`@ducky-ai/ducky-tool-*`); toggling a plugin removes its
 * tools from the model-facing schema.
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
import {
  describeDiskSupport,
  diskDelete,
  diskEdit,
  diskList,
  diskMkdir,
  diskRead,
  diskWrite,
  formatDiskListing,
  useDiskStore,
} from './disk';
import {
  applyEdits,
  b64decode,
  b64encode,
  dedupeLines,
  evaluateExpression,
  fileInfoSummary,
  getJsonPath,
  lineDiff,
  previewCsv,
  regexReplace,
  sha256Hex,
  sortLines,
} from './tools-extra';
import { getSkill, SKILLS } from './skills';
import { callMcpTool, listMcpServers, listMcpTools } from './mcp';
import { pcExec, pcList, pcRead, pcStatus, pcWrite } from './pc';
import { closeTab, getActiveTab, listTabs, openTab } from './browser-tabs';
import { captureScreenToWorkspace } from './screen';

export const PLUGIN_PREFIX = '@ducky-ai/';

/* ------------------------------- manifests -------------------------------- */

/** Shipped plugin catalogue, mirroring upstream package names. */
export const PLUGINS: PluginManifest[] = [
  {
    id: `${PLUGIN_PREFIX}ducky-tool-fs`,
    name: 'ducky-tool-fs',
    version: '1.0.0',
    description:
      'Core filesystem tools (read_file / write_file / edit_file) over the session workspace. Because everything is a plugin in ducky, dropping this package swaps out file IO wholesale.',
    tools: ['read_file', 'write_file', 'edit_file'],
    category: 'filesystem',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-fs-search`,
    name: 'ducky-tool-fs-search',
    version: '1.0.0',
    description:
      'Workspace discovery: glob for path patterns and ripgrep-style grep over contents. Plugins like this one compose cleanly — install search without mutating tools.',
    tools: ['glob', 'grep'],
    category: 'filesystem',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-disk`,
    name: 'ducky-tool-disk',
    version: '1.0.0',
    description:
      'REAL local-folder access through the browser File System Access API: after the user picks a folder, disk_* tools list, read, create, edit and delete files DIRECTLY on their computer — always scoped to that folder, permission-gated, and subject to the same policy gate as every other side-effecting plugin.',
    tools: ['disk_status', 'disk_ls', 'disk_read', 'disk_write', 'disk_edit', 'disk_delete', 'disk_mkdir'],
    category: 'filesystem',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-bash`,
    name: 'ducky-tool-bash',
    version: '1.0.0',
    description:
      'Runs a simulated bash session backed by the virtual workspace (ls/cat/grep/find/tree plus chaining and redirection). One plugin among many — the harness treats it exactly like every other capability.',
    tools: ['bash'],
    category: 'shell',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-todo`,
    name: 'ducky-tool-todo',
    version: '1.0.0',
    description:
      'Maintains the shared task checklist surfaced in the UI; the latest todo_write wins. A tiny demonstration that even planning is just another plugin.',
    tools: ['todo_write'],
    category: 'planning',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-plan-mode`,
    name: 'ducky-plan-mode',
    version: '1.0.0',
    description:
      'Plan mode support: while active the agent may only explore read-only; exit_plan_mode presents the plan for human review before any execution is allowed.',
    tools: ['exit_plan_mode'],
    category: 'meta',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-subagent`,
    name: 'ducky-tool-subagent',
    version: '1.0.0',
    description:
      'Delegates a focused task to a fresh child agent with its own context, reporting results back to the parent loop. Disabled by default — enable it when you want parallel-style decomposition.',
    tools: ['subagent'],
    category: 'delegation',
    defaultEnabled: false,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-web`,
    name: 'ducky-tool-web',
    version: '1.0.0',
    description:
      'Web access through server-proxied web_search and web_fetch tools, mirroring upstream network tooling while keeping browser CORS safe.',
    tools: ['web_search', 'web_fetch'],
    category: 'web',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-vision`,
    name: 'ducky-tool-vision',
    version: '1.0.0',
    description:
      'Multimodal perception for the harness: vision_describe sends workspace images (pasted screenshots, dropped photos — stored as data URLs) through a server-proxied vision model that returns a faithful description. The eyes plugin among the everything-is-a-plugin lineup.',
    tools: ['vision_describe'],
    category: 'interaction',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-ask-user`,
    name: 'ducky-tool-ask-user',
    version: '1.0.0',
    description:
      'Pauses the loop and surfaces structured questions with optional choices to the human; answers return as the tool result. Interaction itself is plugin-shaped in ducky.',
    tools: ['ask_user_question'],
    category: 'interaction',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-fs-plus`,
    name: 'ducky-tool-fs-plus',
    version: '1.0.0',
    description:
      'Workspace file management beyond read/write: list directories, inspect sizes, copy/move/delete/append, and hand any file to the browser download shelf.',
    tools: ['list_files', 'file_info', 'copy_file', 'move_file', 'delete_file', 'append_file', 'download_file', 'workspace_stats', 'preview_csv'],
    category: 'filesystem',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-patch`,
    name: 'ducky-tool-patch',
    version: '1.0.0',
    description:
      'Surgical multi-file editing: batch literal edits in one call, create many files at once, and diff any two workspace files line by line.',
    tools: ['multi_edit', 'create_files', 'diff_files', 'regex_edit'],
    category: 'filesystem',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-screen`,
    name: 'ducky-tool-screen',
    version: '1.0.0',
    description:
      'COMPUTER USE (perception): captures one frame of the user-shared screen into images/ — the human picks what to share in the browser picker, then vision_describe reads it. The eyes of the computer-use loop.',
    tools: ['screen_capture'],
    category: 'interaction',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-browser`,
    name: 'ducky-tool-browser',
    version: '1.0.0',
    description:
      'BROWSER USE: opens real pages in the IDE browser panel, reads their text through the server proxy, and manages tabs. The hands of the browse-and-read loop (page JS stays sandboxed — the agent reads, the human clicks).',
    tools: ['browser_open', 'browser_snapshot', 'browser_tabs', 'browser_close'],
    category: 'web',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-memory`,
    name: 'ducky-tool-memory',
    version: '1.0.0',
    description:
      'Durable cross-session memory: save facts that survive reloads (injected into every system prompt), list them, forget by id. Small, explicit, user-visible.',
    tools: ['memory_save', 'memory_list', 'memory_forget'],
    category: 'planning',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-notes`,
    name: 'ducky-tool-notes',
    version: '1.0.0',
    description:
      'Per-session scratchpad for working state that is not a todo: dump context, cache intermediate findings, keep a lab journal across long tasks.',
    tools: ['note_write', 'note_read', 'note_list'],
    category: 'planning',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-session`,
    name: 'ducky-tool-session',
    version: '1.0.0',
    description:
      'Session introspection: token/tool/file counters and a full Markdown transcript rendered into context for summarization and handoffs.',
    tools: ['session_stats', 'session_export'],
    category: 'meta',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-calc`,
    name: 'ducky-tool-calc',
    version: '1.0.0',
    description:
      'Exact arithmetic without model hallucinations: safe expression evaluator (no eval) with functions and constants.',
    tools: ['calc'],
    category: 'meta',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-text`,
    name: 'ducky-tool-text',
    version: '1.0.0',
    description:
      'Text codecs and inspectors: base64, SHA-256, JSON validation and dot-path queries over JSON strings.',
    tools: ['base64_encode', 'base64_decode', 'sha256', 'json_parse', 'json_query', 'sort_lines', 'dedupe_lines', 'count_words'],
    category: 'meta',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-time`,
    name: 'ducky-tool-time',
    version: '1.0.0',
    description:
      'Ground truth for "now": current UTC/local timestamps in ISO and human form. Models must not guess the date.',
    tools: ['now'],
    category: 'meta',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-id`,
    name: 'ducky-tool-id',
    version: '1.0.0',
    description:
      'Fresh randomness from the platform CSPRNG: UUIDs and URL-safe tokens for ids, secrets and filenames.',
    tools: ['uuid', 'random_token'],
    category: 'meta',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-clipboard`,
    name: 'ducky-tool-clipboard',
    version: '1.0.0',
    description:
      'OS clipboard bridge: copy text out for the human, read text the human copied in. Permission-gated like every external action.',
    tools: ['clipboard_copy', 'clipboard_read'],
    category: 'interaction',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-notify`,
    name: 'ducky-tool-notify',
    version: '1.0.0',
    description:
      'Tap the human on the shoulder when a long run finishes: native notification when granted, toast fallback otherwise.',
    tools: ['notify_user'],
    category: 'interaction',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-skills`,
    name: 'ducky-tool-skills',
    version: '1.0.0',
    description:
      'Skill playbooks (17): code-review, debug, refactor, plan, commit, docs, test-gen, web-research, mcp-integration, api-design, sql, regex, git, perf, security-review, data-analysis, local-pc. List them, then pull one into context before starting that kind of work.',
    tools: ['skill_list', 'skill_show'],
    category: 'meta',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-config`,
    name: 'ducky-tool-config',
    version: '1.0.0',
    description:
      'Self-configuration: inspect the live harness settings (policy, temperature, budgets — never secrets) and retune them mid-run, e.g. cooling temperature for precise edits or switching the permission policy with approval.',
    tools: ['get_config', 'set_config'],
    category: 'meta',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-sessions`,
    name: 'ducky-tool-sessions',
    version: '1.0.0',
    description:
      'Session management from inside a run: list sessions with sizes, start a fresh one for a parallel thread, rename for clarity, or switch the UI to another session. Tool bindings stay on the session that started the run.',
    tools: ['session_list', 'session_new', 'session_rename', 'session_switch'],
    category: 'meta',
    defaultEnabled: true,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-mcp`,
    name: 'ducky-tool-mcp',
    version: '1.0.0',
    description:
      'MCP CONNECTIONS: call tools on user-configured Model Context Protocol servers (Blender bridges, Roblox Studio bridges, browsers, filesystems…). Servers are registered by the human in Settings → Connections → MCP; the agent lists their tools and calls them. Disabled until at least one server exists.',
    tools: ['mcp_servers', 'mcp_list', 'mcp_call'],
    category: 'delegation',
    defaultEnabled: false,
  },
  {
    id: `${PLUGIN_PREFIX}ducky-tool-pc`,
    name: 'ducky-tool-pc',
    version: '1.0.0',
    description:
      'THIS PC (real machine): runs only while the human runs `ducky bridge` on their computer — real shell commands and real files rooted at the bridge folder, guarded by a one-time token. This is actual computer use, not the virtual workspace: confirm destructive commands with the human first. Disabled by default — enable it when the bridge is up.',
    tools: ['pc_status', 'pc_exec', 'pc_read', 'pc_write', 'pc_ls'],
    category: 'shell',
    defaultEnabled: false,
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
const arr = (description: string, items: Record<string, unknown>): Record<string, unknown> => ({
  type: 'array',
  description,
  items,
});

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
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-fs`).id,
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
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-fs`).id,
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
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-fs`).id,
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
      name: 'disk_status',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-disk`).id,
      description:
        'Report the state of the REAL local-folder connection: whether the browser supports folder access, whether a folder is connected, its name and the guard rails. Call this before any disk_* tool when unsure.',
      parameters: obj({}, []),
    },
    {
      name: 'disk_ls',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-disk`).id,
      description:
        'List entries of a folder inside the connected REAL local folder. With recursive=true, walks the whole subtree (dependency/build dirs like node_modules and .git are skipped, entry count capped).',
      parameters: obj(
        {
          path: str('Folder path relative to the connected root. Defaults to the root itself.'),
          recursive: bool('Walk the entire subtree. Defaults to false (single level).'),
        },
        [],
      ),
    },
    {
      name: 'disk_read',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-disk`).id,
      description:
        'Read a UTF-8 text file from the REAL local folder (line-numbered window, large files truncated honestly at the cap). Reads are free — read before you edit or overwrite anything.',
      parameters: obj(
        {
          path: str('File path relative to the connected root.'),
          offset: num('1-based first line to return. Defaults to 1.'),
          limit: num('Maximum number of lines to return. Defaults to 2000.'),
        },
        ['path'],
      ),
    },
    {
      name: 'disk_write',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-disk`).id,
      description:
        'Create or fully replace a UTF-8 text file on the user\'s REAL disk (parent folders are created automatically). This hits their actual filesystem: read an existing file first, and never overwrite unrelated content.',
      parameters: obj(
        {
          path: str('File path relative to the connected root.'),
          content: str('Full UTF-8 text content to write.'),
        },
        ['path', 'content'],
      ),
      sideEffects: true,
    },
    {
      name: 'disk_edit',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-disk`).id,
      description:
        'Literal old→new replacement inside a file on the user\'s REAL disk. Read the file first: old_str must match exactly and, unless replace_all is set, must appear exactly once.',
      parameters: obj(
        {
          path: str('File path relative to the connected root.'),
          old_str: str('Literal text to replace. Must match exactly.'),
          new_str: str('Literal replacement text. Use an empty string to delete the match.'),
          replace_all: bool('Replace all occurrences. Defaults to false.'),
        },
        ['path', 'old_str', 'new_str'],
      ),
      sideEffects: true,
    },
    {
      name: 'disk_delete',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-disk`).id,
      description:
        'Delete a file from the user\'s REAL disk. Folders require recursive=true and take everything inside with them — confirm the target with disk_ls first; deletion cannot be undone.',
      parameters: obj(
        {
          path: str('Path relative to the connected root (file, or folder with recursive=true).'),
          recursive: bool('Required true to delete a folder and all its contents.'),
        },
        ['path'],
      ),
      sideEffects: true,
    },
    {
      name: 'disk_mkdir',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-disk`).id,
      description:
        'Create a folder (with parents) in the connected REAL local folder. Succeeds silently when the folder already exists.',
      parameters: obj({ path: str('Folder path relative to the connected root.') }, ['path']),
      sideEffects: true,
    },
    {
      name: 'glob',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-fs-search`).id,
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
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-fs-search`).id,
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
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-bash`).id,
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
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-todo`).id,
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
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-plan-mode`).id,
      description:
        'Signals the plan is ready for review: hands control to the user, who may approve the plan (ending plan mode and unlocking write tools) or send feedback to keep planning.',
      parameters: obj({}, []),
    },
    {
      name: 'subagent',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-subagent`).id,
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
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-web`).id,
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
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-web`).id,
      description:
        'Fetch a URL server-side and return its readable text content (HTML stripped, capped at ~8000 characters). Prefer known-stable URLs from web_search results.',
      parameters: obj({ url: str('Absolute http(s) URL to fetch.') }, ['url']),
    },
    {
      name: 'vision_describe',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-vision`).id,
      description:
        'Analyze an image stored in the workspace (e.g. a pasted screenshot under images/) with a multimodal model. Returns a plain-text description of subject, colors, composition and any visible text.',
      parameters: obj(
        {
          path: str('Workspace-relative path of the image file to analyze.'),
          prompt: str('Optional specific question about the image; defaults to a full description.'),
        },
        ['path'],
      ),
    },
    {
      name: 'list_files',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-fs-plus`).id,
      description:
        'List entries directly inside a workspace directory (non-recursive). Directories end with "/". Prefer this over glob when you want to see what is in one folder.',
      parameters: obj(
        {
          path: str('Directory to list, relative to the workspace root. Defaults to the root.'),
        },
        [],
      ),
    },
    {
      name: 'file_info',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-fs-plus`).id,
      description:
        'Report size metadata for a workspace file: lines, words, characters, bytes. Cheap — use it before deciding to read a huge file.',
      parameters: obj({ path: str('Workspace-relative path of the file.') }, ['path']),
    },
    {
      name: 'copy_file',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-fs-plus`).id,
      description:
        'Copy a workspace file to a new path (overwrites the target). Fails when the source is missing.',
      parameters: obj(
        {
          from: str('Workspace-relative source path.'),
          to: str('Workspace-relative destination path.'),
        },
        ['from', 'to'],
      ),
      sideEffects: true,
    },
    {
      name: 'move_file',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-fs-plus`).id,
      description:
        'Move/rename a workspace file atomically. Fails when the source is missing or the target already exists.',
      parameters: obj(
        {
          from: str('Workspace-relative source path.'),
          to: str('Workspace-relative destination path.'),
        },
        ['from', 'to'],
      ),
      sideEffects: true,
    },
    {
      name: 'delete_file',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-fs-plus`).id,
      description:
        'Delete a workspace file. Cannot be undone — confirm the path with list_files or glob first.',
      parameters: obj({ path: str('Workspace-relative path to delete.') }, ['path']),
      sideEffects: true,
    },
    {
      name: 'append_file',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-fs-plus`).id,
      description:
        'Append text to the end of a workspace file (creates it when missing). Use for logs, journals and incremental writes instead of rewriting whole files.',
      parameters: obj(
        {
          path: str('Workspace-relative path to append to.'),
          content: str('UTF-8 text to append.'),
        },
        ['path', 'content'],
      ),
      sideEffects: true,
    },
    {
      name: 'download_file',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-fs-plus`).id,
      description:
        'Hand a workspace file to the browser download shelf so the human gets a real file. Images download as real bytes.',
      parameters: obj({ path: str('Workspace-relative path to download.') }, ['path']),
      sideEffects: true,
    },
    {
      name: 'multi_edit',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-patch`).id,
      description:
        'Apply several literal old→new replacements to one workspace file in a single call, in order. Each item follows edit_file strictness (read first, unique match unless replace_all). Stops at the first failing item — earlier items ARE applied.',
      parameters: obj(
        {
          path: str('Workspace-relative path to edit.'),
          edits: arr('Ordered replacements to apply.', {
            type: 'object',
            properties: {
              old_str: str('Literal text to replace. Must match exactly.'),
              new_str: str('Literal replacement text.'),
            },
            required: ['old_str', 'new_str'],
          }),
          replace_all: bool('Apply each replacement to all occurrences. Defaults to false.'),
        },
        ['path', 'edits'],
      ),
      sideEffects: true,
    },
    {
      name: 'create_files',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-patch`).id,
      description:
        'Create or overwrite MANY workspace files in one call — the fast path for scaffolding. Each item is a full-file write.',
      parameters: obj(
        {
          files: arr('Files to write.', {
            type: 'object',
            properties: {
              path: str('Workspace-relative path to write.'),
              content: str('Full UTF-8 text content.'),
            },
            required: ['path', 'content'],
          }),
        },
        ['files'],
      ),
      sideEffects: true,
    },
    {
      name: 'diff_files',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-patch`).id,
      description:
        'Line-by-line diff of two workspace files (a vs b). Use before overwriting, or to show the human what changed.',
      parameters: obj(
        {
          a: str('Workspace-relative path of the "before" file.'),
          b: str('Workspace-relative path of the "after" file.'),
        },
        ['a', 'b'],
      ),
    },
    {
      name: 'screen_capture',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-screen`).id,
      description:
        'COMPUTER USE: capture one frame of the user-shared screen into images/ and return its path. The browser ALWAYS shows its share picker first — the human chooses screen/window/tab, nothing is captured silently. Follow with vision_describe on the returned path to actually see it.',
      parameters: obj({}, []),
      sideEffects: true,
    },
    {
      name: 'browser_open',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-browser`).id,
      description:
        'BROWSER USE: open an http(s) URL in the IDE browser panel (visible to the human) and register the tab. Follow with browser_snapshot to read the page text through the server proxy.',
      parameters: obj({ url: str('Absolute http(s) URL to open.') }, ['url']),
    },
    {
      name: 'browser_snapshot',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-browser`).id,
      description:
        'BROWSER USE: read the active (or given) browser tab as text via the server proxy — same readable extraction as web_fetch, but addressed to an open tab.',
      parameters: obj(
        {
          tab_id: str('Tab id prefix (from browser_tabs). Defaults to the active tab.'),
          max_chars: num('Maximum characters returned. Defaults to 8000.'),
        },
        [],
      ),
    },
    {
      name: 'browser_tabs',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-browser`).id,
      description: 'BROWSER USE: list open browser tabs (id, title, url) and which is active.',
      parameters: obj({}, []),
    },
    {
      name: 'browser_close',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-browser`).id,
      description: 'BROWSER USE: close a browser tab by id prefix.',
      parameters: obj({ tab_id: str('Tab id prefix to close.') }, ['tab_id']),
    },
    {
      name: 'memory_save',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-memory`).id,
      description:
        'Save one durable fact (≤500 chars) to cross-session memory — injected into every future system prompt. Use for user preferences, project conventions, "never do X". Do NOT store secrets.',
      parameters: obj({ text: str('The fact to remember, phrased standalone.') }, ['text']),
    },
    {
      name: 'memory_list',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-memory`).id,
      description: 'List all stored cross-session memories with their ids.',
      parameters: obj({}, []),
    },
    {
      name: 'memory_forget',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-memory`).id,
      description: 'Forget one memory by id (first 8 characters are enough — see memory_list).',
      parameters: obj({ id: str('Id prefix of the memory to forget.') }, ['id']),
    },
    {
      name: 'note_write',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-notes`).id,
      description:
        'Write a named note to this session scratchpad (up to 20 notes, 8000 chars each). For working state: findings, context dumps, lab journal — not todos (use todo_write).',
      parameters: obj(
        {
          name: str('Short note name (slugified). Overwrites the same name.'),
          content: str('Note content.'),
        },
        ['name', 'content'],
      ),
    },
    {
      name: 'note_read',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-notes`).id,
      description: 'Read one session note by name.',
      parameters: obj({ name: str('Note name.') }, ['name']),
    },
    {
      name: 'note_list',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-notes`).id,
      description: 'List session note names with sizes and update times.',
      parameters: obj({}, []),
    },
    {
      name: 'session_stats',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-session`).id,
      description:
        'Report live session counters: prompt/completion tokens, tool calls executed, messages, workspace files. Ground truth for "how big is this session".',
      parameters: obj({}, []),
    },
    {
      name: 'session_export',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-session`).id,
      description:
        'Render the full session transcript (roles + tool calls) as Markdown into context — for summaries, handoffs to a subagent, or reviews. Capped to stay in context.',
      parameters: obj(
        {
          max_chars: num('Maximum characters returned. Defaults to 20000.'),
        },
        [],
      ),
    },
    {
      name: 'calc',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-calc`).id,
      description:
        'Exact arithmetic: evaluate an expression with + - * / % ^, parens, sqrt/abs/floor/ceil/round/sin/cos/pow/min/max and pi/e. Never estimate numbers in prose when you can compute.',
      parameters: obj({ expression: str('Expression, e.g. "(12.5*8 - 3^2) / sqrt(16)".') }, ['expression']),
    },
    {
      name: 'base64_encode',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-text`).id,
      description: 'UTF-8-safe base64 encode of a string.',
      parameters: obj({ text: str('Text to encode.') }, ['text']),
    },
    {
      name: 'base64_decode',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-text`).id,
      description: 'Decode a base64 string back to UTF-8 text. Errors clearly on invalid input.',
      parameters: obj({ text: str('Base64 to decode.') }, ['text']),
    },
    {
      name: 'sha256',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-text`).id,
      description: 'Hex SHA-256 digest of UTF-8 text (change detection, dedupe, cache keys).',
      parameters: obj({ text: str('Text to hash.') }, ['text']),
    },
    {
      name: 'json_parse',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-text`).id,
      description:
        'Validate a JSON string and return it pretty-printed with its top-level shape. Errors pinpoint the failure.',
      parameters: obj({ text: str('JSON string to validate.') }, ['text']),
    },
    {
      name: 'json_query',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-text`).id,
      description:
        'Extract one value from a JSON string with a dot path (a.b[0].c, "$.a.b" also accepted). Returns the value as JSON.',
      parameters: obj(
        {
          text: str('JSON string to query.'),
          path: str('Dot path, e.g. "store.book[0].title".'),
        },
        ['text', 'path'],
      ),
    },
    {
      name: 'now',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-time`).id,
      description:
        'Current date/time: UTC ISO, local ISO with offset, and Unix millis. Call it instead of guessing dates.',
      parameters: obj({}, []),
    },
    {
      name: 'uuid',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-id`).id,
      description: 'Generate cryptographically random UUIDv4s (default 1, max 20).',
      parameters: obj({ count: num('How many UUIDs. Defaults to 1.') }, []),
    },
    {
      name: 'random_token',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-id`).id,
      description:
        'URL-safe random token from the platform CSPRNG — for ids, filenames, nonces. NOT a substitute for a real secrets manager at scale.',
      parameters: obj(
        {
          bytes: num('Random bytes (1-64, default 16 → 22 chars).'),
        },
        [],
      ),
    },
    {
      name: 'clipboard_copy',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-clipboard`).id,
      description:
        'Copy text to the OS clipboard so the human can paste it anywhere. Text only, ≤100k chars.',
      parameters: obj({ text: str('Text to copy.') }, ['text']),
      sideEffects: true,
    },
    {
      name: 'clipboard_read',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-clipboard`).id,
      description:
        'Read text from the OS clipboard (what the human copied). Needs the browser clipboard permission — fails clearly when denied.',
      parameters: obj({}, []),
      sideEffects: true,
    },
    {
      name: 'notify_user',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-notify`).id,
      description:
        'Ping the human when a long run finishes or input is truly needed: native notification when permitted, in-app toast fallback otherwise. Keep the title ≤60 chars.',
      parameters: obj(
        {
          title: str('Short title.'),
          body: str('One-line detail (optional).'),
        },
        ['title'],
      ),
      sideEffects: true,
    },
    {
      name: 'skill_list',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-skills`).id,
      description:
        'List built-in skill playbooks (17: code-review, debug, refactor, plan, commit, docs, test-gen, web-research, mcp-integration, api-design, sql, regex, git, perf, security-review, data-analysis, local-pc) with one-line descriptions. Call BEFORE starting that kind of work, then skill_show.',
      parameters: obj({}, []),
    },
    {
      name: 'skill_show',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-skills`).id,
      description:
        'Pull one skill playbook into context and FOLLOW it step by step for the current task.',
      parameters: obj({ name: str('Skill name from skill_list.') }, ['name']),
    },
    {
      name: 'get_config',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-config`).id,
      description:
        'Show the live harness settings: permission policy, temperature, token/iteration budgets, model. Secrets (keys, URLs) are NEVER exposed — they live server-side only.',
      parameters: obj({}, []),
    },
    {
      name: 'set_config',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-config`).id,
      description:
        'Retune harness settings mid-run. Omit fields to leave them unchanged. policy=cycle guard: switching to auto still passes the approval gate for THIS call.',
      parameters: obj(
        {
          policy: {
            type: 'string',
            enum: ['readonly', 'ask', 'auto'],
            description: 'Permission policy.',
          },
          temperature: num('Sampling temperature 0–2. Lower (0.2) for precise edits, higher (1) for ideas.'),
          max_tokens: num('Response length cap, 512–16384.'),
          max_tool_iterations: num('Agent-loop tool rounds per turn, 2–16.'),
          show_reasoning: bool('Render Thinking cards when the model streams reasoning.'),
        },
        [],
      ),
      sideEffects: true,
    },
    {
      name: 'session_list',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-sessions`).id,
      description:
        'List sessions: id prefix, title, message/file counts, last activity. The starred/current session is marked.',
      parameters: obj({}, []),
    },
    {
      name: 'session_new',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-sessions`).id,
      description:
        'Start a fresh session (empty, from the active project) and return its id — for parking a parallel thread. Does NOT switch the UI; use session_switch for that.',
      parameters: obj({ title: str('Optional title (defaults to "New task").') }, []),
    },
    {
      name: 'session_rename',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-sessions`).id,
      description: 'Rename any session by id prefix — keep titles truthful as tasks evolve.',
      parameters: obj(
        {
          id: str('Session id prefix (see session_list).'),
          title: str('New title (1–80 chars).'),
        },
        ['id', 'title'],
      ),
    },
    {
      name: 'session_switch',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-sessions`).id,
      description:
        'Point the UI at another session by id prefix. The CURRENT run keeps its own tools/workspace binding; the switch affects what the human sees and where the NEXT message lands.',
      parameters: obj({ id: str('Session id prefix (see session_list).') }, ['id']),
    },
    {
      name: 'sort_lines',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-text`).id,
      description:
        'Sort lines of text (lexicographic, numeric-aware, or reverse). For files, read first; result returns as text (write_file to keep it).',
      parameters: obj(
        {
          text: str('Text to sort.'),
          numeric: bool('Numeric-aware ordering (parseFloat per line, fallback lexical). Defaults to false.'),
          reverse: bool('Descending order. Defaults to false.'),
        },
        ['text'],
      ),
    },
    {
      name: 'dedupe_lines',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-text`).id,
      description:
        'Drop duplicate lines, keeping first-occurrence order. Reports how many were removed.',
      parameters: obj(
        {
          text: str('Text to dedupe.'),
          ignore_case: bool('Case-insensitive comparison. Defaults to false.'),
        },
        ['text'],
      ),
    },
    {
      name: 'count_words',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-text`).id,
      description: 'Count lines, words, characters and bytes of any text (cheaper than file_info for inline strings).',
      parameters: obj({ text: str('Text to measure.') }, ['text']),
    },
    {
      name: 'regex_edit',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-patch`).id,
      description:
        'Regex find-and-replace inside a workspace file (edit_file is literal-only). Supports $1-style group references and g/i/m/s/u/y flags. Read the file first; reports the replacement count.',
      parameters: obj(
        {
          path: str('Workspace-relative path to edit.'),
          pattern: str('Regular expression source (no slashes).'),
          replacement: str('Replacement string ($1, $&, $$ supported).'),
          flags: str('Regex flags, e.g. "g" or "gi". Defaults to "" (first match only).'),
        },
        ['path', 'pattern', 'replacement'],
      ),
      sideEffects: true,
    },
    {
      name: 'workspace_stats',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-fs-plus`).id,
      description:
        'Workspace overview: file count, total bytes, top-5 largest files, and file counts by extension. The cheap "how big is this thing" before diving in.',
      parameters: obj({}, []),
    },
    {
      name: 'preview_csv',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-fs-plus`).id,
      description:
        'Preview a CSV file as an aligned table (header + N rows, quote-aware). Flags ragged rows.',
      parameters: obj(
        {
          path: str('Workspace-relative path of the CSV file.'),
          rows: num('Data rows to show, 1–50. Defaults to 10.'),
          delimiter: str('Single-character delimiter. Defaults to ",".'),
        },
        ['path'],
      ),
    },
    {
      name: 'pc_status',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-pc`).id,
      description:
        'Check the This-PC bridge: reachable, which folder is rooted, platform. Call first — when it fails, tell the human to run `ducky bridge` and paste the token in Settings → Connections → This PC.',
      parameters: obj({}, []),
    },
    {
      name: 'pc_exec',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-pc`).id,
      description:
        'Run a REAL shell command on the human PC via the bridge (rooted at its folder). Prefer read-only commands (ls/dir, cat, pwd); destructive ones (rm, del, format, sudo) need explicit human confirmation first. Output capped.',
      parameters: obj(
        {
          command: str('The exact command line to run.'),
          cwd: str('Working directory relative to the bridge root. Defaults to the root.'),
          timeout_ms: num('Timeout 1s–120s. Defaults to 30000.'),
        },
        ['command'],
      ),
      sideEffects: true,
    },
    {
      name: 'pc_read',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-pc`).id,
      description:
        'Read a REAL text file from the PC through the bridge (paths relative to its root, large files truncated honestly).',
      parameters: obj({ path: str('File path relative to the bridge root.') }, ['path']),
    },
    {
      name: 'pc_write',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-pc`).id,
      description:
        'Write a REAL file on the PC through the bridge (parents created). This touches their actual machine: read first, confirm overwrites with the human.',
      parameters: obj(
        {
          path: str('File path relative to the bridge root.'),
          content: str('Full UTF-8 text content (≤2 MB).'),
        },
        ['path', 'content'],
      ),
      sideEffects: true,
    },
    {
      name: 'pc_ls',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-pc`).id,
      description: 'List a REAL directory on the PC through the bridge (optionally recursive, capped).',
      parameters: obj(
        {
          path: str('Directory relative to the bridge root. Defaults to the root.'),
          recursive: bool('Walk the subtree (depth ≤6). Defaults to false.'),
        },
        [],
      ),
    },
    {
      name: 'mcp_servers',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-mcp`).id,
      description:
        'List configured MCP servers (name + URL). Empty means the human has not connected anything yet — tell them to open Settings → Connections → MCP.',
      parameters: obj({}, []),
    },
    {
      name: 'mcp_list',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-mcp`).id,
      description:
        'List tools exposed by ALL configured MCP servers (Blender scenes, Roblox instances, browser actions…). Call this before mcp_call; unreachable servers are reported, not fatal.',
      parameters: obj({}, []),
    },
    {
      name: 'mcp_call',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-mcp`).id,
      description:
        'Call one MCP tool: pick server + tool from mcp_list and pass its arguments object. Results return as text (capped). Retries and auth live with the bridge itself.',
      parameters: obj(
        {
          server: str('Server name from mcp_list (case-insensitive).'),
          tool: str('Tool name from mcp_list.'),
          args: {
            type: 'object',
            description: 'Arguments object for the tool (see its schema via mcp_list context or ask the human).',
            additionalProperties: true,
          },
        },
        ['server', 'tool'],
      ),
      sideEffects: true,
    },
    {
      name: 'ask_user_question',
      pluginId: byPlugin(`${PLUGIN_PREFIX}ducky-tool-ask-user`).id,
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
  /** server-side multimodal description of a vFS image (data URL) */
  visionDescribe(imageDataUrl: string, question?: string): Promise<string>;
  /* -------- extra-tool backends (memory/notes/session introspection) ------ */
  saveMemoryText(text: string): string;
  listMemoryEntries(): Array<{ id: string; text: string; createdAt: number }>;
  forgetMemoryEntry(idPrefix: string): boolean;
  writeSessionNote(name: string, content: string): { name: string; chars: number };
  readSessionNote(name: string): string | null;
  listSessionNotes(): Array<{ name: string; chars: number; updatedAt: number }>;
  getSessionStats(): {
    title: string;
    promptTokens: number;
    completionTokens: number;
    toolCalls: number;
    messages: number;
    files: number;
  };
  getTranscript(): Array<{ role: string; content: string; tools?: string[] }>;
  /* ---------------- config + session management backends ------------------ */
  getPublicSettings(): {
    policy: string;
    temperature: number;
    maxTokens: number;
    maxToolIterations: number;
    showReasoning: boolean;
    model: string;
  };
  updatePublicSettings(patch: {
    policy?: string;
    temperature?: number;
    maxTokens?: number;
    maxToolIterations?: number;
    showReasoning?: boolean;
  }): string[];
  listSessionsBrief(): Array<{ id: string; title: string; messages: number; files: number; updatedAt: number }>;
  createSessionNamed(title: string): string;
  renameSessionById(idPrefix: string, title: string): boolean;
  switchSessionById(idPrefix: string): boolean;
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

  disk_status:
    () =>
    async () => {
      const st = useDiskStore.getState();
      const sup = describeDiskSupport();
      switch (st.status) {
        case 'connected':
          return [
            `Local disk CONNECTED: “${st.rootName}” (read-write).`,
            'All disk_* paths are relative to this folder; traversal above it is impossible.',
            'Guard rails: list ≤ 2000 entries / depth 12, reads ≤ 384 KB, writes ≤ 2 MB, UTF-8 text only.',
            'Writes, edits, deletes and mkdir go through the same permission policy as every other side-effecting tool.',
          ].join('\n');
        case 'needs-permission':
          return `A folder (“${st.rootName}”) was connected previously but the browser needs the permission re-granted. Ask the user to click the disk chip in the status bar (or project picker → Connect local folder…).`;
        case 'unsupported':
          return `This browser does not support the File System Access API. ${sup.hint}`;
        default:
          return 'No local folder is connected — disk_* mutations and reads are unavailable. Ask the user to connect one via the project picker (“Connect local folder…”) or the status-bar disk chip.';
      }
    },

  disk_ls:
    () =>
    async (args) => {
      const dirPath = asString(args.path);
      const recursive = args.recursive === true;
      const rootName = useDiskStore.getState().rootName || 'disk';
      const entries = await diskList(dirPath, recursive);
      return formatDiskListing(entries, `${rootName}${dirPath ? `/${normalizePath(dirPath)}` : ''}`);
    },

  disk_read:
    () =>
    async (args) => {
      const p = normalizePath(asString(args.path));
      if (!p) throw new Error('disk_read: "path" must be a non-empty root-relative path');
      const { content, size, truncated } = await diskRead(p);
      const offset = asNumber(args.offset) ?? 1;
      const limit = asNumber(args.limit) ?? 2000;
      const header = truncated
        ? `[disk_read: showing the first 384 KB of ${size} bytes — file is larger]\n`
        : `[disk_read: ${size} bytes]\n`;
      return header + formatReadWindow(content, offset, limit);
    },

  disk_write:
    () =>
    async (args) => {
      const p = normalizePath(asString(args.path));
      if (!p) throw new Error('disk_write: "path" must be a non-empty root-relative path');
      const content = asString(args.content);
      const { created, bytes } = await diskWrite(p, content);
      return `${created ? 'Created' : 'Overwrote'} ${p} on the local disk (${bytes} bytes).`;
    },

  disk_edit:
    () =>
    async (args) => {
      const p = normalizePath(asString(args.path));
      if (!p) throw new Error('disk_edit: "path" must be a non-empty root-relative path');
      const oldStr = asString(args.old_str);
      const newStr = asString(args.new_str);
      const replacements = await diskEdit(p, oldStr, newStr, args.replace_all === true);
      return `Edited ${p} on the local disk: ${replacements} replacement(s) applied.`;
    },

  disk_delete:
    () =>
    async (args) => {
      const p = normalizePath(asString(args.path));
      if (!p) throw new Error('disk_delete: "path" must be a non-empty root-relative path');
      const { kind } = await diskDelete(p, args.recursive === true);
      return `Deleted ${kind === 'dir' ? 'folder (recursive)' : 'file'} ${p} from the local disk.`;
    },

  disk_mkdir:
    () =>
    async (args) => {
      const p = asString(args.path);
      const { created } = await diskMkdir(p);
      return created
        ? `Created folder ${normalizePath(p)} on the local disk.`
        : `Folder ${normalizePath(p)} already exists.`;
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

  vision_describe:
    (ctx) =>
    async (args) => {
      const p = normalizePath(asString(args.path));
      const content = p ? ctx.readFile(p) : null;
      if (content === null) throw new Error(`File not found: ${p || '/'} (list images with glob "images/*")`);
      const question = asString(args.prompt).trim() || undefined;
      try {
        return await ctx.visionDescribe(content, question);
      } catch (e) {
        throw new Error(`vision_describe failed on ${p}: ${(e as Error).message}`);
      }
    },

  /* ------------------------------ fs-plus -------------------------------- */

  list_files:
    (ctx) =>
    async (args) => {
      const dir = normalizePath(asString(args.path));
      const prefix = dir ? `${dir}/` : '';
      const files = ctx.listWorkspaceFiles();
      const dirs = new Set<string>();
      const direct: string[] = [];
      for (const f of files) {
        if (!f.startsWith(prefix)) continue;
        const rest = f.slice(prefix.length);
        if (!rest) continue;
        const seg = rest.indexOf('/');
        if (seg === -1) direct.push(rest);
        else dirs.add(rest.slice(0, seg));
      }
      const lines = [...[...dirs].sort().map((d) => `${d}/`), ...direct.sort()];
      if (!lines.length) return dir ? `Directory is empty: ${dir}/` : 'Workspace is empty.';
      return lines.join('\n');
    },

  file_info:
    (ctx) =>
    async (args) => {
      const p = normalizePath(asString(args.path));
      if (!p) throw new Error('file_info: "path" is required');
      const content = ctx.readFile(p);
      if (content === null) throw new Error(`File not found: ${p}`);
      const s = fileInfoSummary(content);
      return `${p}: ${s.lines} lines · ${s.words} words · ${s.chars} chars · ${s.bytes} bytes`;
    },

  copy_file:
    (ctx) =>
    async (args) => {
      const from = normalizePath(asString(args.from));
      const to = normalizePath(asString(args.to));
      if (!from || !to) throw new Error('copy_file: "from" and "to" are required');
      const content = ctx.readFile(from);
      if (content === null) throw new Error(`File not found: ${from}`);
      ctx.writeFile(to, content);
      return `Copied ${from} → ${to} (${content.length} chars).`;
    },

  move_file:
    (ctx) =>
    async (args) => {
      const from = normalizePath(asString(args.from));
      const to = normalizePath(asString(args.to));
      if (!from || !to) throw new Error('move_file: "from" and "to" are required');
      const content = ctx.readFile(from);
      if (content === null) throw new Error(`File not found: ${from}`);
      if (ctx.readFile(to) !== null) throw new Error(`Target already exists: ${to} (delete it first)`);
      ctx.writeFile(to, content);
      ctx.deleteFileEntry(from);
      return `Moved ${from} → ${to}.`;
    },

  delete_file:
    (ctx) =>
    async (args) => {
      const p = normalizePath(asString(args.path));
      if (!p) throw new Error('delete_file: "path" is required');
      const ok = ctx.deleteFileEntry(p);
      if (!ok) throw new Error(`File not found: ${p}`);
      return `Deleted ${p}.`;
    },

  append_file:
    (ctx) =>
    async (args) => {
      const p = normalizePath(asString(args.path));
      if (!p) throw new Error('append_file: "path" is required');
      const add = asString(args.content);
      const cur = ctx.readFile(p) ?? '';
      ctx.writeFile(p, cur + add);
      return `Appended ${add.length} chars to ${p} (${cur.length + add.length} total).`;
    },

  download_file:
    (ctx) =>
    async (args) => {
      const p = normalizePath(asString(args.path));
      if (!p) throw new Error('download_file: "path" is required');
      if (typeof document === 'undefined') throw new Error('download_file: needs a real browser');
      const content = ctx.readFile(p);
      if (content === null) throw new Error(`File not found: ${p}`);
      const isImage = content.startsWith('data:image/');
      const a = document.createElement('a');
      if (isImage) {
        a.href = content;
      } else {
        const blob = new Blob([content], { type: 'text/plain' });
        a.href = URL.createObjectURL(blob);
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
      a.download = p.split('/').pop() ?? 'file';
      a.click();
      return `Sent ${p} to the browser download shelf.`;
    },

  /* -------------------------------- patch --------------------------------- */

  multi_edit:
    (ctx) =>
    async (args) => {
      const p = normalizePath(asString(args.path));
      if (!p) throw new Error('multi_edit: "path" is required');
      const content = ctx.readFile(p);
      if (content === null) throw new Error(`File not found: ${p} (read it first)`);
      const raw = Array.isArray(args.edits) ? args.edits : null;
      if (!raw || raw.length === 0) throw new Error('multi_edit: non-empty "edits" array is required');
      if (raw.length > 20) throw new Error('multi_edit: at most 20 edits per call');
      const edits = raw.map((e, i) => {
        const rec = e as Record<string, unknown>;
        if (typeof rec.old_str !== 'string' || typeof rec.new_str !== 'string') {
          throw new Error(`multi_edit: item ${i} needs string old_str/new_str`);
        }
        return { oldStr: rec.old_str, newStr: rec.new_str };
      });
      const { next, applied } = applyEdits(content, edits, args.replace_all === true);
      ctx.writeFile(p, next);
      return `Edited ${p}: ${applied} replacement(s) across ${edits.length} item(s).`;
    },

  create_files:
    (ctx) =>
    async (args) => {
      const raw = Array.isArray(args.files) ? args.files : null;
      if (!raw || raw.length === 0) throw new Error('create_files: non-empty "files" array is required');
      if (raw.length > 20) throw new Error('create_files: at most 20 files per call');
      let bytes = 0;
      raw.forEach((f, i) => {
        const rec = f as Record<string, unknown>;
        const p = normalizePath(asString(rec.path));
        if (!p) throw new Error(`create_files: item ${i} has an empty path`);
        const content = asString(rec.content);
        if (content.length > 200_000) throw new Error(`create_files: item ${i} exceeds 200k chars`);
        ctx.writeFile(p, content);
        bytes += content.length;
      });
      return `Wrote ${raw.length} file(s), ${bytes} chars total.`;
    },

  diff_files:
    (ctx) =>
    async (args) => {
      const a = normalizePath(asString(args.a));
      const b = normalizePath(asString(args.b));
      if (!a || !b) throw new Error('diff_files: "a" and "b" are required');
      const ca = ctx.readFile(a);
      const cb = ctx.readFile(b);
      if (ca === null) throw new Error(`File not found: ${a}`);
      if (cb === null) throw new Error(`File not found: ${b}`);
      return lineDiff(ca, cb);
    },

  /* --------------------------- screen (computer) -------------------------- */

  screen_capture:
    (ctx) =>
    async () => {
      return captureScreenToWorkspace(ctx.sessionId, (path, content) => ctx.writeFile(path, content));
    },

  /* ---------------------------- browser (web use) ------------------------- */

  browser_open:
    () =>
    async (args) => {
      const url = asString(args.url).trim();
      if (!/^https?:\/\//i.test(url)) throw new Error('browser_open: "url" must be an absolute http(s) URL');
      const tab = openTab(url);
      return `Opened in the browser panel: ${tab.title}\n  tab: ${tab.id.slice(0, 8)} · ${tab.url}\nUse browser_snapshot to read the page text.`;
    },

  browser_snapshot:
    (ctx) =>
    async (args) => {
      const prefix = asString(args.tab_id).trim();
      const tab = prefix ? [...listTabs()].find((t) => t.id.startsWith(prefix)) : getActiveTab();
      if (!tab) throw new Error('browser_snapshot: no such tab (see browser_tabs)');
      const max = Math.min(20000, Math.max(500, asNumber(args.max_chars) ?? 8000));
      const text = await ctx.webFetch(tab.url);
      return `# ${tab.title}\n${tab.url}\n\n${text.slice(0, max)}${text.length > max ? `\n[ducky: capped at ${max} chars]` : ''}`;
    },

  browser_tabs:
    () =>
    async () => {
      const tabs = listTabs();
      if (!tabs.length) return 'No browser tabs open. Use browser_open with an http(s) URL.';
      const active = getActiveTab();
      return tabs
        .map((t) => `${t.id === active?.id ? '●' : '○'} ${t.id.slice(0, 8)}  ${t.title}\n  ${t.url}`)
        .join('\n');
    },

  browser_close:
    () =>
    async (args) => {
      const prefix = asString(args.tab_id).trim();
      if (!prefix) throw new Error('browser_close: "tab_id" is required (see browser_tabs)');
      const ok = closeTab(prefix);
      if (!ok) throw new Error(`browser_close: no tab starts with "${prefix}"`);
      return 'Tab closed.';
    },

  /* -------------------------------- memory -------------------------------- */

  memory_save:
    (ctx) =>
    async (args) => {
      const text = asString(args.text).trim();
      if (!text) throw new Error('memory_save: "text" is required');
      const id = ctx.saveMemoryText(text);
      return `Remembered (${id.slice(0, 8)}). It will appear in future system prompts.`;
    },

  memory_list:
    (ctx) =>
    async () => {
      const items = ctx.listMemoryEntries();
      if (!items.length) return 'No memories stored.';
      return items.map((m) => `${m.id.slice(0, 8)} · ${m.text}`).join('\n');
    },

  memory_forget:
    (ctx) =>
    async (args) => {
      const id = asString(args.id).trim();
      if (!id) throw new Error('memory_forget: "id" is required (see memory_list)');
      const ok = ctx.forgetMemoryEntry(id);
      if (!ok) throw new Error(`memory_forget: no memory starts with "${id}"`);
      return 'Forgotten.';
    },

  /* --------------------------------- notes --------------------------------- */

  note_write:
    (ctx) =>
    async (args) => {
      const name = asString(args.name).trim();
      if (!name) throw new Error('note_write: "name" is required');
      const entry = ctx.writeSessionNote(name, asString(args.content));
      return `Note "${entry.name}" saved (${entry.chars} chars).`;
    },

  note_read:
    (ctx) =>
    async (args) => {
      const name = asString(args.name).trim();
      if (!name) throw new Error('note_read: "name" is required');
      const content = ctx.readSessionNote(name);
      if (content === null) throw new Error(`note_read: no note named "${name}" (see note_list)`);
      return content || '(empty note)';
    },

  note_list:
    (ctx) =>
    async () => {
      const items = ctx.listSessionNotes();
      if (!items.length) return 'Scratchpad is empty.';
      return items
        .map((n) => `${n.name} · ${n.chars} chars · ${new Date(n.updatedAt).toISOString()}`)
        .join('\n');
    },

  /* -------------------------------- session ------------------------------- */

  session_stats:
    (ctx) =>
    async () => {
      const s = ctx.getSessionStats();
      return [
        `Session "${s.title}":`,
        `tokens: ${s.promptTokens} prompt + ${s.completionTokens} completion`,
        `tool calls: ${s.toolCalls} · messages: ${s.messages} · workspace files: ${s.files}`,
      ].join('\n');
    },

  session_export:
    (ctx) =>
    async (args) => {
      const max = Math.min(60000, Math.max(1000, asNumber(args.max_chars) ?? 20000));
      const turns = ctx.getTranscript();
      if (!turns.length) return '(empty transcript)';
      const lines = turns.map((t) => {
        const head = t.role === 'user' ? '## user' : t.role === 'assistant' ? '## ducky' : `## tool${t.tools?.length ? ` (${t.tools.join(', ')})` : ''}`;
        return `${head}\n\n${t.content}`;
      });
      const full = lines.join('\n\n---\n\n');
      return full.length > max ? `${full.slice(0, max)}\n\n[ducky: transcript capped at ${max} chars]` : full;
    },

  /* ---------------------------------- calc --------------------------------- */

  calc:
    () =>
    async (args) => {
      const expr = asString(args.expression).trim();
      if (!expr) throw new Error('calc: "expression" is required');
      if (expr.length > 500) throw new Error('calc: expression too long (≤500 chars)');
      try {
        const v = evaluateExpression(expr);
        return `${expr} = ${Number.isInteger(v) ? String(v) : String(Math.round(v * 1e10) / 1e10)}`;
      } catch (e) {
        throw new Error(`calc: ${(e as Error).message}`);
      }
    },

  /* ---------------------------------- text --------------------------------- */

  base64_encode:
    () =>
    async (args) => {
      const text = asString(args.text);
      if (!text) throw new Error('base64_encode: "text" is required');
      return b64encode(text);
    },

  base64_decode:
    () =>
    async (args) => {
      const text = asString(args.text).trim();
      if (!text) throw new Error('base64_decode: "text" is required');
      try {
        return b64decode(text);
      } catch (e) {
        throw new Error(`${(e as Error).message}`);
      }
    },

  sha256:
    () =>
    async (args) => {
      const text = asString(args.text);
      if (!text) throw new Error('sha256: "text" is required');
      try {
        return await sha256Hex(text);
      } catch (e) {
        throw new Error(`${(e as Error).message}`);
      }
    },

  json_parse:
    () =>
    async (args) => {
      const text = asString(args.text).trim();
      if (!text) throw new Error('json_parse: "text" is required');
      try {
        const v = JSON.parse(text) as unknown;
        const shape = Array.isArray(v) ? `array[${v.length}]` : typeof v;
        return `Valid JSON (${shape}):\n${JSON.stringify(v, null, 2).slice(0, 8000)}`;
      } catch (e) {
        throw new Error(`json_parse: invalid JSON — ${(e as Error).message}`);
      }
    },

  json_query:
    () =>
    async (args) => {
      const text = asString(args.text).trim();
      const path = asString(args.path).trim();
      if (!text) throw new Error('json_query: "text" is required');
      if (!path) throw new Error('json_query: "path" is required (e.g. "a.b[0].c")');
      let v: unknown;
      try {
        v = JSON.parse(text) as unknown;
      } catch (e) {
        throw new Error(`json_query: invalid JSON — ${(e as Error).message}`);
      }
      try {
        return JSON.stringify(getJsonPath(v, path), null, 2) ?? 'null';
      } catch (e) {
        throw new Error(`json_query: ${(e as Error).message}`);
      }
    },

  /* ---------------------------------- time --------------------------------- */

  now: () => async () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
    return [`UTC:   ${d.toISOString()}`, `local: ${local}`, `unix:  ${d.getTime()} ms`].join('\n');
  },

  /* ----------------------------------- id ---------------------------------- */

  uuid: () => async (args) => {
    const n = Math.min(20, Math.max(1, Math.round(asNumber(args.count) ?? 1)));
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      out.push(
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `id_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 10)}`,
      );
    }
    return out.join('\n');
  },

  random_token:
    () =>
    async (args) => {
      const bytes = Math.min(64, Math.max(1, Math.round(asNumber(args.bytes) ?? 16)));
      const c = typeof crypto !== 'undefined' ? crypto : undefined;
      if (!c?.getRandomValues) throw new Error('random_token: secure randomness unavailable here');
      const buf = new Uint8Array(bytes);
      c.getRandomValues(buf);
      let bin = '';
      for (const b of buf) bin += String.fromCharCode(b);
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },

  /* -------------------------------- clipboard ------------------------------ */

  clipboard_copy:
    () =>
    async (args) => {
      const text = asString(args.text);
      if (!text) throw new Error('clipboard_copy: "text" is required');
      if (text.length > 100_000) throw new Error('clipboard_copy: text too long (≤100k chars)');
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      if (!nav?.clipboard?.writeText) {
        throw new Error('clipboard_copy: clipboard unavailable (needs a secure context + permission)');
      }
      try {
        await nav.clipboard.writeText(text);
      } catch (e) {
        throw new Error(`clipboard_copy: denied or failed (${(e as Error).message})`);
      }
      return `Copied ${text.length} chars to the clipboard.`;
    },

  clipboard_read:
    () =>
    async () => {
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      if (!nav?.clipboard?.readText) {
        throw new Error('clipboard_read: clipboard unavailable (needs a secure context + permission)');
      }
      try {
        const text = await nav.clipboard.readText();
        return text || '(clipboard is empty)';
      } catch (e) {
        throw new Error(`clipboard_read: denied or failed (${(e as Error).message})`);
      }
    },

  /* --------------------------------- notify -------------------------------- */

  notify_user:
    () =>
    async (args) => {
      const title = asString(args.title).trim().slice(0, 60);
      if (!title) throw new Error('notify_user: "title" is required');
      const body = asString(args.body).trim().slice(0, 200);
      try {
        const N = typeof Notification !== 'undefined' ? Notification : undefined;
        if (N && N.permission === 'granted') {
          new N(title, body ? { body } : undefined);
          return 'Native notification sent.';
        }
        if (N && N.permission === 'default') {
          const perm = await N.requestPermission().catch(() => 'denied' as NotificationPermission);
          if (perm === 'granted') {
            new N(title, body ? { body } : undefined);
            return 'Native notification sent.';
          }
        }
      } catch {
        // fall through to the in-app note
      }
      try {
        const { toast } = await import('sonner');
        toast.info(title, body ? { description: body } : undefined);
        return 'Shown as an in-app toast (native notifications unavailable or not granted).';
      } catch {
        return `Noted: ${title}${body ? ` — ${body}` : ''} (no toast surface here).`;
      }
    },

  /* --------------------------------- skills -------------------------------- */

  skill_list: () => async () => {
    return SKILLS.map((s) => `${s.name} — ${s.description}`).join('\n');
  },

  skill_show: () => async (args) => {
    const name = asString(args.name).trim();
    const skill = getSkill(name);
    if (!skill) throw new Error(`skill_show: unknown skill "${name}" (see skill_list)`);
    return `${skill.body}\n\n[ducky: follow this playbook step by step for the current task.]`;
  },

  /* ------------------------------ this-pc --------------------------------- */

  pc_status: () => async () => {
    try {
      const s = await pcStatus();
      return `PC bridge LIVE: root "${s.root}" · ${s.platform} · bridge v${s.version}. Real shell + files available via pc_exec/pc_read/pc_write/pc_ls.`;
    } catch (e) {
      throw new Error(`${(e as Error).message}`);
    }
  },

  pc_exec:
    () =>
    async (args) => {
      const command = asString(args.command).trim();
      if (!command) throw new Error('pc_exec: "command" is required');
      const low = command.toLowerCase();
      const DANGEROUS = [
        /\brm\s+-rf\s+(\/|~|\*)/,
        /:\(\)\s*{\s*:\|:\s*&\s*}\s*;?\s*:/,
        /\bsudo\s+(rm|mkfs|dd)\b/,
        /\bformat\s+[a-z]:/i,
        /\bdel\s+\/[fs]/i,
        /\bmkfs\b/,
        /\bdd\s+.*of=\/dev\//,
      ];
      if (DANGEROUS.some((re) => re.test(low))) {
        throw new Error(
          'pc_exec: refused — that command looks destructive at machine level. Ask the human to confirm explicitly, then they can run it themselves or restate it narrowly.',
        );
      }
      try {
        const r = await pcExec(command, asString(args.cwd) || '.', asNumber(args.timeout_ms));
        const head = `[exit code: ${r.exitCode}]`;
        const body = [r.stdout, r.stderr ? `\n[stderr]\n${r.stderr}` : ''].join('').slice(0, 12000);
        return `${head}\n${body || '(no output)'}`;
      } catch (e) {
        throw new Error(`${(e as Error).message}`);
      }
    },

  pc_read:
    () =>
    async (args) => {
      const p = asString(args.path).trim();
      if (!p) throw new Error('pc_read: "path" is required');
      try {
        const f = await pcRead(p);
        const header = f.truncated ? `[pc_read: showing the first 512 KB of ${f.bytes} bytes]\n` : `[pc_read: ${f.bytes} bytes]\n`;
        return header + formatReadWindow(f.content, 1, 2000);
      } catch (e) {
        throw new Error(`${(e as Error).message}`);
      }
    },

  pc_write:
    () =>
    async (args) => {
      const p = asString(args.path).trim();
      if (!p) throw new Error('pc_write: "path" is required');
      const content = asString(args.content);
      try {
        const bytes = await pcWrite(p, content);
        return `Wrote ${bytes} bytes to ${p} on the PC.`;
      } catch (e) {
        throw new Error(`${(e as Error).message}`);
      }
    },

  pc_ls:
    () =>
    async (args) => {
      try {
        const entries = await pcList(asString(args.path) || '.', args.recursive === true);
        if (!entries.length) return 'Directory is empty.';
        const cap = 200;
        const lines = entries.slice(0, cap).map((e) => `${e.dir ? '📁' : '📄'} ${e.path}${e.dir ? '' : ` (${e.size} B)`}`);
        if (entries.length > cap) lines.push(`… +${entries.length - cap} more`);
        return lines.join('\n');
      } catch (e) {
        throw new Error(`${(e as Error).message}`);
      }
    },

  /* ---------------------------------- mcp ---------------------------------- */

  mcp_servers:
    () =>
    async () => {
      const servers = listMcpServers();
      if (!servers.length) {
        return 'No MCP servers connected. The human connects them in Settings → Connections → MCP (e.g. a Blender or Roblox Studio bridge URL).';
      }
      return servers.map((s) => `${s.name} — ${s.url} (id ${s.id.slice(0, 8)})`).join('\n');
    },

  mcp_list:
    () =>
    async () => {
      const servers = listMcpServers();
      if (!servers.length) {
        return 'No MCP servers connected (see mcp_servers).';
      }
      const { tools, errors } = await listMcpTools();
      const lines = tools.map((t) => `${t.server} / ${t.name} — ${t.description.slice(0, 160)}`);
      for (const e of errors) lines.push(`[unreachable] ${e}`);
      if (!lines.length) return 'Servers answered but exposed no tools.';
      return lines.join('\n');
    },

  mcp_call:
    () =>
    async (args) => {
      const server = asString(args.server).trim();
      const tool = asString(args.tool).trim();
      if (!server || !tool) throw new Error('mcp_call: "server" and "tool" are required (see mcp_list)');
      const rawArgs = args.args ?? {};
      if (rawArgs === null || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) {
        throw new Error('mcp_call: "args" must be an object');
      }
      try {
        return await callMcpTool(server, tool, rawArgs as Record<string, unknown>);
      } catch (e) {
        throw new Error(`${(e as Error).message}`);
      }
    },

  /* -------------------------------- config --------------------------------- */

  get_config:
    (ctx) =>
    async () => {
      const s = ctx.getPublicSettings();
      return [
        `policy: ${s.policy} (readonly | ask | auto)`,
        `temperature: ${s.temperature} · max_tokens: ${s.maxTokens}`,
        `max_tool_iterations: ${s.maxToolIterations} · show_reasoning: ${s.showReasoning}`,
        `model: ${s.model}`,
        'secrets: hidden server-side (never exposed here)',
      ].join('\n');
    },

  set_config:
    (ctx) =>
    async (args) => {
      const patch: Record<string, unknown> = {};
      if (args.policy !== undefined) {
        const p = asString(args.policy);
        if (!['readonly', 'ask', 'auto'].includes(p)) {
          throw new Error('set_config: policy must be readonly | ask | auto');
        }
        patch.policy = p;
      }
      const numIn = (v: unknown, lo: number, hi: number, name: string): number | undefined => {
        if (v === undefined) return undefined;
        const n = asNumber(v);
        if (n === undefined || !Number.isFinite(n) || n < lo || n > hi) {
          throw new Error(`set_config: ${name} must be a number in [${lo}, ${hi}]`);
        }
        return n;
      };
      const t = numIn(args.temperature, 0, 2, 'temperature');
      if (t !== undefined) patch.temperature = Math.round(t * 10) / 10;
      const mt = numIn(args.max_tokens, 512, 16384, 'max_tokens');
      if (mt !== undefined) patch.maxTokens = Math.round(mt);
      const it = numIn(args.max_tool_iterations, 2, 16, 'max_tool_iterations');
      if (it !== undefined) patch.maxToolIterations = Math.round(it);
      if (args.show_reasoning !== undefined) {
        if (typeof args.show_reasoning !== 'boolean') throw new Error('set_config: show_reasoning must be boolean');
        patch.showReasoning = args.show_reasoning;
      }
      if (!Object.keys(patch).length) throw new Error('set_config: nothing to change (pass at least one field)');
      const changed = ctx.updatePublicSettings(
        patch as { policy?: string; temperature?: number; maxTokens?: number; maxToolIterations?: number; showReasoning?: boolean },
      );
      return `Updated: ${changed.join(', ')}.`;
    },

  /* -------------------------------- sessions ------------------------------- */

  session_list:
    (ctx) =>
    async () => {
      const items = ctx.listSessionsBrief();
      if (!items.length) return 'No sessions. Use session_new to start one.';
      return items
        .map(
          (s) =>
            `${s.id.slice(0, 8)}${s.id === ctx.sessionId ? ' ●current' : ''}  ${s.title}\n  ${s.messages} msgs · ${s.files} files · ${new Date(s.updatedAt).toISOString()}`,
        )
        .join('\n');
    },

  session_new:
    (ctx) =>
    async (args) => {
      const title = asString(args.title).trim().slice(0, 80);
      const id = ctx.createSessionNamed(title);
      return `Started session ${id.slice(0, 8)}${title ? ` ("${title}")` : ''}. Use session_switch to move the UI there.`;
    },

  session_rename:
    (ctx) =>
    async (args) => {
      const prefix = asString(args.id).trim();
      const title = asString(args.title).trim().slice(0, 80);
      if (!prefix) throw new Error('session_rename: "id" is required (see session_list)');
      if (!title) throw new Error('session_rename: "title" must be 1–80 chars');
      const ok = ctx.renameSessionById(prefix, title);
      if (!ok) throw new Error(`session_rename: no session starts with "${prefix}"`);
      return `Renamed to "${title}".`;
    },

  session_switch:
    (ctx) =>
    async (args) => {
      const prefix = asString(args.id).trim();
      if (!prefix) throw new Error('session_switch: "id" is required (see session_list)');
      const ok = ctx.switchSessionById(prefix);
      if (!ok) throw new Error(`session_switch: no session starts with "${prefix}"`);
      return 'UI switched. This run keeps its own binding; the next message lands in the new session.';
    },

  /* --------------------------- text transforms ----------------------------- */

  sort_lines:
    () =>
    async (args) => {
      const text = asString(args.text);
      if (!text) throw new Error('sort_lines: "text" is required');
      if (text.length > 200_000) throw new Error('sort_lines: text too long (≤200k chars)');
      return sortLines(text, { reverse: args.reverse === true, numeric: args.numeric === true });
    },

  dedupe_lines:
    () =>
    async (args) => {
      const text = asString(args.text);
      if (!text) throw new Error('dedupe_lines: "text" is required');
      if (text.length > 200_000) throw new Error('dedupe_lines: text too long (≤200k chars)');
      const { text: out, removed } = dedupeLines(text, args.ignore_case === true);
      return `${out}\n[ducky: removed ${removed} duplicate line(s)]`;
    },

  count_words:
    () =>
    async (args) => {
      const text = asString(args.text);
      if (!text) return 'lines: 0 · words: 0 · chars: 0 · bytes: 0';
      const s = fileInfoSummary(text);
      return `lines: ${s.lines} · words: ${s.words} · chars: ${s.chars} · bytes: ${s.bytes}`;
    },

  /* ------------------------------ patch: regex ----------------------------- */

  regex_edit:
    (ctx) =>
    async (args) => {
      const p = normalizePath(asString(args.path));
      if (!p) throw new Error('regex_edit: "path" is required');
      const content = ctx.readFile(p);
      if (content === null) throw new Error(`File not found: ${p} (read it first)`);
      const pattern = asString(args.pattern);
      if (!pattern) throw new Error('regex_edit: "pattern" is required');
      try {
        const { text, count } = regexReplace(content, pattern, asString(args.replacement), asString(args.flags));
        if (count === 0) throw new Error(`regex_edit: pattern matched 0 times in ${p}`);
        ctx.writeFile(p, text);
        return `Edited ${p}: ${count} replacement(s).`;
      } catch (e) {
        const msg = (e as Error).message;
        throw new Error(msg.startsWith('regex:') ? msg.replace(/^regex: /, 'regex_edit: ') : msg);
      }
    },

  /* --------------------------- fs-plus: overview --------------------------- */

  workspace_stats:
    (ctx) =>
    async () => {
      const files = ctx.listWorkspaceFiles();
      if (!files.length) return 'Workspace is empty.';
      const snap = ctx.readWorkspaceSnapshot();
      let bytes = 0;
      const sizes: Array<[string, number]> = [];
      const exts = new Map<string, number>();
      for (const f of files) {
        const b = new TextEncoder().encode(snap[f] ?? '').length;
        bytes += b;
        sizes.push([f, b]);
        const dot = f.lastIndexOf('.');
        const ext = dot > 0 ? f.slice(dot).toLowerCase() : '(no ext)';
        exts.set(ext, (exts.get(ext) ?? 0) + 1);
      }
      sizes.sort((a, b) => b[1] - a[1]);
      const kb = (n: number) => (n / 1024).toFixed(1);
      const lines = [
        `${files.length} files · ${kb(bytes)} KB total`,
        `largest: ${sizes
          .slice(0, 5)
          .map(([f, b]) => `${f} (${kb(b)} KB)`)
          .join(', ')}`,
        `by type: ${[...exts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([e, n]) => `${e}×${n}`)
          .join(' ')}`,
      ];
      return lines.join('\n');
    },

  preview_csv:
    (ctx) =>
    async (args) => {
      const p = normalizePath(asString(args.path));
      if (!p) throw new Error('preview_csv: "path" is required');
      const content = ctx.readFile(p);
      if (content === null) throw new Error(`File not found: ${p}`);
      const rows = Math.min(50, Math.max(1, Math.round(asNumber(args.rows) ?? 10)));
      const delim = asString(args.delimiter) || ',';
      try {
        return `${p}:\n${previewCsv(content, rows, delim)}`;
      } catch (e) {
        throw new Error(`preview_csv: ${(e as Error).message}`);
      }
    },
};
