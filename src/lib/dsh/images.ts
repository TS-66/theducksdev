/**
 * DSH Web — image entry helpers.
 *
 * Images live in the virtual workspace as `data:` URLs (string content, like
 * every other vFS entry). These helpers classify entries and convert raw
 * clipboard files into storable data URLs with sensible caps — localStorage
 * holds the whole store, so oversized pastes are rejected up front.
 */

export const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;

/** Hard cap for a pasted/attached image (raw bytes) before base64 inflation. */
export const MAX_IMAGE_BYTES = 384 * 1024;

export function isImagePath(path: string): boolean {
  return IMAGE_EXT_RE.test(path);
}

/** Mime type implied by a file extension (conservative subset). */
export function mimeForExt(path: string): string {
  const m = path.toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = m?.[1] ?? "";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "jpg") return "image/jpeg";
  if (ext === "ico") return "image/x-icon";
  return ext ? `image/${ext}` : "application/octet-stream";
}

/** Returns the data URL when the content IS an inline image payload. */
export function imageDataUrl(content: string): string | null {
  return /^data:image\/(?:png|jpe?g|gif|webp|svg\+xml|bmp|x-icon);base64,/i.test(content)
    ? content
    : null;
}

/** An entry is previewable as an image when extension or content says so. */
export function isImageEntry(path: string, content: string): boolean {
  return imageDataUrl(content) !== null || (isImagePath(path) && /^data:/i.test(content));
}

export interface PastedImage {
  /** full data URL ready to store as vFS content */
  dataUrl: string;
  bytes: number;
  suggestedName: string;
}

/**
 * Read a clipboard/picker File into a capped data URL.
 * Rejects with a readable Error message on wrong kind / oversize.
 */
export function fileToPastedImage(file: File, seq: number): Promise<PastedImage> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error(`“${file.name || "clipboard"}” is not an image.`));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      reject(
        new Error(
          `Image too large (${(file.size / 1024).toFixed(0)} KB) — the cap is ${Math.round(
            MAX_IMAGE_BYTES / 1024,
          )} KB so localStorage stays healthy.`,
        ),
      );
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image data."));
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      if (!/^data:image\//i.test(dataUrl)) {
        reject(new Error("Unsupported image encoding."));
        return;
      }
      resolve({
        dataUrl,
        bytes: file.size,
        suggestedName: suggestImageName(file, seq),
      });
    };
    reader.readAsDataURL(file);
  });
}

const EXT_FOR_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
};

function suggestImageName(file: File, seq: number): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(
    d.getHours(),
  )}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const fromMime = EXT_FOR_MIME[file.type] ?? "";
  const fromName = file.name?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "";
  const ext = fromName || fromMime || "png";
  return `images/pasted-${stamp}${seq > 0 ? `-${seq}` : ""}.${ext}`;
}
