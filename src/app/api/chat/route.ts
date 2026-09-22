/**
 * Ducky AI | Coder — stateless SSE pass-through proxy.
 *
 * Serverless-safe: pure fetch, no Node APIs (only `process.env`). The
 * endpoint, credentials and backend model id are **deployment secrets** that
 * live exclusively in server environment variables (or the JSON file your
 * own database writes to DUCKY_SECRETS_FILE) — they are never sent to,
 * stored by, or visible from the client.
 *
 * THE one provider: NVIDIA Build serving Nemotron 3 Ultra
 * (frontier reasoning + agentic coding, tool calling, streaming reasoning).
 * Get a free key at build.nvidia.com → Generate Key, then on the server:
 *   ducky setup                       # paste nvapi-... once, hidden input
 * or set env directly:
 *   AI_API_KEY=nvapi-...              # server env ONLY — never in UI/git
 * (base URL + model fill in automatically; AI_MODEL_ID / AI_BASE_URL
 * override them only if you know what you're doing)
 *
 * Generic OpenAI-compatible endpoint:
 *   AI_BASE_URL   – OpenAI-compatible base URL  (e.g. https://api.example.com/v1)
 *   AI_API_KEY    – bearer key for that endpoint
 *   AI_MODEL_ID   – upstream model id that powers "Ducky 3.5 Coder"
 *
 * Base URL tolerance (all resolve to the same endpoint):
 *   https://api.example.com/v1                  ← recommended
 *   https://api.example.com                     ← /v1 appended automatically on 404
 *   https://api.example.com/v1/chat/completions ← full endpoint path is stripped
 *
 * The user-facing model id is always `ducky-3.5-coder` (Ducky 3.5 Coder).
 * It is translated to the server-resolved upstream model here so the
 * upstream id never reaches the client.
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

  // Resolution order: server env (deployment config wins) → client-provided
  // (local-dev convenience only). Stale browser-side values persisted by
  // older app versions must never override a correctly configured deployment.
  // Single provider (NVIDIA): base URL + model fill in automatically, so one
  // server-side key is the whole setup. Keys may also arrive via your
  // database through DUCKY_SECRETS_FILE — either way they never leave this
  // process.
  const server = resolveProviderEnv();
  const apiKey = server.apiKey || clean(body.apiKey);
  if (!apiKey) {
    return jsonError(
      400,
      'No API key configured. Run `ducky setup` on the server (one free NVIDIA key) or set AI_API_KEY as a server env var — the key is never entered in the browser.',
    );
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonError(400, 'Missing required field: messages.');
  }

  const rawBase = server.baseUrl || clean(body.baseUrl);
  if (!rawBase) {
    return jsonError(
      400,
      'No endpoint configured. Run `ducky setup` on the server (or set AI_BASE_URL in the server environment).',
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
  // streaming with usage accounting when tools are in play. The public
  // "ducky-3.5-coder" id is translated to Nemotron 3 Ultra (or AI_MODEL_ID)
  // here so the upstream id — and the key — never reach the client.
  const { baseUrl: _b, apiKey: _k, ...forward } = body;
  void _b;
  void _k;

  const payload: ChatProxyPayload = {
    ...forward,
    model: server.model,
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

  let upstream: Response | null = null;
  let endpointUsed = '';
  for (let i = 0; i < candidates.length; i++) {
    endpointUsed = candidates[i];
    try {
      upstream = await fetch(endpointUsed, requestInit(payload));
    } catch (e) {
      return jsonError(502, `Upstream request failed: ${(e as Error).message}`);
    }
    // Wrong path (e.g. base URL missing the version segment) → try next.
    if (upstream.status === 404 && i < candidates.length - 1) continue;
    break;
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
      message = `${message} — the server key was rejected. Re-run \`ducky setup\` on the server with a fresh provider key (never in the browser).`.trim();
    }
    if (status === 404) {
      message = `${message} — the model id "${server.model}" was not found. Set AI_MODEL_ID to a model your endpoint serves.`.trim();
    }
    return jsonError(status, message);
  }

  return streamResponse(upstream.body);
}
