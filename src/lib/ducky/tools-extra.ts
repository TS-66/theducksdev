/**
 * Ducky AI | Coder — pure helpers behind the "extra tools" plugins.
 *
 * Everything here is dependency-free and DOM-free so it runs identically in
 * the browser and in the Node test harness. No `eval`, no network.
 */

/* ------------------------------- calculator ------------------------------ */

type Tok =
  | { t: "num"; v: number }
  | { t: "op"; v: string }
  | { t: "name"; v: string }
  | { t: "lp" }
  | { t: "rp" }
  | { t: "comma" };

const FUNCTIONS: Record<string, (...a: number[]) => number> = {
  sqrt: (x) => Math.sqrt(x),
  abs: (x) => Math.abs(x),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  round: (x) => Math.round(x),
  trunc: (x) => Math.trunc(x),
  sin: (x) => Math.sin(x),
  cos: (x) => Math.cos(x),
  tan: (x) => Math.tan(x),
  ln: (x) => Math.log(x),
  log10: (x) => Math.log10(x),
  exp: (x) => Math.exp(x),
  pow: (x, y) => Math.pow(x, y),
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

function tokenizeCalc(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = src.slice(i).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
      if (!m) throw new Error(`bad number near "${src.slice(i, i + 8)}"`);
      toks.push({ t: "num", v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      const m = src.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_]*/)!;
      toks.push({ t: "name", v: m[0].toLowerCase() });
      i += m[0].length;
      continue;
    }
    if (c === "(") {
      toks.push({ t: "lp" });
      i++;
      continue;
    }
    if (c === ")") {
      toks.push({ t: "rp" });
      i++;
      continue;
    }
    if (c === ",") {
      toks.push({ t: "comma" });
      i++;
      continue;
    }
    if ("+-*/%^".includes(c)) {
      toks.push({ t: "op", v: c });
      i++;
      continue;
    }
    throw new Error(`unexpected character "${c}"`);
  }
  return toks;
}

/** Evaluate a math expression safely (no eval). Throws with a clear message. */
export function evaluateExpression(src: string): number {
  const toks = tokenizeCalc(src);
  if (!toks.length) throw new Error("empty expression");
  let pos = 0;
  const peek = (): Tok | null => toks[pos] ?? null;
  const next = (): Tok => toks[pos++];

  function parseExpr(): number {
    let v = parseTerm();
    for (;;) {
      const t = peek();
      if (t?.t === "op" && (t.v === "+" || t.v === "-")) {
        next();
        const r = parseTerm();
        v = t.v === "+" ? v + r : v - r;
      } else return v;
    }
  }
  function parseTerm(): number {
    let v = parseUnary();
    for (;;) {
      const t = peek();
      if (t?.t === "op" && (t.v === "*" || t.v === "/" || t.v === "%")) {
        next();
        const r = parseUnary();
        if (t.v === "*") v *= r;
        else if (t.v === "/") {
          if (r === 0) throw new Error("division by zero");
          v /= r;
        } else v %= r;
      } else return v;
    }
  }
  function parseUnary(): number {
    const t = peek();
    if (t?.t === "op" && (t.v === "+" || t.v === "-")) {
      next();
      const v = parseUnary();
      return t.v === "-" ? -v : v;
    }
    return parsePow();
  }
  function parsePow(): number {
    const base = parsePrimary();
    const t = peek();
    if (t?.t === "op" && t.v === "^") {
      next();
      return Math.pow(base, parseUnary());
    }
    return base;
  }
  function parsePrimary(): number {
    const t = next();
    if (!t) throw new Error("unexpected end of expression");
    if (t.t === "num") return t.v;
    if (t.t === "lp") {
      const v = parseExpr();
      const c = next();
      if (!c || c.t !== "rp") throw new Error("missing closing paren");
      return v;
    }
    if (t.t === "name") {
      const after = peek();
      if (after?.t === "lp") {
        next();
        const args: number[] = [];
        if (peek()?.t !== "rp") {
          for (;;) {
            args.push(parseExpr());
            const s = peek();
            if (s?.t === "comma") {
              next();
              continue;
            }
            break;
          }
        }
        const close = next();
        if (!close || close.t !== "rp") throw new Error(`missing ) after ${t.v}(…)`);
        const fn = FUNCTIONS[t.v];
        if (!fn) throw new Error(`unknown function "${t.v}"`);
        const out = fn(...args);
        if (typeof out !== "number" || Number.isNaN(out)) throw new Error(`"${t.v}" returned NaN`);
        return out;
      }
      const c = CONSTANTS[t.v];
      if (c === undefined) throw new Error(`unknown name "${t.v}"`);
      return c;
    }
    throw new Error(`unexpected token near "${src.slice(0, 24)}"`);
  }

  const v = parseExpr();
  if (pos !== toks.length) throw new Error("trailing characters after expression");
  if (!Number.isFinite(v)) throw new Error("result is not finite");
  return v;
}

