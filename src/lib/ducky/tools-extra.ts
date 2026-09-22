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
