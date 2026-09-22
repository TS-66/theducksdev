/**
 * Ducky AI | Coder — This-PC bridge client.
 *
 * Talks to `ducky bridge` (loopback HTTP + token) so the terminal, the
 * agent (pc_* tools) and the status bar can reach the REAL machine: real
 * shell, real files rooted at the bridge's --root. The browser can never
 * touch the PC otherwise — starting the bridge IS the explicit consent,
 * Ctrl+C revokes it instantly.
 *
 * DOM-free and stub-testable (fetch is the only seam).
 */

export interface PcConfig {
  port: number;
  token: string;
}

const PC_KEY = "ducky-pc-bridge-v1";

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

let memFallback: PcConfig | null = null;

export function getPcConfig(): PcConfig | null {
  if (!hasLocalStorage()) return memFallback;
  try {
    const raw = localStorage.getItem(PC_KEY);
    if (!raw) return memFallback;
    const p = JSON.parse(raw) as Partial<PcConfig>;
    if (typeof p.port !== "number" || typeof p.token !== "string" || !p.token) return null;
    return { port: p.port, token: p.token };
  } catch {
    return null;
  }
}

export function setPcConfig(port: number, token: string): void {
  const cfg = { port, token };
  memFallback = cfg;
  try {
    if (hasLocalStorage()) localStorage.setItem(PC_KEY, JSON.stringify(cfg));
  } catch {
    // private mode — RAM copy keeps this session working
  }
}

export function clearPcConfig(): void {
  memFallback = null;
  try {
    if (hasLocalStorage()) localStorage.removeItem(PC_KEY);
  } catch {
    // noop
  }
}

function base(): { url: string; token: string } {
  const cfg = getPcConfig();
  if (!cfg) throw new Error("PC bridge not connected — run `ducky bridge` on your machine, then paste its token in Settings → Connections → This PC.");
  return { url: `http://127.0.0.1:${cfg.port}`, token: cfg.token };
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { url, token } = base();
  let res: Response;
  try {
    res = await fetch(`${url}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, token }),
      signal: AbortSignal.timeout(95000),
    });
  } catch (e) {
    throw new Error(`PC bridge unreachable (${(e as Error).message}) — is \`ducky bridge\` running on port ${getPcConfig()?.port}?`);
  }
  let payload: { ok?: boolean; error?: string } & Record<string, unknown> = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    throw new Error(`PC bridge answered HTTP ${res.status} (not JSON).`);
  }
  if (!res.ok || payload.ok === false) {
    throw new Error(`PC bridge: ${payload.error ?? `HTTP ${res.status}`}`);
  }
  return payload as T;
}

export interface PcStatus {
  ok: boolean;
  root: string;
  platform: string;
  version: string;
}

/** Ping the bridge (/status is intentionally open — pairing check). */
export async function pcStatus(): Promise<PcStatus> {
  const cfg = getPcConfig();
  if (!cfg) {
    throw new Error("PC bridge not connected — run `ducky bridge`, then paste its token in Settings → Connections → This PC.");
  }
  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${cfg.port}/status`, { signal: AbortSignal.timeout(8000) });
  } catch (e) {
    throw new Error(`PC bridge unreachable (${(e as Error).message}) — run \`ducky bridge\` first.`);
  }
  const data = (await res.json()) as PcStatus & { ok?: boolean };
  if (!res.ok || !data || data.ok === false) throw new Error("PC bridge answered badly.");
  return {
    ok: true,
    root: String(data.root ?? ""),
    platform: String(data.platform ?? ""),
    version: String(data.version ?? ""),
  };
}

export interface PcExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Run a REAL shell command on the PC (rooted at the bridge --root). */
export async function pcExec(command: string, cwd = ".", timeoutMs = 30000): Promise<PcExecResult> {
  if (!command.trim()) throw new Error("pc_exec: command must be non-empty");
  const r = await post<PcExecResult & { ok: boolean }>("/exec", { command, cwd, timeoutMs });
  return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr };
}

export interface PcFile {
  content: string;
  bytes: number;
  truncated: boolean;
}

/** Read a REAL file from the PC. */
export async function pcRead(path: string): Promise<PcFile> {
  if (!path.trim()) throw new Error("pc_read: path must be non-empty");
  return post<PcFile & { ok: boolean }>("/read", { path });
}

/** Write a REAL file on the PC (parents created). */
export async function pcWrite(path: string, content: string): Promise<number> {
  if (!path.trim()) throw new Error("pc_write: path must be non-empty");
  const r = await post<{ bytes: number } & { ok: boolean }>("/write", { path, content });
  return r.bytes;
}

export interface PcEntry {
  path: string;
  dir: boolean;
  size: number;
}

/** List a REAL directory on the PC. */
export async function pcList(path = ".", recursive = false): Promise<PcEntry[]> {
  const r = await post<{ entries: PcEntry[] } & { ok: boolean }>("/ls", { path, recursive });
  return Array.isArray(r.entries) ? r.entries : [];
}
