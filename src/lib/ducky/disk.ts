/**
 * Ducky AI | Coder — REAL local disk access via the File System Access API.
 *
 * A web page cannot touch the user's computer on its own — the browser
 * sandboxes it. What it CAN do (Chromium ≥ 86, secure context) is ask the
 * user to pick a folder (`showDirectoryPicker`) and then read/write/create/
 * delete files inside it with the user's granted permission. That is exactly
 * what this module provides to the agent:
 *
 *   - connectDisk()     → native folder picker, stores the directory handle
 *   - restoreDiskOnBoot → handle survives reloads via IndexedDB; permission
 *                         is re-verified (Chrome persists grants per origin,
 *                         a user click re-requests when the browser asks)
 *   - disk_ls/read/write/edit/delete/mkdir — the agent's real-FS toolset
 *
 * Everything is rooted at the picked folder: paths are relative, traversal
 * above the root is impossible by construction (handles are resolved segment
 * by segment). All mutations still pass the harness permission policy and
 * plan-mode gate like every other side-effecting tool.
 */

import { create } from 'zustand';
import { normalizePath } from './tools-vfs';

/* --------------------------- ambient API types ----------------------------- */
/* `showDirectoryPicker` and handle permission queries are not in lib.dom yet. */

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: 'read' | 'readwrite';
      startIn?: string;
    }) => Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemFileHandle {
    queryPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  }
  interface FileSystemDirectoryHandle {
    queryPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  }
}

/* --------------------------------- caps ------------------------------------ */

export const DISK_CAPS = {
  /** max entries emitted by a recursive disk_ls */
  maxListEntries: 2000,
  /** max depth for recursive scans */
  maxDepth: 12,
  /** max bytes a single disk_read will return (UTF-8 text) */
  maxReadBytes: 384 * 1024,
  /** max bytes a single disk_write accepts */
  maxWriteBytes: 2 * 1024 * 1024,
} as const;

/** Directories never descended into during recursive scans. */
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.output',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  '.cache',
  '.turbo',
  '.vercel',
  'target',
  'vendor',
]);

/** Pure helper (unit-tested): should a recursive scan skip this directory? */
export function shouldIgnoreDiskDir(name: string): boolean {
  return IGNORED_DIRS.has(name);
}

/**
 * Pure helper (unit-tested): resolve a root-relative virtual path into
 * segments for handle traversal. Rejects empty paths (the root itself is not
 * a file) and any segment that tries to escape (normalizePath already
 * collapses `..`; a resulting empty string means "the root").
 */
export function resolveDiskSegments(path: string): string[] {
  const n = normalizePath(path);
  if (!n) throw new Error('Path resolves to the folder root — a file path is required.');
  return n.split('/');
}

/**
 * Pure helper (unit-tested): literal old→new replacement with the same
 * semantics as the workspace edit_file (exact match, uniqueness unless
 * replace_all). Throws descriptive errors the agent can act on.
 */
export function applyLiteralEdit(
  content: string,
  oldStr: string,
  newStr: string,
  replaceAll: boolean,
  pathForErrors: string,
): { next: string; replacements: number } {
  if (!oldStr) throw new Error('disk_edit: "old_str" must be a non-empty literal string');
  let count = 0;
  let idx = content.indexOf(oldStr);
  while (idx !== -1) {
    count++;
    idx = content.indexOf(oldStr, idx + Math.max(1, oldStr.length));
  }
  if (count === 0) {
    throw new Error(
      `disk_edit: old_str not found in ${pathForErrors}. Read the file to confirm exact text.`,
    );
  }
  if (count > 1 && !replaceAll) {
    throw new Error(
      `disk_edit: old_str appears ${count} times in ${pathForErrors}; provide more surrounding context or set recursive/replace_all=true.`,
    );
  }
  const next = replaceAll ? content.split(oldStr).join(newStr) : content.replace(oldStr, newStr);
  return { next, replacements: count };
}

/** Pure helper (unit-tested): cheap binary sniff for decoded text. */
export function looksBinary(text: string): boolean {
  const probe = text.slice(0, 8000);
  if (probe.includes('\u0000')) return true;
  // heavy replacement-char density ⇒ not UTF-8 text
  let bad = 0;
  for (const ch of probe) if (ch === '\uFFFD') bad++;
  return probe.length > 0 && bad / probe.length > 0.1;
}

