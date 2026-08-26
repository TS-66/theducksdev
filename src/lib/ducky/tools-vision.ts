/**
 * Ducky AI | Coder — client-side vision tool wrapper.
 *
 * Posts workspace images (stored as data URLs) to our own serverless proxy
 * (`/api/vision`) which hides the z-ai-web-dev-sdk multimodal backend.
 * Mirrors the tools-web pattern: relative URLs only, human-readable output,
 * graceful error strings that upstream agents can quote verbatim.
 */

interface VisionResponse {
  description?: string;
  model?: string;
  error?: { message?: string };
}

/** vFS images are capped at 384 KB binary ≈ 512 KB base64; add slack for URL overhead */
const MAX_DATA_URL_CHARS = 600_000;

function postJson<T>(path: string, body: unknown): Promise<T> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (res) => {
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
  });
}

/**
 * Ask the server-side vision model to describe an image.
 * Returns plain-text markdown-free description (tool-card friendly).
 */
export async function visionDescribe(imageDataUrl: string, question?: string): Promise<string> {
  if (!/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(imageDataUrl)) {
    throw new Error('vision_describe: image must be a data:image/*;base64 URL');
  }
  if (imageDataUrl.length > MAX_DATA_URL_CHARS) {
    throw new Error(
      `vision_describe: image too large (${Math.round(imageDataUrl.length / 1024)} KB of base64)`,
    );
  }
  const data = await postJson<VisionResponse>('/api/vision', {
    image: imageDataUrl,
    prompt: question,
  });
  const description = data.description?.trim();
  if (!description) throw new Error('vision_describe: empty response from backend');
  return description;
}
