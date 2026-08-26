/**
 * Ducky AI | Coder — dependency-free ZIP export for the virtual workspace.
 *
 * Implements the minimum of the PKZIP APPNOTE needed for a valid archive:
 * local file headers + central directory + EOCD, all entries STORED
 * (compression method 0 — vFS files are small text; the bytes saved are not
 * worth a deflate implementation client-side). Explicit directory entries
 * are emitted so Windows Explorer / macOS Archive Utility render nested
 * trees without surprise. UTF-8 names via the 0x0800 language flag.
 */

import type { Session } from "./types";

/* ──────────────────────────────── crc32 ─────────────────────────────────── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ─────────────────────────────── dos time ───────────────────────────────── */

function dosDateTime(d: Date): { time: number; date: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/* ─────────────────────────────── builder ────────────────────────────────── */

export interface ZipEntry {
  /** zip-relative path, "/"-separated; directories must end with "/" */
  path: string;
  content: string;
}

interface PreparedEntry {
  path: string;
  bytes: Uint8Array;
  crc: number;
  offset: number;
  isDir: boolean;
}

function u16(view: DataView, pos: number, v: number) {
  view.setUint16(pos, v & 0xffff, true);
}
function u32(view: DataView, pos: number, v: number) {
  view.setUint32(pos, v >>> 0, true);
}

/**
 * Build a zip archive blob from text entries. Parent directories are added
 * implicitly; names are deduped; order is stable (dirs first, then alpha).
 */
export function buildZipBlob(entries: ZipEntry[], when = new Date()): Blob {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(when);

  // normalize + dedupe files, and track real dir entries separately
  // (dirs are derived from file parents only — an empty extensionless FILE
  //  like "LICENSE" must never be mistaken for a directory)
  const byPath = new Map<string, ZipEntry>();
  const dirSet = new Set<string>();
  for (const e of entries) {
    const p = e.path.replace(/^\/+/, "").replace(/\/+$/, "");
    if (!p) continue;
    byPath.set(p, { path: p, content: e.content });
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join("/");
      dirSet.add(dir);
      // emit explicit dir entries (unless a file with that exact path exists)
      if (!byPath.has(dir)) byPath.set(dir, { path: dir, content: "" });
    }
  }

  const sorted = [...byPath.values()].sort((a, b) => {
    const aDir = dirSet.has(a.path);
    const bDir = dirSet.has(b.path);
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  const prepared: PreparedEntry[] = [];
  let offset = 0;

  for (const e of sorted) {
    const isDir = dirSet.has(e.path);
    const nameBytes = enc.encode(`${e.path}${isDir ? "/" : ""}`);
    const dataBytes = isDir ? new Uint8Array(0) : enc.encode(e.content);
    const crc = crc32(dataBytes);

    const local = new ArrayBuffer(30 + nameBytes.length);
    const lv = new DataView(local);
    u32(lv, 0, 0x04034b50);
    u16(lv, 4, 20); // version needed
    u16(lv, 6, 0x0800); // UTF-8 names
    u16(lv, 8, 0); // stored
    u16(lv, 10, time);
    u16(lv, 12, date);
    u32(lv, 14, crc);
    u32(lv, 18, dataBytes.length);
    u32(lv, 22, dataBytes.length);
    u16(lv, 26, nameBytes.length);
    u16(lv, 28, 0);
    new Uint8Array(local).set(nameBytes, 30);

    prepared.push({
      path: e.path,
      bytes: new Uint8Array(local),
      crc,
      offset,
      isDir,
    });
    // final layout writes header+raw contiguously, so the next entry's
    // offset must include the data bytes we just stashed
    offset += local.byteLength + dataBytes.length;

    // stash raw data for the central pass
    (prepared[prepared.length - 1] as PreparedEntry & { raw?: Uint8Array }).raw = dataBytes;
  }

  // central directory
  const centralChunks: Uint8Array[] = [];
  let centralSize = 0;
  for (const p of prepared) {
    const raw = (p as PreparedEntry & { raw?: Uint8Array }).raw ?? new Uint8Array(0);
    const nameBytes = new TextEncoder().encode(`${p.path}${p.isDir ? "/" : ""}`);
    const header = new ArrayBuffer(46 + nameBytes.length);
    const hv = new DataView(header);
    u32(hv, 0, 0x02014b50);
    u16(hv, 4, 20); // version made by
    u16(hv, 6, 20); // version needed
    u16(hv, 8, 0x0800);
    u16(hv, 10, 0);
    u16(hv, 12, time);
    u16(hv, 14, date);
    u32(hv, 16, p.crc);
    u32(hv, 20, raw.length);
    u32(hv, 24, raw.length);
    u16(hv, 28, nameBytes.length);
    u16(hv, 30, 0); // extra
    u16(hv, 32, 0); // comment
    u16(hv, 34, 0); // disk start
    u16(hv, 36, 0); // internal attrs
    u32(hv, 38, p.isDir ? 0x10 : 0); // external attrs (dos dir bit)
    u32(hv, 42, p.offset);
    new Uint8Array(header).set(nameBytes, 46);
    centralChunks.push(new Uint8Array(header));
    centralSize += header.byteLength;
  }

  // EOCD
  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  u32(ev, 0, 0x06054b50);
  u16(ev, 4, 0);
  u16(ev, 6, 0);
  u16(ev, 8, prepared.length);
  u16(ev, 10, prepared.length);
  u32(ev, 12, centralSize);
  u32(ev, 16, offset);
  u16(ev, 20, 0);

  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of prepared) {
    out.set(p.bytes, pos);
    pos += p.bytes.length;
    if (!p.isDir) {
      const raw = (p as PreparedEntry & { raw?: Uint8Array }).raw!;
      out.set(raw, pos);
      pos += raw.length;
    }
  }
  for (const c of centralChunks) {
    out.set(c, pos);
    pos += c.length;
  }
  out.set(new Uint8Array(eocd), pos);

  return new Blob([out.buffer as ArrayBuffer], { type: "application/zip" });
}

/* ────────────────────────── workspace export ────────────────────────────── */

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}

export function workspaceZipName(session: Session, d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${slugify(session.title)}-ws-${d.getFullYear()}${p(d.getMonth() + 1)}${p(
    d.getDate(),
  )}-${p(d.getHours())}${p(d.getMinutes())}.zip`;
}

/** Export a session's virtual workspace as a downloadable .zip blob. */
export function downloadWorkspaceZip(session: Session): void {
  const entries: ZipEntry[] = Object.entries(session.workspace)
    .filter(([p, c]) => p.length > 0 && typeof c === "string")
    .map(([path, content]) => ({ path, content }));
  if (entries.length === 0) {
    throw new Error("Workspace is empty — nothing to zip.");
  }
  const blob = buildZipBlob(entries);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = workspaceZipName(session);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
