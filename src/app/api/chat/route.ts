/**
 * Ducky AI | Coder — stateless SSE pass-through proxy.
 *
 * Serverless-safe: pure fetch, no Node APIs (only `process.env`).
 * Bring-your-own-model: the user configures base URL + API key + model id
 * in Settings → Connections (their browser, their key). Server env
 * (AI_BASE_URL / AI_API_KEY / AI_MODEL_ID, or the DUCKY_SECRETS_FILE JSON
 * your database writes) is only a shared fallback. Server keys never reach
 * the client; client keys pass through untouched.
 *
 * Strong connections: every candidate endpoint gets up to 3 attempts with
 * backoff; transient statuses (408/425/429/5xx) and network blips retry,
 * auth/routing errors fail fast with actionable messages.
 *
 * Base URL tolerance (all resolve to the same endpoint):
 *   https://api.example.com/v1                  ← recommended
 *   https://api.example.com                     ← /v1 appended automatically on 404
 *   https://api.example.com/v1/chat/completions ← full endpoint path is stripped
 */

import { resolveProviderEnv } from "../providers";

export const maxDuration = 60;

interface ChatProxyBody {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  messages?: unknown[];
  tools?: unknown[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  [key: string]: unknown;
}

interface ChatProxyPayload {
  model: string;
  stream: boolean;
  stream_options?: { include_usage: boolean };
  [key: string]: unknown;
}

function jsonError(status: number, message: string): Response {
  return Response.json({ error: { message } }, { status });
}

/** Trim stray whitespace/newlines from values that are typically pasted. */
function clean(value: string | undefined): string {
  return (value ?? '').trim();
}

/** Strip trailing slashes and a pasted full endpoint path. */
function normalizeBase(raw: string): string {
  let base = raw.trim().replace(/\/+$/, '');
  base = base.replace(/\/chat\/completions$/i, '');
  return base;
}

/** True when the base already contains a version segment like /v1 or /v2. */
function hasVersionSegment(base: string): boolean {
  return /\/v\d+[a-z]*$/i.test(base) || /\/v\d+(?:[a-z]+)?\//i.test(base);
}

/** Extract a human-readable message from an upstream error body. */
async function readErrorMessage(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return '';
    try {
      const parsed = JSON.parse(text) as {
        error?: { message?: string } | string;
        message?: string;
      };
      const inner =
        typeof parsed.error === 'string' ? parsed.error : parsed.error?.message;
      return inner ?? parsed.message ?? text.slice(0, 500);
    } catch {
      return text.slice(0, 500);
    }
  } catch {
    return '';
  }
}

const STREAM_HEADERS: HeadersInit = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  // Disable proxy buffering (nginx-style layers) so SSE chunks flush
  // immediately instead of arriving in delayed bursts.
  'X-Accel-Buffering': 'no',
};

function streamResponse(body: ReadableStream<Uint8Array>): Response {
  return new Response(body, { status: 200, headers: STREAM_HEADERS });
}

