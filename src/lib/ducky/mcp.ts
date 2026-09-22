/**
 * Ducky AI | Coder — MCP (Model Context Protocol) client for Streamable-HTTP
 * servers + connection registry.
 *
 * Speaks JSON-RPC (`tools/list`, `tools/call`) directly from the browser to
 * any MCP server with an HTTP endpoint — including bridges for Blender,
 * Roblox Studio, browsers, and file systems. Servers are user-configured
 * (Settings → Connections → MCP, or `mcp_add` below… no — registry edits
 * stay in the UI; the agent only READS and CALLS). DOM-free and stub-testable.
 *
 * Typical local bridges (run their app, paste the URL):
 *   Blender MCP bridge … http://127.0.0.1:9876/mcp  (example — use your bridge's URL)
 *   Roblox Studio bridge … http://127.0.0.1:8890/mcp (example — use your bridge's URL)
 */

export interface McpServer {
  id: string;
  name: string;
  url: string;
}

export interface McpTool {
  server: string;
  name: string;
  description: string;
}

const MCP_KEY = "ducky-mcp-servers-v1";
const RESULT_CAP = 8000;

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

const memFallback: McpServer[] = [];

const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export function listMcpServers(): McpServer[] {
  if (!hasLocalStorage()) return [...memFallback];
  try {
    const raw = localStorage.getItem(MCP_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as McpServer[];
    return Array.isArray(arr) ? arr.filter((s) => s && typeof s.url === "string") : [];
  } catch {
    return [];
  }
}

function storeMcpServers(items: McpServer[]): void {
  if (!hasLocalStorage()) {
    memFallback.length = 0;
    memFallback.push(...items);
    return;
  }
  try {
    localStorage.setItem(MCP_KEY, JSON.stringify(items));
  } catch {
    // quota — registry keeps working in RAM
  }
}

/** Add a server (URL must be absolute http(s)). Returns the entry. */
export function addMcpServer(name: string, url: string): McpServer {
  const cleanName = name.trim().slice(0, 60) || "mcp";
  const cleanUrl = url.trim();
  if (!/^https?:\/\//i.test(cleanUrl)) throw new Error("MCP server URL must be absolute http(s)");
  const items = listMcpServers();
  if (items.length >= 10) throw new Error("MCP registry full (10 servers). Remove one first.");
  if (items.some((s) => s.url === cleanUrl)) throw new Error("That MCP URL is already registered.");
  const entry: McpServer = { id: uid(), name: cleanName, url: cleanUrl };
  storeMcpServers([...items, entry]);
  return entry;
}

/** Remove by id prefix. Returns true when removed. */
export function removeMcpServer(idPrefix: string): boolean {
  const items = listMcpServers();
  const hit = items.find((s) => s.id.startsWith(idPrefix));
  if (!hit) return false;
  storeMcpServers(items.filter((s) => s.id !== hit.id));
  return true;
}

/* ------------------------------ JSON-RPC I/O ----------------------------- */

let rpcId = 0;

interface RpcResponse {
  result?: { tools?: Array<{ name?: string; description?: string; inputSchema?: unknown }>; content?: unknown };
  error?: { message?: string; code?: number };
}

/** Parse a Streamable-HTTP response: plain JSON or an SSE stream. */
export function parseRpcPayload(text: string): RpcResponse {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("MCP server returned an empty response");
  if (trimmed.startsWith("{")) return JSON.parse(trimmed) as RpcResponse;
  // SSE: scan data: lines, keep the last JSON-RPC envelope
  let last: RpcResponse | null = null;
  for (const line of trimmed.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const payload = t.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const parsed = JSON.parse(payload) as RpcResponse;
      if (parsed && typeof parsed === "object" && ("result" in parsed || "error" in parsed)) {
        last = parsed;
      }
    } catch {
      // keep scanning — some servers send progress events
    }
  }
  if (!last) throw new Error("MCP server stream contained no JSON-RPC response");
  return last;
}

async function rpc(url: string, method: string, params?: Record<string, unknown>): Promise<RpcResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params: params ?? {} }),
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MCP ${method} failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  let parsed: RpcResponse;
  try {
    parsed = parseRpcPayload(text);
  } catch (e) {
    throw new Error(`MCP ${method}: ${(e as Error).message}`);
  }
  if (parsed.error) throw new Error(`MCP ${method}: ${parsed.error.message ?? `code ${parsed.error.code}`}`);
  return parsed;
}

/** List tools across ALL configured servers (failures reported per server). */
export async function listMcpTools(): Promise<{ tools: McpTool[]; errors: string[] }> {
  const servers = listMcpServers();
  const tools: McpTool[] = [];
  const errors: string[] = [];
  for (const s of servers) {
    try {
      const r = await rpc(s.url, "tools/list");
      for (const t of r.result?.tools ?? []) {
        if (typeof t?.name === "string") {
          tools.push({ server: s.name, name: t.name, description: String(t.description ?? "") });
        }
      }
    } catch (e) {
      errors.push(`${s.name}: ${(e as Error).message}`);
    }
  }
  return { tools, errors };
}

/** Call one tool on the server that owns it (first match by server+name). */
export async function callMcpTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<string> {
  const server = listMcpServers().find(
    (s) => s.name.toLowerCase() === serverName.trim().toLowerCase(),
  );
  if (!server) throw new Error(`Unknown MCP server "${serverName}" (see mcp_servers).`);
  const r = await rpc(server.url, "tools/call", { name: toolName, arguments: args });
  const content = r.result?.content;
  const text = typeof content === "string" ? content : JSON.stringify(content ?? r.result ?? null, null, 2);
  return text.length > RESULT_CAP ? `${text.slice(0, RESULT_CAP)}\n[ducky: MCP result capped at ${RESULT_CAP} chars]` : text;
}

/** Rendered block for the system prompt ("" when no servers). */
export function renderMcpForPrompt(): string {
  const servers = listMcpServers();
  if (!servers.length) return "";
  return servers.map((s) => `- ${s.name}: ${s.url} (mcp_list, then mcp_call with server "${s.name}")`).join("\n");
}
