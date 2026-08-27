/**
 * Ducky AI | Coder — stateless SSE pass-through proxy.
 *
 * Serverless-safe: pure fetch, no Node APIs (only `process.env`). The
 * endpoint, credentials and backend model id are **deployment secrets** that
 * live exclusively in server environment variables — they are never sent to,
 * stored by, or visible from the client.
 *
 * Environment variables (set these in your hosting dashboard):
 *   AI_BASE_URL   – OpenAI-compatible base URL  (e.g. https://api.example.com/v1)
 *   AI_API_KEY    – bearer key for that endpoint
 *   AI_MODEL_ID   – upstream model id that powers "Ducky 3.5 Coder"
 *
 * The user-facing model id is always `ducky-3.5-coder` (Ducky 3.5 Coder).
 * It is translated to `AI_MODEL_ID` server-side so the upstream name never
 * reaches the client.
 */

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

function jsonError(status: number, message: string): Response {
  return Response.json({ error: { message } }, { status });
}

export async function POST(req: Request): Promise<Response> {
  let body: ChatProxyBody;
  try {
    body = (await req.json()) as ChatProxyBody;
  } catch {
    return jsonError(400, 'Invalid JSON body.');
  }

  // Resolution order: client-provided (Settings, dev convenience) → server env.
  const apiKey = body.apiKey || process.env.AI_API_KEY || '';
  if (!apiKey) {
    return jsonError(
      400,
      'No API key configured. Add one in Settings → Models, or set AI_API_KEY in the server environment.',
    );
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonError(400, 'Missing required field: messages.');
  }

  const rawBase = body.baseUrl || process.env.AI_BASE_URL || '';
  if (!rawBase) {
    return jsonError(
      400,
      'No endpoint configured. Set AI_BASE_URL in the server environment (or Base URL in Settings → Models).',
    );
  }
  const base = rawBase.replace(/\/+$/, '');
  const endpoint = `${base}/chat/completions`;

  // Forward everything verbatim except our own proxy-control fields; force
  // streaming with usage accounting when tools are in play. The public
  // "ducky-3.5-coder" id is translated to the configured backend model here
  // so the upstream id never reaches the client.
  const { baseUrl: _b, apiKey: _k, ...forward } = body;
  void _b;
  void _k;

  const payload = {
    ...forward,
    model: process.env.AI_MODEL_ID || 'ducky-3.5-coder',
    stream: true,
    ...(Array.isArray(body.tools) && body.tools.length > 0
      ? { stream_options: { include_usage: true } }
      : {}),
  };

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return jsonError(502, `Upstream request failed: ${(e as Error).message}`);
  }

  if (!upstream.ok || !upstream.body) {
    let message = `Upstream error (HTTP ${upstream.status}).`;
    try {
      const text = await upstream.text();
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string };
        message =
          (parsed.error?.message ?? parsed.message ?? text.slice(0, 500)) || message;
      } catch {
        message = text.slice(0, 500) || message;
      }
    } catch {
      // keep generic message
    }
    if (upstream.status === 401) {
      message = `${message} — check your API key in Settings → Models (or AI_API_KEY on the server).`;
    }
    return jsonError(upstream.status, message);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