/* ------------------------------ handle storage ------------------------------ */

const IDB_NAME = 'ducky-disk-db';
const IDB_STORE = 'handles';
const IDB_KEY = 'root';

function idbOpen(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPutHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  const db = await idbOpen();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      if (handle) store.put(handle, IDB_KEY);
      else store.delete(IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

async function idbGetHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await idbOpen();
  if (!db) return null;
  const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  db.close();
  return handle;
}

/* ------------------------------- disk store -------------------------------- */

export type DiskStatus = 'unsupported' | 'none' | 'connected' | 'needs-permission';

interface DiskState {
  status: DiskStatus;
  rootName: string;
  /** last user-facing error (toast/hint source) */
  error: string | null;
  /** transient: a scan/write is in flight */
  busy: boolean;
}

export const useDiskStore = create<DiskState>(() => ({
  status: 'none',
  rootName: '',
  error: null,
  busy: false,
}));

const setDisk = (patch: Partial<DiskState>) => useDiskStore.setState(patch);

export function describeDiskSupport(): { supported: boolean; hint: string } {
  const supported = supportsFsAccess();
  return supported
    ? { supported: true, hint: 'Chromium browser — folder access available.' }
    : {
        supported: false,
        hint: 'This browser does not expose the File System Access API. Use Chrome, Edge or Opera to connect a real folder; the sandboxed workspace still works everywhere.',
      };
}

export function supportsFsAccess(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/* ------------------------------- permissions -------------------------------- */

async function queryPermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
  try {
    return (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'prompt';
  } catch {
    return 'prompt';
  }
}

/**
 * Request read-write permission. MUST be called from a user gesture
 * (button click) when the browser decides to re-prompt.
 */
async function requestPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const state =
      (await handle.requestPermission?.({ mode: 'readwrite' })) ??
      ('granted' as PermissionState);
    return state === 'granted';
  } catch {
    return false;
  }
}

/* ------------------------------ connect / boot ------------------------------ */

/** Open the native folder picker and connect the picked folder (user gesture). */
export async function connectDisk(): Promise<boolean> {
  if (!supportsFsAccess()) {
    setDisk({ status: 'unsupported', error: describeDiskSupport().hint });
    return false;
  }
  try {
    const handle = await window.showDirectoryPicker!({ id: 'ducky-workspace', mode: 'readwrite' });
    rootHandle = handle;
    await idbPutHandle(handle);
    setDisk({ status: 'connected', rootName: handle.name, error: null });
    return true;
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError') return false; // user dismissed the picker
    setDisk({ status: 'none', error: `Could not open the folder picker: ${err.message}` });
    return false;
  }
}

/** Restore a previously granted folder after a reload (no gesture needed if the grant persisted). */
export async function restoreDiskOnBoot(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!supportsFsAccess()) {
    setDisk({ status: 'unsupported' });
    return;
  }
  const handle = await idbGetHandle();
  if (!handle) {
    setDisk({ status: 'none' });
    return;
  }
  const state = await queryPermission(handle);
  if (state === 'granted') {
    rootHandle = handle;
    setDisk({ status: 'connected', rootName: handle.name, error: null });
  } else {
    rootHandle = null; // require an explicit re-click before any access
    setDisk({ status: 'needs-permission', rootName: handle.name });
  }
}

/** User-gesture re-grant for a restored handle the browser kept in "prompt" state. */
export async function reconnectDisk(): Promise<boolean> {
  const handle = await idbGetHandle();
  if (!handle) {
    setDisk({ status: 'none' });
    return false;
  }
  const ok = await requestPermission(handle);
  if (ok) {
    rootHandle = handle;
    setDisk({ status: 'connected', rootName: handle.name, error: null });
  } else {
    setDisk({ status: 'needs-permission', error: 'Folder permission was not granted.' });
  }
  return ok;
}

/** Forget the connected folder entirely (handle + IndexedDB). */
export async function disconnectDisk(): Promise<void> {
  rootHandle = null;
  await idbPutHandle(null);
  setDisk({ status: 'none', rootName: '', error: null });
}

let rootHandle: FileSystemDirectoryHandle | null = null;

