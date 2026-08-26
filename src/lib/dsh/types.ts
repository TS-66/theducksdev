/**
 * DSH Web — DeepSeek Harness Web Edition
 * Canonical shared types. DO NOT edit without updating both engine & UI sides.
 * Mirrors concepts from https://github.com/deepseek-ai/deepseek-harness
 */

/* ------------------------------ Wire protocol ----------------------------- */

export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCallData {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON-encoded args string
  };
}

/** OpenAI-compatible message sent over the wire */
export interface WireMessage {
  role: Role;
  content: string | null;
  tool_calls?: ToolCallData[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/* ------------------------------- Chat / UI -------------------------------- */

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
}

export interface ApprovalRequest {
  id: string;
  toolName: string;
  argsPreview: string;
  reason?: string;
  resolve?: (approve: boolean) => void;
}

export interface ChatMessage {
  id: string;
  role: Role;
  /** Text content of the message. */
  content: string;
  /** deepseek-reasoner chain-of-thought stream */
  reasoning?: string;
  /** assistant messages may carry tool calls */
  toolCalls?: ToolCallData[];
  /** for role=tool results */
  toolCallId?: string;
  toolName?: string;
  /** execution time for tool results, ms */
  durationMs?: number;
  status?: "streaming" | "done" | "error" | "aborted";
  error?: string;
  meta?: {
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    iteration?: number;
  };
  createdAt: number;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  starred: boolean;
  messages: ChatMessage[];
  /** virtual workspace filesystem: absolute-ish path -> content */
  workspace: Record<string, string>;
  todos: TodoItem[];
  planMode: boolean;
  planDraft?: string;
  /** running counters */
  stats: { promptTokens: number; completionTokens: number; toolCalls: number };
}

/* -------------------------------- Plugins --------------------------------- */

export interface ToolDefinition {
  /** model-facing name, e.g. "read_file" */
  name: string;
  pluginId: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
  /** whether the permission policy should gate this tool */
  sideEffects?: boolean;
}

export interface PluginManifest {
  /** e.g. "@deepseek-ai/dsh-tool-bash" */
  id: string;
  name: string;
  version: string;
  description: string;
  tools: string[];
  category: "filesystem" | "shell" | "planning" | "delegation" | "web" | "interaction" | "meta";
  defaultEnabled: boolean;
}

/* -------------------------------- Settings -------------------------------- */

export type PermissionPolicy = "auto" | "ask" | "readonly";

export interface Settings {
  apiKey: string;
  /** default: https://api.deepseek.com */
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  policy: PermissionPolicy;
  systemPromptExtra: string;
  maxToolIterations: number;
  showReasoning: boolean;
}

/* ------------------------------- Engine events ---------------------------- */

export type AgentEvent =
  | { type: "iteration"; n: number }
  | { type: "text-delta"; delta: string }
  | { type: "reasoning-delta"; delta: string }
  | { type: "tool-call-start"; callId: string; name: string; argsRaw: string }
  | { type: "tool-call-end"; callId: string; name: string; ok: boolean; result: string; durationMs: number }
  | { type: "approval-request"; request: ApprovalRequest }
  | { type: "usage"; promptTokens?: number; completionTokens?: number }
  | { type: "done"; aborted: boolean }
  | { type: "error"; message: string };

export interface RunLoopOptions {
  sessionId: string;
  settings: Settings;
  tools: ToolSchema[];
  /** executors keyed by tool name */
  executors: Record<string, (args: Record<string, unknown>) => Promise<string>>;
  onEvent: (e: AgentEvent) => void;
  signal: AbortSignal;
  /** ask the human to approve; resolves true/false */
  requestApproval?: (req: Omit<ApprovalRequest, "id">) => Promise<boolean>;
  maxIterations?: number;
}

export interface StoredState {
  sessions: Session[];
  activeSessionId: string | null;
  settings: Settings;
  disabledPlugins: string[];
}
