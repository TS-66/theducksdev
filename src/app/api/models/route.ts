/**
 * Ducky AI | Coder — model discovery proxy.
 *
 * GET {base}/models through the server so the browser never touches CORS
 * and server fallback credentials stay server-side. The client sends its own
 * baseUrl/apiKey when configured; otherwise the server fallback is used.
 * Returns `{ models: [{ id }] }` — ids only, never secrets.
 */

import { resolveProviderEnv } from "../providers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

function normalizeBase(raw: string): string {
  let base = raw.trim().replace(/\/+$/, "");
  base = base.replace(/\/chat\/completions$/i, "");
  return base;
}

export async function POST(req: Request): Promise<Response> {
  let body: { baseUrl?: string; apiKey?: string };
  try {
    body = (await req.json()) as { baseUrl?: string; apiKey?: string };
  } catch {
    return Response.json({ error: { message: "Invalid JSON body." } }, { status: 400 });
  }

  const server = resolveProviderEnv();
  const apiKey = clean(body.apiKey) || server.apiKey;
  const rawBase = clean(body.baseUrl) || server.baseUrl;
  if (!apiKey || !rawBase) {
    return Response.json(
      { error: { message: "Set base URL + API key in Settings → Connections first." } },
      { status: 400 },
    );
  }

  const candidates = [`${normalizeBase(rawBase)}/models`];
  if (!/\/v\d+[a-z]*$/i.test(normalizeBase(rawBase))) {
    candidates.push(`${normalizeBase(rawBase)}/v1/models`);
  }

  let lastError = "Upstream unreachable.";
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 404) continue;
      if (!res.ok) {
        lastError = `Endpoint answered HTTP ${res.status} — check the key and base URL.`;
        continue;
      }
      const data = (await res.json()) as { data?: Array<{ id?: string }> };
      const models = Array.isArray(data.data)
        ? data.data.filter((m) => typeof m?.id === "string").map((m) => ({ id: m.id as string }))
        : [];
      return Response.json({ models }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      lastError = `Could not reach the endpoint: ${(e as Error).message}`;
    }
  }
  const status = /HTTP 401/.test(lastError) ? 401 : 502;
  return Response.json({ error: { message: lastError } }, { status });
}