/** True when a folder is connected AND read-write permission is granted. */
export async function ensureDiskReady(write = true): Promise<FileSystemDirectoryHandle> {
  if (!supportsFsAccess()) throw new Error('This browser has no File System Access API support.');
  if (!rootHandle) {
    const st = useDiskStore.getState();
    if (st.status === 'needs-permission') {
      throw new Error(
        `Local folder “${st.rootName}” needs reconnection — ask the user to click the disk chip in the status bar to re-grant access.`,
      );
    }
    throw new Error(
      'No local folder is connected. Ask the user to connect one: project picker → “Connect local folder…” (or the status-bar disk chip).',
    );
  }
  if (write) {
    const state = await queryPermission(rootHandle);
    if (state !== 'granted') {
      const ok = await requestPermission(rootHandle);
      if (!ok) throw new Error('Write permission for the local folder is not granted.');
    }
  }
  return rootHandle;
}

/* ----------------------------- handle traversal ----------------------------- */

async function getDirHandle(segments: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
  const root = await ensureDiskReady(create);
  let dir = root;
  for (const seg of segments) {
    dir = await dir.getDirectoryHandle(seg, { create });
  }
  return dir;
}

/** Split "a/b/c.txt" into parent segments + filename. */
function splitParent(path: string): { parents: string[]; name: string } {
  const segs = resolveDiskSegments(path);
  return { parents: segs.slice(0, -1), name: segs[segs.length - 1] };
}

/* --------------------------------- listing ---------------------------------- */

export interface DiskEntry {
  path: string;
  kind: 'file' | 'dir';
  size?: number;
}

/** Async directory iteration is missing from some TS lib versions — local view. */
interface DirAsyncIterable {
  entries(): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
}

/**
 * List the connected folder. `recursive` walks the tree (skipping dependency/
 * build dirs) up to the caps; otherwise one directory level is returned.
 */
export async function diskList(dirPath = '', recursive = false): Promise<DiskEntry[]> {
  const base = normalizePath(dirPath);
  const root = await ensureDiskReady(false);
  const startDir = base
    ? await getDirHandle(resolveSegmentsDir(base), false)
    : root;

  const out: DiskEntry[] = [];
  let truncated = false;

  const iterEntries = (dir: FileSystemDirectoryHandle): DirAsyncIterable =>
    (dir as unknown as DirAsyncIterable) as DirAsyncIterable;

  const walk = async (dir: FileSystemDirectoryHandle, prefix: string, depth: number): Promise<void> => {
    if (out.length >= DISK_CAPS.maxListEntries) {
      truncated = true;
      return;
    }
    if (depth > DISK_CAPS.maxDepth) {
      out.push({ path: `${prefix} (max depth reached)`, kind: 'dir' });
      return;
    }
    for await (const [name, handle] of iterEntries(dir).entries()) {
      if (out.length >= DISK_CAPS.maxListEntries) {
        truncated = true;
        return;
      }
      const p = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'directory') {
        if (!recursive) {
          out.push({ path: `${p}/`, kind: 'dir' });
          continue;
        }
        if (shouldIgnoreDiskDir(name)) {
          out.push({ path: `${p}/`, kind: 'dir', size: -1 }); // -1 = skipped
          continue;
        }
        out.push({ path: `${p}/`, kind: 'dir' });
        await walk(handle as FileSystemDirectoryHandle, p, depth + 1);
      } else {
        let size: number | undefined;
        try {
          size = await (handle as FileSystemFileHandle).getFile().then((f) => f.size);
        } catch {
          size = undefined;
        }
        out.push({ path: p, kind: 'file', size });
      }
    }
  };

  await walk(startDir, base, 1);
  if (truncated) {
    out.push({ path: `… list truncated at ${DISK_CAPS.maxListEntries} entries — narrow the path`, kind: 'file' });
  }
  return out;
}

/** Directory-only segment resolution (no filename tail). */
function resolveSegmentsDir(dirPath: string): string[] {
  const n = normalizePath(dirPath);
  if (!n) return [];
  return n.split('/');
}