export async function POST(req: Request): Promise<Response> {
  let body: ChatProxyBody;
  try {
    body = (await req.json()) as ChatProxyBody;
  } catch {
    return jsonError(400, 'Invalid JSON body.');
  }

  // Resolution order: the user's own connection (Settings → Connections)
  // wins — it's their key and endpoint. Server env (AI_*) is only a shared
  // fallback so a deployment works with zero per-user setup. Either way the
  // key never leaves this process.
  const server = resolveProviderEnv();
  const apiKey = clean(body.apiKey) || server.apiKey;
  if (!apiKey) {
    return jsonError(
      400,
      'No API key configured. Open Settings → Connections and add your base URL + API key + model (or set AI_API_KEY as a server env var).',
    );
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonError(400, 'Missing required field: messages.');
  }
  const model = clean(body.model) || server.model;
  if (!model) {
    return jsonError(
      400,
      'No model selected. Pick one in Settings → Connections (use Discover) or set AI_MODEL_ID on the server.',
    );
  }

  const rawBase = clean(body.baseUrl) || server.baseUrl;
  if (!rawBase) {
    return jsonError(
      400,
      'No endpoint configured. Set your base URL in Settings → Connections (or AI_BASE_URL on the server).',
    );
  }
  const base = normalizeBase(rawBase);

  // Candidate endpoints: the URL exactly as configured first, then a /v1
  // fallback for gateways that need the version segment. A 404 on the first
  // candidate automatically retries the second — misformatted base URLs
  // (missing /v1) still work.
  const candidates: string[] = [`${base}/chat/completions`];
  if (!hasVersionSegment(base)) {
    candidates.push(`${base}/v1/chat/completions`);
  }

  // Forward everything verbatim except our own proxy-control fields; force
  // streaming with usage accounting when tools are in play. The model id
  // passes through untouched — the key is injected here and never reaches
  // the client beyond what the user typed themselves.
  const { baseUrl: _b, apiKey: _k, ...forward } = body;
  void _b;
  void _k;

  const payload: ChatProxyPayload = {
    ...forward,
    model,
    stream: true,
    ...(Array.isArray(body.tools) && body.tools.length > 0
      ? { stream_options: { include_usage: true } }
      : {}),
  };

  const requestInit = (payloadBody: ChatProxyPayload): RequestInit => ({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payloadBody),
  });

  // Strong connections: per-endpoint attempts with backoff. Transient
  // failures (network blip, 429, 502/503/504) retry before we give up;
  // routing errors (401/404) fail fast with actionable messages.
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

  let upstream: Response | null = null;
  let endpointUsed = '';
  let lastNetworkError: string | null = null;
  for (let i = 0; i < candidates.length; i++) {
    endpointUsed = candidates[i];
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(750 * attempt);
      try {
        upstream = await fetch(endpointUsed, requestInit(payload));
      } catch (e) {
        lastNetworkError = (e as Error).message;
        upstream = null;
        continue; // network blip — retry
      }
      if (RETRYABLE.has(upstream.status)) continue; // transient — retry
      break;
    }
    if (upstream && !RETRYABLE.has(upstream.status)) {
      // Wrong path (e.g. base URL missing the version segment) → try next.
      if (upstream.status === 404 && i < candidates.length - 1) continue;
      break;
    }
  }
  if (!upstream && lastNetworkError) {
    return jsonError(502, `Upstream unreachable after retries: ${lastNetworkError}`);
  }

  if (!upstream || !upstream.ok || !upstream.body) {
    const status = upstream?.status ?? 502;
    let message = await readErrorMessage(upstream as Response);

    // Some OpenAI-compatible backends reject `stream_options` — retry once
    // without it before giving up.
    if (
      status === 400 &&
      payload.stream_options &&
      /stream_options|include_usage/i.test(message)
    ) {
      const retryPayload: ChatProxyPayload = { ...payload };
      delete retryPayload.stream_options;
      try {
        const retry = await fetch(endpointUsed, requestInit(retryPayload));
        if (retry.ok && retry.body) return streamResponse(retry.body);
        message = await readErrorMessage(retry);
      } catch {
        // fall through to the error below
      }
    }

    if (!message) message = `Upstream error (HTTP ${status}).`;
    if (status === 401) {
      message = `${message} — the API key was rejected. Check it in Settings → Connections (or AI_API_KEY on the server).`.trim();
    }
    if (status === 404) {
      // Providers (e.g. NVIDIA) list retired ids in /models that are no
      // longer servable: "Function '<uuid>': Not found for account '...'".
      if (/not found for account|function '[^']+': not found/i.test(message)) {
        message =
          `The model "${model}" is listed but NOT servable (retired or removed for your account). ` +
          `Pick a live one: Settings → Connections → Discover, then Test.`.trim();
      } else {
        message = `${message} — the model id "${model}" was not found. Use Discover in Settings → Connections to list what your endpoint serves.`.trim();
      }
    }
    if (status === 429) {
      message = `${message} — rate limited. Wait a moment and retry; lower max iterations or tokens if it persists.`.trim();
    }
    return jsonError(status, message);
  }

  return streamResponse(upstream.body);
}
