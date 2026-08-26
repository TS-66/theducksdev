/**
 * DSH Web — serverless web search proxy backed by z-ai-web-dev-sdk.
 * Backend only (the SDK reads config from the filesystem). Everything is
 * wrapped so the route degrades gracefully (501/500 JSON) when the backend
 * is unavailable, e.g. on Vercel without SDK credentials.
 */

import ZAI from 'z-ai-web-dev-sdk';

export const maxDuration = 60;

interface WebSearchBody {
  query?: string;
  num?: number;
}

interface SearchItem {
  url: string;
  name: string;
  snippet: string;
  host_name: string;
  rank: number;
  date: string;
  favicon: string;
}

function jsonError(status: number, message: string): Response {
  return Response.json({ error: { message } }, { status });
}

export async function POST(req: Request): Promise<Response> {
  let body: WebSearchBody;
  try {
    body = (await req.json()) as WebSearchBody;
  } catch {
    return jsonError(400, 'Invalid JSON body.');
  }

  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) return jsonError(400, 'Missing required field: query.');
  const num = Math.min(20, Math.max(1, Number(body.num) || 8));

  let zai: Awaited<ReturnType<typeof ZAI.create>>;
  try {
    zai = await ZAI.create();
  } catch (e) {
    return jsonError(
      501,
      `Web search backend unavailable in this environment (${(e as Error).message}). The dsh-tool-web plugin will be limited to direct fetches.`,
    );
  }

  try {
    const results = (await zai.functions.invoke('web_search', { query, num })) as SearchItem[];
    return Response.json({
      query,
      results: Array.isArray(results) ? results : [],
    });
  } catch (e) {
    return jsonError(500, `Web search failed: ${(e as Error).message}`);
  }
}