/* -------------------------------- JSON path ------------------------------ */

/** Resolve `a.b[0].c` against a parsed JSON value. Throws on miss. */
export function getJsonPath(root: unknown, path: string): unknown {
  const segs: Array<string | number> = [];
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  let consumed = 0;
  const trimmed = path.trim();
  if (!trimmed || trimmed === "$") return root;
  const body = trimmed.startsWith("$.") ? trimmed.slice(2) : trimmed.startsWith("$") ? trimmed.slice(1) : trimmed;
  while ((m = re.exec(body)) !== null) {
    consumed = m.index + m[0].length;
    if (m[1] !== undefined) segs.push(m[1]);
    else segs.push(parseInt(m[2], 10));
  }
  if (consumed !== body.length) throw new Error(`bad path segment near "${body.slice(consumed, consumed + 12)}"`);
  let cur = root;
  for (const s of segs) {
    if (cur === null || typeof cur !== "object") throw new Error(`path misses at "${String(s)}"`);
    cur = (cur as Record<string | number, unknown>)[s as string];
    if (cur === undefined) throw new Error(`path misses at "${String(s)}"`);
  }
  return cur;
}

/* -------------------------------- line diff ------------------------------ */

/** Minimal LCS line diff: lines prefixed "  "/`- `/`+ `. Capped for context. */
export function lineDiff(aText: string, bText: string, cap = 400): string {
  const a = aText.split("\n");
  const b = bText.split("\n");
  const n = a.length;
  const m = b.length;
  // LCS table (bounded inputs: workspace files are small; cap grid work)
  const W = Math.min(m + 1, 2001);
  const H = Math.min(n + 1, 2001);
  const prev = new Array<number>(W).fill(0);
  const cur = new Array<number>(W).fill(0);
  const table: number[][] = [];
  for (let i = 1; i < H; i++) {
    for (let j = 1; j < W; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? (prev[j - 1] + 1) : Math.max(prev[j], cur[j - 1]);
    }
    table.push([...cur]);
    for (let j = 0; j < W; j++) prev[j] = cur[j];
  }
  const get = (i: number, j: number): number => (i <= 0 || j <= 0 ? 0 : table[i - 1][j - 1] ?? 0);
  const out: string[] = [];
  let i = Math.min(n, H - 1);
  let j = Math.min(m, W - 1);
  let added = 0;
  let removed = 0;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      out.push(`  ${a[i - 1]}`);
      i--;
      j--;
    } else if (get(i - 1, j) >= get(i, j - 1)) {
      out.push(`- ${a[i - 1]}`);
      removed++;
      i--;
    } else {
      out.push(`+ ${b[j - 1]}`);
      added++;
      j--;
    }
    if (out.length >= cap) {
      out.push(`… (diff capped at ${cap} lines)`);
      break;
    }
  }
  while (i > 0 && out.length < cap) {
    out.push(`- ${a[i - 1]}`);
    removed++;
    i--;
  }
  while (j > 0 && out.length < cap) {
    out.push(`+ ${b[j - 1]}`);
    added++;
    j--;
  }
  out.reverse();
  const truncatedNote =
    n > H - 1 || m > W - 1 ? "\n[ducky: files larger than 2000 lines — diff on the head]" : "";
  if (!added && !removed) return "Files are identical.";
  return `--- a\n+++ b\n@@ -${n} +${m} @@ (-${removed} +${added})\n${out.join("\n")}${truncatedNote}`;
}

