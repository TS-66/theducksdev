/**
 * Ducky AI | Coder — client-side web tool wrappers.
 *
 * Thin fetch wrappers that call our own serverless proxies
 * (`/api/web-search`, `/api/web-fetch`) which hide the z-ai-web-dev-sdk
 * backend. Mirrors @ducky-ai/ducky-tool-web upstream behaviour while staying
 * CORS-safe in the browser. Always relative URLs — never absolute hosts.
 */

export interface WebSearchResultItem {
  name: string;
  url: string;
  snippet: string;
  host_name?: string;
  date?: string;
  rank?: number;
}

interface WebSearchResponse {
  results?: WebSearchResultItem[];
  error?: { message?: string };
}

interface WebFetchResponse {
  url?: string;
  title?: string;
  content?: string;
  truncated?: boolean;
  via?: string;
  error?: { message?: string };
}

const DISPLAY_CAP = 8000;

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // fall through with generic error below
  }
  if (!res.ok) {
    const msg =
      (payload as { error?: { message?: string } } | null)?.error?.message ??
      `Request failed (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return payload as T;
}

/** Execute a web search; returns human-readable formatted results. */
export async function webSearch(query: string, num = 8): Promise<string> {
  const data = await postJson<WebSearchResponse>('/api/web-search', {
    query,
    num: Math.min(20, Math.max(1, num)),
  });
  const results = data.results ?? [];
  if (!results.length) return `No results found for "${query}".`;

  const lines: string[] = [`# Web search: ${query}`, ''];
  results.forEach((r, i) => {
    lines.push(`${i + 1}. [${r.name || '(untitled)'}](${r.url})`);
    if (r.host_name) lines.push(`   host: ${r.host_name}${r.date ? ` · date: ${r.date}` : ''}`);
    if (r.snippet) lines.push(`   ${r.snippet.replace(/\s+/g, ' ').slice(0, 300)}`);
    lines.push('');
  });
  lines.push('[ducky: use web_fetch on any URL above to read the full page.]');
  return lines.join('\n');
}

/** Fetch and read a web page; returns markdown-ish text content. */
export async function webFetch(url: string): Promise<string> {
  const data = await postJson<WebFetchResponse>('/api/web-fetch', { url });
  if (data.error?.message) throw new Error(data.error.message);

  const header = [
    `# ${data.title?.trim() || url}`,
    data.url && data.url !== url ? `source: ${data.url}` : `source: ${url}`,
    '',
  ];
  const body = data.content ?? '(empty page)';
  const capped =
    body.length > DISPLAY_CAP
      ? `${body.slice(0, DISPLAY_CAP)}\n\n[ducky: content truncated at ${DISPLAY_CAP} characters]`
      : body;
  return [...header, capped].join('\n');
}
