/**
 * Ducky AI | Coder — serverless vision (multimodal) proxy backed by z-ai-web-dev-sdk.
 * Backend only: receives a data:image/* URL from the client's virtual
 * workspace and returns the vision model's description. Degrades gracefully
 * (501/500 JSON) when the backend is unavailable, mirroring /api/web-search.
 */

import ZAI from 'z-ai-web-dev-sdk';

export const maxDuration = 60;

interface VisionBody {
  image?: string;
  prompt?: string;
}

const DATA_URL_RE = /^data:image\/(png|jpe?g|gif|webp);base64,/i;
/** 384 KB binary cap in the vFS ≈ ~512 KB base64; leave slack */
const MAX_CHARS = 600_000;

const DEFAULT_PROMPT =
  'Describe this image faithfully and concisely (3-6 sentences): subject and setting, dominant colors/composition, any visible text (transcribe short labels verbatim), and notable details. Plain prose, no markdown headings.';

function jsonError(status: number, message: string): Response {
  return Response.json({ error: { message } }, { status });
}

export async function POST(req: Request): Promise<Response> {
  let body: VisionBody;
  try {
    body = (await req.json()) as VisionBody;
  } catch {
    return jsonError(400, 'Invalid JSON body.');
  }

  const image = typeof body.image === 'string' ? body.image.trim() : '';
  if (!image) return jsonError(400, 'Missing required field: image.');
  if (!DATA_URL_RE.test(image)) {
    return jsonError(400, 'image must be a data:image/png|jpeg|gif|webp;base64 URL.');
  }
  if (image.length > MAX_CHARS) {
    return jsonError(
      413,
      `Image too large (${Math.round(image.length / 1024)} KB of base64; cap is ${Math.round(MAX_CHARS / 1024)} KB).`,
    );
  }
  const promptRaw = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const prompt = promptRaw.length > 0 && promptRaw.length <= 2_000 ? promptRaw : DEFAULT_PROMPT;

  let zai: Awaited<ReturnType<typeof ZAI.create>>;
  try {
    zai = await ZAI.create();
  } catch (e) {
    return jsonError(
      501,
      `Vision backend unavailable in this environment (${(e as Error).message}). Paste-analyze flows will be limited until the SDK is configured.`,
    );
  }

  try {
    const response = (await zai.chat.completions.createVision({
      model: 'glm-4.5v',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    })) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };

    const raw = response.choices?.[0]?.message?.content;
    const description =
      typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
          ? raw
              .map((part) =>
                part && typeof part === 'object' && 'text' in part
                  ? String((part as { text?: unknown }).text ?? '')
                  : '',
              )
              .join('')
          : '';

    if (!description.trim()) {
      return jsonError(502, 'Vision model returned an empty response.');
    }
    return Response.json({ description: description.trim(), model: 'glm-4.5v' });
  } catch (e) {
    return jsonError(500, `Vision request failed: ${(e as Error).message}`);
  }
}
