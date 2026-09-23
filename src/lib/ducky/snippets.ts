/**
 * Ducky AI | Coder — global snippet library + bookmark shelf.
 *
 * Snippets: named reusable code/text blocks (save once, paste anywhere via
 * the agent). Bookmarks: named URLs the agent can open straight into the
 * browser panel. Both persist in localStorage with in-memory fallbacks.
 */

export interface Snippet {
  name: string;
  content: string;
  updatedAt: number;
}

export interface Bookmark {
  name: string;
  url: string;
  addedAt: number;
}

const SNIPPETS_KEY = "ducky-snippets-v1";
const BOOKMARKS_KEY = "ducky-bookmarks-v1";
const CAP = 100;
const SNIPPET_CAP = 20000;

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

const snipFallback = new Map<string, Snippet>();
const markFallback = new Map<string, Bookmark>();

function readMap<T>(key: string, fallback: Map<string, T>): Map<string, T> {
  if (!hasLocalStorage()) return new Map(fallback);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, T>;
    return new Map(Object.entries(obj ?? {}));
  } catch {
    return new Map();
  }
}

function writeMap<T>(key: string, fallback: Map<string, T>, map: Map<string, T>): void {
  if (!hasLocalStorage()) {
    fallback.clear();
    for (const [k, v] of map) fallback.set(k, v);
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(Object.fromEntries(map)));
  } catch {
    // quota — RAM copy above keeps this session working
  }
}

const cleanName = (n: string): string =>
  n.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 40) || "item";

/* -------------------------------- snippets ------------------------------- */

export function saveSnippet(name: string, content: string): Snippet {
  const key = cleanName(name);
  if (!content) throw new Error("snippet_save: content must be non-empty");
  if (content.length > SNIPPET_CAP) throw new Error(`snippet_save: content too long (≤${SNIPPET_CAP} chars)`);
  const map = readMap<Snippet>(SNIPPETS_KEY, snipFallback);
  if (!map.has(key) && map.size >= CAP) throw new Error(`snippet library full (${CAP}). Delete one first.`);
  const entry: Snippet = { name: key, content, updatedAt: Date.now() };
  map.set(key, entry);
  writeMap(SNIPPETS_KEY, snipFallback, map);
  return entry;
}

export function getSnippet(name: string): Snippet | null {
  return readMap<Snippet>(SNIPPETS_KEY, snipFallback).get(cleanName(name)) ?? null;
}

export function listSnippets(): Snippet[] {
  return [...readMap<Snippet>(SNIPPETS_KEY, snipFallback).values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteSnippet(name: string): boolean {
  const key = cleanName(name);
  const map = readMap<Snippet>(SNIPPETS_KEY, snipFallback);
  if (!map.has(key)) return false;
  map.delete(key);
  writeMap(SNIPPETS_KEY, snipFallback, map);
  return true;
}

/* -------------------------------- bookmarks ------------------------------ */

export function saveBookmark(name: string, url: string): Bookmark {
  const key = cleanName(name);
  const cleanUrl = url.trim();
  if (!/^https?:\/\//i.test(cleanUrl)) throw new Error("bookmark_save: url must be absolute http(s)");
  const map = readMap<Bookmark>(BOOKMARKS_KEY, markFallback);
  if (!map.has(key) && map.size >= CAP) throw new Error(`bookmark shelf full (${CAP}). Delete one first.`);
  const entry: Bookmark = { name: key, url: cleanUrl, addedAt: Date.now() };
  map.set(key, entry);
  writeMap(BOOKMARKS_KEY, markFallback, map);
  return entry;
}

export function getBookmark(name: string): Bookmark | null {
  return readMap<Bookmark>(BOOKMARKS_KEY, markFallback).get(cleanName(name)) ?? null;
}

export function listBookmarks(): Bookmark[] {
  return [...readMap<Bookmark>(BOOKMARKS_KEY, markFallback).values()].sort((a, b) => b.addedAt - a.addedAt);
}

export function deleteBookmark(name: string): boolean {
  const key = cleanName(name);
  const map = readMap<Bookmark>(BOOKMARKS_KEY, markFallback);
  if (!map.has(key)) return false;
  map.delete(key);
  writeMap(BOOKMARKS_KEY, markFallback, map);
  return true;
}