/** Format disk entries into a tree-ish listing for the model. */
export function formatDiskListing(entries: DiskEntry[], rootLabel: string): string {
  if (!entries.length) return `${rootLabel}\n(empty folder)`;
  const lines = entries.map((e) => {
    if (e.kind === 'dir') {
      return e.size === -1 ? `${e.path} [skipped: dependency/build dir]` : e.path;
    }
    return e.size === undefined ? e.path : `${e.path} (${e.size} B)`;
  });
  const files = entries.filter((e) => e.kind === 'file').length;
  const dirs = entries.filter((e) => e.kind === 'dir' && e.size !== -1).length;
  return [rootLabel, ...lines, '', `${dirs} director${dirs === 1 ? 'y' : 'ies'}, ${files} file${files === 1 ? '' : 's'}`].join('\n');
}

/* ---------------------------------- read ------------------------------------ */

/**
 * Read a real text file (first `DISK_CAPS.maxReadBytes` bytes when larger).
 * Returns content plus honest size/truncation metadata.
 */
export async function diskRead(
  path: string,
): Promise<{ content: string; size: number; truncated: boolean }> {
  const { parents, name } = splitParent(path);
  const dir = await getDirHandle(parents, false);
  const fh = await dir.getFileHandle(name);
  const file = await fh.getFile();
  const truncated = file.size > DISK_CAPS.maxReadBytes;
  const text = await (truncated ? file.slice(0, DISK_CAPS.maxReadBytes) : file).text();
  if (looksBinary(text)) {
    throw new Error(`${path} looks like a binary file — only UTF-8 text can be read.`);
  }
  return { content: text, size: file.size, truncated };
}

/* ---------------------------------- write ----------------------------------- */

/** Create or fully replace a real text file (parents auto-created). */
export async function diskWrite(path: string, content: string): Promise<{ created: boolean; bytes: number }> {
  if (content.length > DISK_CAPS.maxWriteBytes) {
    throw new Error(
      `disk_write refuses ${content.length} bytes — the ${DISK_CAPS.maxWriteBytes}-byte cap protects the real filesystem from runaway generations.`,
    );
  }
  const { parents, name } = splitParent(path);
  const dir = await getDirHandle(parents, true);
  // existence check for honest reporting (and read-before-write etiquette note)
  let created = true;
  try {
    await dir.getFileHandle(name);
    created = false;
  } catch {
    created = true;
  }
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(content);
  await w.close();
  return { created, bytes: content.length };
}

/** Literal-replace edit on a real file (read → replace → write). */
export async function diskEdit(
  path: string,
  oldStr: string,
  newStr: string,
  replaceAll: boolean,
): Promise<number> {
  const { content } = await diskRead(path);
  const { next, replacements } = applyLiteralEdit(content, oldStr, newStr, replaceAll, path);
  const { parents, name } = splitParent(path);
  const dir = await getDirHandle(parents, true);
  const fh = await dir.getFileHandle(name, { create: false });
  const w = await fh.createWritable();
  await w.write(next);
  await w.close();
  return replacements;
}

/* --------------------------------- delete ----------------------------------- */

/** Delete a real file, or a folder when `recursive` is set. */
export async function diskDelete(path: string, recursive: boolean): Promise<{ kind: 'file' | 'dir' }> {
  const { parents, name } = splitParent(path);
  const dir = await getDirHandle(parents, false);
  // file or directory?
  let isDir = true;
  try {
    await dir.getDirectoryHandle(name);
  } catch {
    isDir = false;
  }
  if (isDir) {
    if (!recursive) {
      throw new Error(
        `${path} is a directory. Pass recursive=true to delete it with everything inside — this cannot be undone.`,
      );
    }
    await dir.removeEntry(name, { recursive: true });
    return { kind: 'dir' };
  }
  try {
    await dir.getFileHandle(name);
  } catch {
    throw new Error(`${path} does not exist in the connected folder.`);
  }
  await dir.removeEntry(name);
  return { kind: 'file' };
}

/* --------------------------------- mkdir ------------------------------------ */

/** Create a real folder (parents auto-created). No-op when it exists. */
export async function diskMkdir(path: string): Promise<{ created: boolean }> {
  const n = normalizePath(path);
  if (!n) throw new Error('disk_mkdir: a folder path is required.');
  const segs = n.split('/');
  const root = await ensureDiskReady(true);
  let dir = root;
  let created = false;
  for (const seg of segs) {
    try {
      dir = await dir.getDirectoryHandle(seg, { create: false });
    } catch {
      dir = await dir.getDirectoryHandle(seg, { create: true });
      created = true;
    }
  }
  return { created };
}
