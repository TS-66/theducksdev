/**
 * Ducky AI | Coder — "put your own project in it".
 *
 * Local folder / file ingestion for projects: pick a folder from disk (or drop
 * files), and the text files land in a project's virtual filesystem with their
 * relative paths preserved. Guards keep localStorage safe and junk out:
 * dependency/build dirs are skipped, binaries and oversize files are rejected,
 * and a shared root folder is stripped so paths stay relative.
 */

import { normalizePath } from './tools-vfs';

/* ------------------------------ guards ------------------------------------ */

const SKIP_DIR_RE =
  /(^|\/)(node_modules|\.git|\.hg|\.svn|dist|build|out|\.next|\.turbo|coverage|__pycache__|\.venv|venv|vendor|target|\.cache|\.idea|\.vscode)(\/|$)/i;

/** per-file cap — parity with the image pipeline's localStorage-safe budget */
export const MAX_FILE_BYTES = 384 * 1024;
/** total project payload budget (localStorage quota headroom) */
export const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
/** hard file-count ceiling */
export const MAX_FILES = 500;

export interface IngestResult {
  /** path -> content, ready to hand to createProject/addFilesToProject */
  files: Record<string, string>;
  imported: number;
  /** skipped: binaries, oversize files, unreadable entries */
  skipped: number;
  /** skipped dependency/build directories (count of top-level offenders) */
  skippedDirs: number;
  totalBytes: number;
  /** inferred project name (imported folder name), when detectable */
  rootName: string | null;
  /** human notes for toasts (first few skips) */
  notes: string[];
}

/* ------------------------------ helpers ----------------------------------- */

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|ico|svgz|avif)$/i;
const BINARY_HINT_EXT_RE =
  /\.(zip|gz|tgz|bz2|xz|7z|rar|jar|war|class|exe|dll|so|dylib|bin|dat|pdf|docx?|xlsx?|pptx?|woff2?|ttf|otf|eot|mp3|mp4|mov|avi|mkv|wav|ogg|webm|sqlite|db|pdb|wasm|pyc|o|a|obj|lock)$/i;

function looksBinary(text: string): boolean {
  // NUL byte in the first chunk is the classic tell; also guard C1 controls
  const head = text.slice(0, 1024);
  if (head.includes('\u0000')) return true;
  let weird = 0;
  for (let i = 0; i < head.length; i++) {
    const c = head.charCodeAt(i);
    if (c === 0 || (c >= 0x7f && c < 0xa0)) weird++;
  }
  return weird > 4;
}

/** Sanitize to a clean relative vFS path; '' when the path is unusable. */
function cleanRelPath(raw: string): string {
  const p = normalizePath(raw.replace(/^\.\//, '').replace(/\\/g, '/'));
  if (!p || p.includes('..')) return '';
  return p;
}

function commonRoot(paths: string[]): string | null {
  const first = paths[0]?.split('/')[0];
  if (!first) return null;
  return paths.every((p) => p.split('/')[0] === first) ? first : null;
}

/* ------------------------------ ingestion --------------------------------- */

/**
 * Read a File list (from an <input webkitdirectory>, <input multiple> or a
 * drop) into a project-ready files map. Never throws — skips report through
 * the result object.
 */
export async function ingestProjectFiles(
  fileList: FileList | File[] | null | undefined,
): Promise<IngestResult> {
  const result: IngestResult = {
    files: {},
    imported: 0,
    skipped: 0,
    skippedDirs: 0,
    totalBytes: 0,
    rootName: null,
    notes: [],
  };
  if (!fileList) return result;

  const all = Array.from(fileList as ArrayLike<File>);
  const note = (msg: string) => {
    if (result.notes.length < 4) result.notes.push(msg);
  };

  // candidate relative paths (webkitRelativePath wins when present)
  const candidates: Array<{ file: File; rel: string }> = [];
  const dirSkips = new Set<string>();

  for (const f of all) {
    const raw = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const rel = cleanRelPath(raw);
    if (!rel) {
      result.skipped++;
      continue;
    }
    if (SKIP_DIR_RE.test(rel)) {
      // remember the offending top segment for the summary line
      const seg = rel.split('/').find((s) => SKIP_DIR_RE.test(s));
      if (seg) dirSkips.add(seg);
      continue;
    }
    candidates.push({ file: f, rel });
  }
  result.skippedDirs = dirSkips.size;

  // strip the shared root folder ("my-project/src/a.ts" → "src/a.ts")
  const root = commonRoot(candidates.map((c) => c.rel));

  for (const { file, rel } of candidates) {
    if (result.imported >= MAX_FILES) {
      result.skipped++;
      note(`stopped at the ${MAX_FILES}-file cap`);
      break;
    }
    const path = root && rel.startsWith(`${root}/`) ? rel.slice(root.length + 1) : rel;
    if (!path) {
      result.skipped++;
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      result.skipped++;
      note(`${path} — ${(file.size / 1024).toFixed(0)} KB over the ${(MAX_FILE_BYTES / 1024).toFixed(0)} KB per-file cap`);
      continue;
    }
    if (result.totalBytes + file.size > MAX_TOTAL_BYTES) {
      result.skipped++;
      note(`total size cap reached — ${path} and the rest were skipped`);
      break;
    }
    if (IMAGE_EXT_RE.test(path) || BINARY_HINT_EXT_RE.test(path)) {
      result.skipped++;
      note(`${path} — binary/image (paste images into a session instead)`);
      continue;
    }
    try {
      const text = await file.text();
      if (looksBinary(text)) {
        result.skipped++;
        note(`${path} — looks binary, skipped`);
        continue;
      }
      result.files[path] = text;
      result.imported++;
      result.totalBytes += file.size;
    } catch {
      result.skipped++;
      note(`${path} — unreadable, skipped`);
    }
  }

  result.rootName = root;
  return result;
}

/* ------------------------------ naming ------------------------------------ */

/** "My Cool App!" → "my-cool-app" (fallback "my-project"). */
export function slugifyProjectName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'my-project';
}

/** Format bytes for toasts/labels. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
