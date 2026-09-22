/**
 * Ducky AI | Coder — connection health: test + model discovery.
 *
 * Client-side wrappers over our own proxies (`/api/models` for listing,
 * `/api/chat` for the live probe). Used by Settings → Connections and the
 * `/models` slash command. DOM-free except where noted; fully stub-testable.
 */

export interface DiscoveredModel {
  id: string;
}

/** List model ids served by an endpoint (via our proxy — CORS-safe). */
export async function discoverModels(baseUrl: string, apiKey: string): Promise<DiscoveredModel[]> {
  const res = await fetch("/api/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseUrl, apiKey }),
  });
  let payload: { models?: DiscoveredModel[]; error?: { message?: string } } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    // fall through
  }
  if (!res.ok) throw new Error(payload.error?.message ?? `Discovery failed (HTTP ${res.status})`);
  return Array.isArray(payload.models) ? payload.models : [];
}

export interface ConnectionTest {
  ok: boolean;
  latencyMs: number;
  models: number;
  message: string;
}

/**
 * Full connection check: reachability + auth + model list in one timed pass.
 * Never throws — returns a report the UI can render.
 */
export async function testConnection(baseUrl: string, apiKey: string): Promise<ConnectionTest> {
  const started = Date.now();
  if (!baseUrl.trim() || !apiKey.trim()) {
    return { ok: false, latencyMs: 0, models: 0, message: "Base URL and API key are both required." };
  }
  try {
    const models = await discoverModels(baseUrl, apiKey);
    const ms = Date.now() - started;
    if (!models.length) {
      return { ok: true, latencyMs: ms, models: 0, message: `Reachable in ${ms} ms, but the endpoint listed no models.` };
    }
    return { ok: true, latencyMs: ms, models: models.length, message: `Connected in ${ms} ms — ${models.length} model(s) found.` };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - started, models: 0, message: (e as Error).message };
  }
}
