/**
 * Ducky AI | Coder — update notifications.
 *
 * Honest architecture: there are no user accounts and no push servers, so
 * "notify all users" means every running app checks for a newer release on
 * boot and says so loudly. Source of truth: GitHub Releases on the public
 * repo (no auth needed). Flow:
 *
 *   1. You publish a release tagged vX.Y.Z on GitHub.
 *   2. Every `ducky --web` older than that tag shows an update banner
 *      (once per version — dismissals persist in localStorage).
 *   3. One command updates: `ducky update` (git pull + install + build),
 *      or the zero-auth curl installer for fresh machines.
 */

export const APP_VERSION = "0.3.0";

const RELEASE_URL =
  "https://api.github.com/repos/TS-66/theducksdev/releases/latest";
const DISMISS_PREFIX = "ducky-update-dismissed-";

function parts(v: string): number[] {
  return v
    .trim()
    .replace(/^[vV]/, "")
    .split(".")
    .map((n) => parseInt(n, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

/** True when `tag` (e.g. "v0.4.0") is newer than `local` (e.g. "0.3.0"). */
export function isNewerTag(local: string, tag: string): boolean {
  const a = parts(local);
  const b = parts(tag);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (y !== x) return y > x;
  }
  return false;
}

export interface ReleaseInfo {
  tag: string;
  name: string;
  url: string;
  notes: string;
  publishedAt: string;
}

/** Fetch the latest GitHub release (null = none yet / offline). Never throws. */
export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const res = await fetch(RELEASE_URL, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      tag_name?: string;
      name?: string;
      html_url?: string;
      body?: string;
      published_at?: string;
    };
    if (typeof d.tag_name !== "string" || !d.tag_name.trim()) return null;
    return {
      tag: d.tag_name.trim(),
      name: String(d.name ?? d.tag_name).slice(0, 120),
      url: String(d.html_url ?? ""),
      notes: String(d.body ?? "").slice(0, 2000),
      publishedAt: String(d.published_at ?? ""),
    };
  } catch {
    return null;
  }
}

const memFallback = new Map<string, string>();

function lsGet(key: string): string | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage.getItem(key);
  } catch {
    // private mode falls through to RAM below
  }
  return memFallback.get(key) ?? null;
}

function lsSet(key: string, value: string): void {
  memFallback.set(key, value);
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    // private mode — RAM copy above keeps this session quiet
  }
}

/** Has this exact version's banner been dismissed? */
export function isDismissed(tag: string): boolean {
  return lsGet(DISMISS_PREFIX + tag) === "1";
}

/** Dismiss this version's banner permanently. */
export function dismissUpdate(tag: string): void {
  lsSet(DISMISS_PREFIX + tag, "1");
}

/**
 * Full check: latest release that is (a) newer than the running app and
 * (b) not dismissed. Returns null when quiet is correct.
 */
export async function checkForUpdate(localVersion: string): Promise<ReleaseInfo | null> {
  const rel = await fetchLatestRelease();
  if (!rel) return null;
  if (!isNewerTag(localVersion, rel.tag)) return null;
  if (isDismissed(rel.tag)) return null;
  return rel;
}
