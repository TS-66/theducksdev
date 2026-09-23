/**
 * Ducky AI | Coder — saved model-connection profiles.
 *
 * One active connection (Settings → Connections form) + any number of NAMED
 * saved profiles you can switch between ("Use" copies a profile into the
 * active form). Each profile remembers its last test result (status dot).
 * localStorage-backed with an in-memory fallback (tests). Secrets never
 * leave the browser except inside the proxied chat request, same as ever.
 */

export interface ModelProfile {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  lastTest: { ok: boolean; at: number; message: string } | null;
}

const PROFILES_KEY = "ducky-connection-profiles-v1";
const MAX_PROFILES = 20;

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

let memFallback: ModelProfile[] = [];

const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export function listProfiles(): ModelProfile[] {
  if (!hasLocalStorage()) return [...memFallback];
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as ModelProfile[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function storeProfiles(items: ModelProfile[]): void {
  if (!hasLocalStorage()) {
    memFallback = [...items];
    return;
  }
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(items));
  } catch {
    // quota — RAM copy above keeps this session working
  }
}

/** Save the current form as a named profile (or update by name). Returns it. */
export function saveProfile(name: string, baseUrl: string, apiKey: string, model: string): ModelProfile {
  const cleanName = name.trim().slice(0, 60) || "Profile";
  const items = listProfiles();
  const existing = items.find((p) => p.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) {
    const next = items.map((p) =>
      p.id === existing.id ? { ...p, baseUrl, apiKey, model } : p,
    );
    storeProfiles(next);
    return next.find((p) => p.id === existing.id)!;
  }
  if (items.length >= MAX_PROFILES) {
    throw new Error(`Profile list full (${MAX_PROFILES}). Delete one first.`);
  }
  const entry: ModelProfile = { id: uid(), name: cleanName, baseUrl, apiKey, model, lastTest: null };
  storeProfiles([...items, entry]);
  return entry;
}

/** Remove by id prefix. Returns true when removed. */
export function deleteProfile(idPrefix: string): boolean {
  const items = listProfiles();
  const hit = items.find((p) => p.id.startsWith(idPrefix));
  if (!hit) return false;
  storeProfiles(items.filter((p) => p.id !== hit.id));
  return true;
}

/** Record a test result (status dot). */
export function recordProfileTest(id: string, ok: boolean, message: string): void {
  const items = listProfiles();
  storeProfiles(
    items.map((p) => (p.id === id ? { ...p, lastTest: { ok, at: Date.now(), message: message.slice(0, 160) } } : p)),
  );
}

/** Masked key hint for display ("sk-…4f2a", never the value). */
export function maskKeyHint(apiKey: string): string {
  const k = apiKey.trim();
  if (!k) return "no key";
  if (k.length <= 8) return "••••";
  return `${k.slice(0, 3)}…${k.slice(-4)}`;
}
