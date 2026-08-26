/**
 * DSH Web — stateless SSE pass-through proxy to a DeepSeek-compatible
 * chat-completions endpoint. Vercel-safe: pure fetch, no Node APIs (only
 * `process.env` for the optional server-side key fallback).
 *
 * Mirrors upstream deepseek-harness model access: OpenAI-compatible
 * `/chat/completions` with streaming + tool calls.
 */

export const maxDuration = 60;

const DEFAULT_BASE_URL = 'https://api.deepseek.com';

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

  const apiKey = body.apiKey || process.env.DEEPSEEK_API_KEY || '';
  if (!apiKey) {
    return jsonError(
      400,
      'No API key configured. Open Settings and add your DeepSeek API key.',
    );
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonError(400, 'Missing required field: messages.');
  }

  const base = (body.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const endpoint = `${base}/chat/completions`;

  // Forward everything verbatim except our own proxy-control fields; force
  // streaming with usage accounting when tools are in play.
  const { baseUrl: _b, apiKey: _k, ...forward } = body;
  void _b;
  void _k;

  const payload = {
    ...forward,
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
      message = `${message} — check your API key in Settings.`;
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