/* ------------------------------- multi-edit ------------------------------ */

export interface TextEdit {
  oldStr: string;
  newStr: string;
}

/** Apply sequential literal edits. Same strictness as edit_file per edit. */
export function applyEdits(content: string, edits: TextEdit[], replaceAll: boolean): { next: string; applied: number } {
  let next = content;
  let applied = 0;
  edits.forEach((e, idx) => {
    if (!e.oldStr) throw new Error(`multi_edit: item ${idx} has empty "old_str"`);
    let count = 0;
    let at = next.indexOf(e.oldStr);
    while (at !== -1) {
      count++;
      at = next.indexOf(e.oldStr, at + Math.max(1, e.oldStr.length));
    }
    if (count === 0) throw new Error(`multi_edit: item ${idx} old_str not found. Read the file first.`);
    if (count > 1 && !replaceAll) {
      throw new Error(
        `multi_edit: item ${idx} old_str appears ${count} times; add context or run edits one file at a time with replace_all.`,
      );
    }
    next = replaceAll ? next.split(e.oldStr).join(e.newStr) : next.replace(e.oldStr, e.newStr);
    applied += replaceAll ? count : 1;
  });
  return { next, applied };
}

/* --------------------------- base64 / sha-256 ---------------------------- */

function te(): TextEncoder {
  return new TextEncoder();
}
function td(): TextDecoder {
  return new TextDecoder();
}

/** UTF-8-safe base64 encode (works in browser + Node). */
export function b64encode(text: string): string {
  const bytes = te().encode(text);
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}

/** UTF-8-safe base64 decode. Throws on invalid input. */
export function b64decode(b64: string): string {
  const clean = b64.trim().replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) {
    throw new Error("base64_decode: invalid base64 input");
  }
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return td().decode(bytes);
}

async function subtleCrypto(): Promise<SubtleCrypto> {
  const c =
    typeof globalThis !== "undefined"
      ? (globalThis as { crypto?: Crypto }).crypto
      : undefined;
  if (!c?.subtle) throw new Error("sha256: SubtleCrypto unavailable (needs a secure context)");
  return c.subtle;
}

/** Hex SHA-256 of UTF-8 text. */
export async function sha256Hex(text: string): Promise<string> {
  const sub = await subtleCrypto();
  const digest = await sub.digest("SHA-256", te().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* -------------------------------- file info ------------------------------ */

/** Line/word/char/byte summary for a workspace text value. */
export function fileInfoSummary(content: string): { lines: number; words: number; chars: number; bytes: number } {
  const lines = content === "" ? 0 : content.split("\n").length;
  const words = (content.match(/\S+/g) ?? []).length;
  return { lines, words, chars: content.length, bytes: te().encode(content).length };
}

/* ------------------------------ line transforms -------------------------- */

/** Sort lines (lexicographic, numeric-aware, or reverse). Returns sorted text. */
export function sortLines(text: string, opts?: { reverse?: boolean; numeric?: boolean }): string {
  const lines = text.split("\n");
  const cmp = opts?.numeric
    ? (a: string, b: string) => {
        const na = parseFloat(a);
        const nb = parseFloat(b);
        if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b);
        return na - nb || a.localeCompare(b);
      }
    : (a: string, b: string) => a.localeCompare(b);
  lines.sort(opts?.reverse ? (a, b) => -cmp(a, b) : cmp);
  return lines.join("\n");
}

/** Drop duplicate lines, keeping first occurrence order. Returns {text, removed}. */
export function dedupeLines(text: string, ignoreCase?: boolean): { text: string; removed: number } {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const k = ignoreCase ? line.toLowerCase() : line;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(line);
  }
  return { text: out.join("\n"), removed: text.split("\n").length - out.length };
}

/** Regex find-and-replace over full text (native $-substitution). Returns {text, count}. */
export function regexReplace(
  text: string,
  pattern: string,
  replacement: string,
  flags = "",
): { text: string; count: number } {
  if (!/^[gimsuy]*$/.test(flags)) throw new Error(`regex: bad flags "${flags}" (allowed: g i m s u y)`);
  let re: RegExp;
  let reAll: RegExp;
  try {
    re = new RegExp(pattern, flags);
    reAll = new RegExp(pattern, flags.includes("g") ? flags : `${flags}g`);
  } catch (e) {
    throw new Error(`regex: invalid pattern — ${(e as Error).message}`);
  }
  const matches = text.match(reAll);
  return { text: text.replace(re, replacement), count: matches ? matches.length : 0 };
}

