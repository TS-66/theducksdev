/**
 * Ducky AI | Coder — long-term memory + session scratchpad.
 *
 * Memories are GLOBAL (survive across sessions, injected into the system
 * prompt). Notes are PER-SESSION scratchpads the agent can use for working
 * state. Both persist in localStorage; in non-browser environments (tests)
 * they fall back to in-memory maps so executors stay testable.
 */

export interface MemoryEntry {
  id: string;
  text: string;
  createdAt: number;
}

export interface NoteEntry {
  name: string;
  content: string;
  updatedAt: number;
}

const MEMORY_KEY = "ducky-memory-v1";
const NOTES_KEY = "ducky-notes-v1";

export const MEMORY_CAP = 50;
export const MEMORY_TEXT_CAP = 500;
const NOTES_CAP_PER_SESSION = 20;
const NOTE_TEXT_CAP = 8000;

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

const memFallback: MemoryEntry[] = [];
const notesFallback = new Map<string, NoteEntry[]>();

function readLS(key: string): string | null {
  if (!hasLocalStorage()) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLS(key: string, value: string): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // quota — memory keeps working in RAM for this page
  }
}

const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

/* -------------------------------- memories ------------------------------- */

export function listMemories(): MemoryEntry[] {
  if (!hasLocalStorage()) return [...memFallback];
  try {
    const raw = readLS(MEMORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as MemoryEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function storeMemories(items: MemoryEntry[]): void {
  if (!hasLocalStorage()) {
    memFallback.length = 0;
    memFallback.push(...items);
    return;
  }
  writeLS(MEMORY_KEY, JSON.stringify(items));
}

/** Save one durable fact. Returns the entry. Throws when empty/over cap. */
export function saveMemory(text: string): MemoryEntry {
  const clean = text.trim().slice(0, MEMORY_TEXT_CAP);
  if (!clean) throw new Error("memory_save: text must be non-empty");
  const items = listMemories();
  if (items.length >= MEMORY_CAP) {
    throw new Error(`memory_save: memory full (${MEMORY_CAP}). Forget something first.`);
  }
  const entry: MemoryEntry = { id: uid(), text: clean, createdAt: Date.now() };
  storeMemories([...items, entry]);
  return entry;
}

/** Forget by id prefix (first 8 chars are enough). Returns true when removed. */
export function forgetMemory(idPrefix: string): boolean {
  const items = listMemories();
  const hit = items.find((m) => m.id.startsWith(idPrefix));
  if (!hit) return false;
  storeMemories(items.filter((m) => m.id !== hit.id));
  return true;
}

/** Rendered block for the system prompt (capped, newest last). */
export function renderMemoriesForPrompt(max = 10): string {
  const items = listMemories().slice(-max);
  if (!items.length) return "";
  return items.map((m) => `- ${m.text}`).join("\n");
}

/* --------------------------------- notes --------------------------------- */

function readNotes(sessionId: string): NoteEntry[] {
  if (!hasLocalStorage()) return [...(notesFallback.get(sessionId) ?? [])];
  try {
    const raw = readLS(NOTES_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as Record<string, NoteEntry[]>;
    return Array.isArray(all?.[sessionId]) ? all[sessionId] : [];
  } catch {
    return [];
  }
}

function storeNotes(sessionId: string, items: NoteEntry[]): void {
  if (!hasLocalStorage()) {
    notesFallback.set(sessionId, items);
    return;
  }
  let all: Record<string, NoteEntry[]> = {};
  try {
    all = (JSON.parse(readLS(NOTES_KEY) ?? "{}") as Record<string, NoteEntry[]>) ?? {};
  } catch {
    all = {};
  }
  all[sessionId] = items;
  writeLS(NOTES_KEY, JSON.stringify(all));
}

const cleanName = (n: string): string =>
  n.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 40) || "note";

export function writeNote(sessionId: string, name: string, content: string): NoteEntry {
  const key = cleanName(name);
  const text = content.slice(0, NOTE_TEXT_CAP);
  const items = readNotes(sessionId).filter((n) => n.name !== key);
  if (items.length >= NOTES_CAP_PER_SESSION && !items.some((n) => n.name === key)) {
    throw new Error(`note_write: scratchpad full (${NOTES_CAP_PER_SESSION} notes).`);
  }
  const entry: NoteEntry = { name: key, content: text, updatedAt: Date.now() };
  storeNotes(sessionId, [...items, entry]);
  return entry;
}

export function readNote(sessionId: string, name: string): NoteEntry | null {
  const key = cleanName(name);
  return readNotes(sessionId).find((n) => n.name === key) ?? null;
}

export function listNotes(sessionId: string): NoteEntry[] {
  return readNotes(sessionId);
}
