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
  /** servability of the selected model (present only when a model was given) */
  modelCheck?: { ok: boolean; message: string };
}

export interface ModelCheck {
  ok: boolean;
  message: string;
}

/**
 * Verify one model id is actually SERVABLE (not just listed): some providers
 * list retired ids in /models that 404 on use ("Function …: Not found for
 * account"). A tiny max_tokens:1 probe settles it. Never throws.
 */
export async function verifyModel(baseUrl: string, apiKey: string, model: string): Promise<ModelCheck> {
  if (!model.trim()) return { ok: false, message: "No model id to verify." };
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl,
        apiKey,
        model: model.trim(),
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        stream: false,
      }),
    });
    if (res.ok) {
      try {
        await res.body?.cancel();
      } catch {
        // socket cleanup best-effort; the 1-token probe already answered
      }
      return { ok: true, message: `"${model.trim()}" is live and servable.` };
    }
    let detail = `HTTP ${res.status}`;
    try {
      const payload = (await res.json()) as { error?: { message?: string } };
      if (payload.error?.message) detail = payload.error.message.slice(0, 220);
    } catch {
      // keep generic
    }
    return { ok: false, message: `"${model.trim()}" is NOT servable: ${detail}` };
  } catch (e) {
    return { ok: false, message: `Model probe failed: ${(e as Error).message}` };
  }
}

/**
 * Full connection check: reachability + auth + model list in one timed pass,
 * plus an optional servability probe for the selected model.
 * Never throws — returns a report the UI can render.
 */
export async function testConnection(
  baseUrl: string,
  apiKey: string,
  model?: string,
): Promise<ConnectionTest> {
  const started = Date.now();
  if (!baseUrl.trim() || !apiKey.trim()) {
    return { ok: false, latencyMs: 0, models: 0, message: "Base URL and API key are both required." };
  }
  try {
    const models = await discoverModels(baseUrl, apiKey);
    const ms = Date.now() - started;
    const trimmed = (model ?? "").trim();
    const modelCheck = trimmed ? await verifyModel(baseUrl, apiKey, trimmed) : undefined;
    if (!models.length) {
      return {
        ok: modelCheck?.ok ?? true,
        latencyMs: ms,
        models: 0,
        message: `Reachable in ${ms} ms, but the endpoint listed no models.${modelCheck ? ` Model: ${modelCheck.message}` : ""}`,
        ...(modelCheck ? { modelCheck } : {}),
      };
    }
    const ok = modelCheck ? modelCheck.ok : true;
    return {
      ok,
      latencyMs: ms,
      models: models.length,
      message: `Connected in ${ms} ms — ${models.length} model(s) found.${modelCheck ? ` Model: ${modelCheck.message}` : ""}`,
      ...(modelCheck ? { modelCheck } : {}),
    };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - started, models: 0, message: (e as Error).message };
  }
}