/* --------------------------------- CSV ----------------------------------- */

/** Split one CSV line honoring quotes + escaped quotes. */
function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      cells.push(cur);
      cur = "";
    } else cur += c;
  }
  cells.push(cur);
  return cells;
}

/* ---------------------------------- URLs --------------------------------- */

/** Split a URL into its parts. Throws on invalid input. */
export function parseUrlParts(raw: string): Record<string, string | null> {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("url_parse: not an absolute URL (needs scheme, e.g. https://)");
  }
  return {
    scheme: u.protocol.replace(/:$/, ""),
    host: u.hostname,
    port: u.port || null,
    path: u.pathname,
    query: u.search ? u.search.slice(1) : null,
    fragment: u.hash ? u.hash.slice(1) : null,
    user: u.username || null,
  };
}

/* ---------------------------------- HTML --------------------------------- */

/** Strip scripts/styles/tags → readable text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Extract links as {text, href} pairs (first 200). */
export function htmlLinks(html: string): Array<{ text: string; href: string }> {
  const out: Array<{ text: string; href: string }> = [];
  const re = /<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < 200) {
    const href = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (!href) continue;
    const text = m[4].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || href;
    out.push({ text, href });
  }
  return out;
}

/* -------------------------------- Markdown ------------------------------- */

/** Headings outline with GitHub-style anchors. */
export function markdownToc(md: string): Array<{ level: number; text: string; anchor: string }> {
  const out: Array<{ level: number; text: string; anchor: string }> = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const text = m[2].replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
    const anchor = text.toLowerCase().replace(/[^a-z0-9 _-]/g, "").trim().replace(/\s+/g, "-");
    out.push({ level: m[1].length, text, anchor });
  }
  return out;
}

/** Inline + bare links (first 200). */
export function markdownLinks(md: string): Array<{ text: string; href: string }> {
  const out: Array<{ text: string; href: string }> = [];
  const seen = new Set<string>();
  const push = (text: string, href: string) => {
    const k = `${text} ${href}`;
    if (seen.has(k) || out.length >= 200) return;
    seen.add(k);
    out.push({ text: text.slice(0, 120) || href, href });
  };
  const inline = /\[([^\]]{0,200})\]\((https?:[^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = inline.exec(md)) !== null) push(m[1].trim(), m[2]);
  const bare = /(^|[\s(])(https?:\/\/[^\s)<\]]+)/g;
  while ((m = bare.exec(md)) !== null) push(m[2], m[2]);
  return out;
}

/* ---------------------------------- color --------------------------------- */

function parseHexColor(input: string): [number, number, number] {
  let h = input.trim().toLowerCase();
  if (h.startsWith("#")) h = h.slice(1);
  if (/^[0-9a-f]{3}$/.test(h)) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/.test(h)) throw new Error(`color: "${input}" is not a hex color (#rgb or #rrggbb)`);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/** hex → rgb() + hsl() strings. */
export function colorConvert(input: string): { hex: string; rgb: string; hsl: string } {
  const [r, g, b] = parseHexColor(input);
  const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  const [h, s, l] = rgbToHsl(r, g, b);
  return { hex, rgb: `rgb(${r}, ${g}, ${b})`, hsl: `hsl(${h}, ${s}%, ${l}%)` };
}

