/**
 * Ducky AI | Coder — serverless web reader proxy backed by z-ai-web-dev-sdk.
 *
 * Primary path: the SDK's `page_reader` function (returns extracted HTML +
 * title). Fallback: a plain `fetch()` of the URL with tags stripped to text,
 * capped at 8000 chars — graceful degradation when the backend is unavailable
 * (e.g. on serverless without SDK credentials).
 */

import ZAI from 'z-ai-web-dev-sdk';

export const maxDuration = 60;

interface WebFetchBody {
  url?: string;
}

interface PageReaderResult {
  code: number;
  data: {
    html: string;
    publishedTime?: string;
    title: string;
    url: string;
  };
  status: number;
}

const CONTENT_CAP = 8000;

function jsonError(status: number, message: string): Response {
  return Response.json({ error: { message } }, { status });
}

/** Strip HTML down to readable plain text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote)>/gi, '\n')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readViaSdk(zai: Awaited<ReturnType<typeof ZAI.create>>, url: string) {
  const res = (await zai.functions.invoke('page_reader', { url })) as PageReaderResult;
  if (!res?.data?.html && !res?.data?.title) throw new Error('page_reader returned empty payload');
  const text = htmlToText(res.data.html ?? '');
  return {
    url: res.data.url || url,
    title: res.data.title || '',
    content: text.slice(0, CONTENT_CAP),
    truncated: text.length > CONTENT_CAP,
    via: 'page_reader',
  };
}

async function readViaPlainFetch(url: string) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; DuckyAICoder/1.0)',
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Fetch failed with HTTP ${res.status}`);
  const ctype = res.headers.get('content-type') ?? '';
  if (/octet-stream|image\/|video\/|audio\//i.test(ctype)) {
    throw new Error(`Unsupported content type: ${ctype || 'unknown'}`);
  }
  const raw = await res.text();
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw)?.[1]?.trim() ?? '';
  const text = /html/i.test(ctype) || /^\s*</.test(raw) ? htmlToText(raw) : raw;
  return {
    url,
    title,
    content: text.slice(0, CONTENT_CAP),
    truncated: text.length > CONTENT_CAP,
    via: 'fetch',
  };
}

export async function POST(req: Request): Promise<Response> {
  let body: WebFetchBody;
  try {
    body = (await req.json()) as WebFetchBody;
  } catch {
    return jsonError(400, 'Invalid JSON body.');
  }

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!/^https?:\/\/.+/i.test(url)) {
    return jsonError(400, 'Missing or invalid field: url (absolute http(s) URL required).');
  }

  let zai: Awaited<ReturnType<typeof ZAI.create>> | null = null;
  try {
    zai = await ZAI.create();
  } catch {
    zai = null; // degrade to plain fetch below
  }

  if (zai) {
    try {
      return Response.json(await readViaSdk(zai, url));
    } catch {
      // fall through to plain fetch
    }
  }

  try {
    return Response.json(await readViaPlainFetch(url));
  } catch (e) {
    return jsonError(502, `Could not fetch ${url}: ${(e as Error).message}`);
  }
}