function luminance(r: number, g: number, b: number): number {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio + AA/AAA verdicts for normal text. */
export function colorContrast(a: string, b: string): { ratio: number; aa: boolean; aaa: boolean } {
  const [r1, g1, b1] = parseHexColor(a);
  const [r2, g2, b2] = parseHexColor(b);
  const l1 = luminance(r1, g1, b1);
  const l2 = luminance(r2, g2, b2);
  const ratio = Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
  return { ratio, aa: ratio >= 4.5, aaa: ratio >= 7 };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

/** Complementary + analogous palette mates for a hex color. */
export function colorPalette(input: string): { base: string; complementary: string; analogous: [string, string] } {
  const [r, g, b] = parseHexColor(input);
  const [h, s, l] = rgbToHsl(r, g, b);
  const base = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  return {
    base,
    complementary: hslToHex((h + 180) % 360, s, l),
    analogous: [hslToHex((h + 30) % 360, s, l), hslToHex((h + 330) % 360, s, l)],
  };
}

/* -------------------------------- datetime ------------------------------- */

const UNIT_MS: Record<string, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
};

/** Shift an ISO date by N units (minutes|hours|days|weeks). Returns ISO. */
export function dateAdd(iso: string, amount: number, unit: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`date: "${iso}" is not a parseable date`);
  const ms = UNIT_MS[unit];
  if (!ms) throw new Error(`date: unit must be minutes | hours | days | weeks (got "${unit}")`);
  if (!Number.isFinite(amount) || Math.abs(amount) > 100000) throw new Error("date: amount out of range");
  return new Date(t + amount * ms).toISOString();
}

/** Human breakdown between two ISO dates. */
export function dateDiff(aIso: string, bIso: string): string {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (Number.isNaN(a)) throw new Error(`date: "${aIso}" is not parseable`);
  if (Number.isNaN(b)) throw new Error(`date: "${bIso}" is not parseable`);
  let ms = Math.abs(b - a);
  const days = Math.floor(ms / 86_400_000);
  ms -= days * 86_400_000;
  const hours = Math.floor(ms / 3_600_000);
  ms -= hours * 3_600_000;
  const minutes = Math.floor(ms / 60_000);
  const dir = b >= a ? "later" : "earlier";
  return `${days}d ${hours}h ${minutes}m (${dir})`;
}

/* ----------------------------------- RSS ---------------------------------- */

/** Minimal RSS/Atom item parser over fetched XML text. */
export function parseRssItems(xml: string, max = 10): Array<{ title: string; link: string; date: string }> {
  const out: Array<{ title: string; link: string; date: string }> = [];
  const blocks = [
    ...xml.matchAll(/<item[\s>][\s\S]*?<\/item\s*>/gi),
    ...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry\s*>/gi),
  ];
  const text = (s: string, tag: string): string => {
    const m = s.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, "i"));
    if (!m) return "";
    return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  };
  const link = (s: string): string => {
    const href = s.match(/<link[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (href) return (href[1] ?? href[2] ?? "").trim();
    return text(s, "link").split(/\s/)[0] ?? "";
  };
  for (const b of blocks) {
    if (out.length >= Math.min(30, Math.max(1, max))) break;
    const title = text(b[0], "title") || "(untitled)";
    out.push({ title, link: link(b[0]), date: text(b[0], "pubDate") || text(b[0], "published") || text(b[0], "updated") });
  }
  return out;
}

/** Render the head of a CSV file as an aligned table. */
export function previewCsv(content: string, rows = 10, delimiter = ","): string {
  if (delimiter.length !== 1) throw new Error("csv: delimiter must be one character");
  const lines = content.split("\n").filter((l) => l.trim() !== "");
  if (!lines.length) return "(empty file)";
  const head = lines.slice(0, Math.min(rows + 1, lines.length)).map((l) => splitCsvLine(l, delimiter));
  const cols = Math.max(...head.map((r) => r.length));
  const ragged = head.some((r) => r.length !== cols);
  const widths = Array.from({ length: cols }, (_, c) =>
    Math.min(40, Math.max(...head.map((r) => (r[c] ?? "").length), 6)),
  );
  const fmt = (r: string[]) =>
    `| ${r.map((cell, c) => (cell ?? "").slice(0, 40).padEnd(widths[c])).join(" | ")} |`;
  const out = [fmt(head[0]), `|${widths.map((w) => "-".repeat(w + 2)).join("|")}|`];
  for (const r of head.slice(1)) out.push(fmt(r));
  const extra = lines.length - head.length;
  if (extra > 0) out.push(`… +${extra} more row(s)`);
  if (ragged) out.push("[ducky: ragged rows — some lines have a different column count]");
  return out.join("\n");
}
