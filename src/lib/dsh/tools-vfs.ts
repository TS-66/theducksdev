/**
 * DSH Web — virtual filesystem (vFS) helpers.
 *
 * The session workspace is a flat `Record<string, string>` where keys are
 * file paths and values are text contents. Directories are implicit
 * (S3-style): writing "a/b/c.txt" materialises "a/" and "a/b/" for listing
 * purposes without storing directory entries.
 *
 * Inspired by the filesystem backends of deepseek-ai/deepseek-harness
 * (`@deepseek-ai/dsh-tool-fs` / `dsh-tool-fs-search`).
 */

/* ------------------------------- paths ---------------------------------- */

/**
 * Normalize a workspace path to canonical form:
 * no leading `/` or `./`, no trailing slash, `.` segments collapsed,
 * `..` resolved within the root. Root is "".
 */
export function normalizePath(input: string): string {
  const raw = String(input ?? '').trim();
  if (!raw || raw === '.' || raw === '/' || raw === './') return '';
  // strip leading slashes / "./"
  let p = raw.replace(/^\/+/, '');
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return out.join('/');
}

/** Join two normalized path fragments. */
export function joinPath(base: string, rel: string): string {
  if (!base) return normalizePath(rel);
  if (!rel || rel === '.') return base;
  return normalizePath(`${base}/${rel}`);
}

/** True when `p` refers to an implied directory (has entries beneath it). */
export function isDirectory(ws: Record<string, string>, p: string): boolean {
  const dir = normalizePath(p);
  if (dir === '') return Object.keys(ws).length > 0;
  const prefix = `${dir}/`;
  return Object.keys(ws).some((k) => k.startsWith(prefix));
}

/** Path exists as a file or an implied directory. */
export function pathExists(ws: Record<string, string>, p: string): boolean {
  const n = normalizePath(p);
  return n === '' ? Object.keys(ws).length > 0 : hasOwn(ws, n) || isDirectory(ws, n);
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/* ------------------------------ listing ---------------------------------- */

/** All file keys, sorted lexicographically. */
export function allFilePaths(ws: Record<string, string>): string[] {
  return Object.keys(ws).sort();
}

/**
 * Immediate children of a directory; directories carry a trailing "/".
 * Root is "".
 */
export function listDir(ws: Record<string, string>, dir = ''): string[] {
  const d = normalizePath(dir);
  const prefix = d ? `${d}/` : '';
  const seen = new Map<string, boolean>(); // name -> isDir
  for (const k of Object.keys(ws)) {
    if (prefix && !k.startsWith(prefix)) continue;
    const rest = prefix ? k.slice(prefix.length) : k;
    if (!rest) continue;
    const slash = rest.indexOf('/');
    if (slash === -1) {
      seen.set(rest, false);
    } else {
      seen.set(rest.slice(0, slash), true);
    }
  }
  return Array.from(seen.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, isDir]) => (isDir ? `${name}/` : name));
}

/* --------------------------- glob matching ------------------------------- */

/**
 * Expand top-level brace alternations, e.g. "*.{ts,tsx}" → ["*.ts", "*.tsx"].
 * Nested braces supported up to a sane cap.
 */
export function expandBraces(pattern: string): string[] {
  const results: string[] = [];
  const walk = (s: string, depth: number) => {
    if (results.length > 200) return;
    const open = s.indexOf('{');
    if (open === -1 || depth > 6) {
      results.push(s);
      return;
    }
    // find matching close brace, tracking nesting + top-level commas
    let d = 0;
    const alts: string[] = [];
    let curStart = open + 1;
    let close = -1;
    for (let i = open; i < s.length; i++) {
      const c = s[i];
      if (c === '{') d++;
      else if (c === '}') {
        d--;
        if (d === 0) {
          close = i;
          break;
        }
      } else if (c === ',' && d === 1) {
        alts.push(s.slice(curStart, i));
        curStart = i + 1;
      }
    }
    if (close === -1) {
      results.push(s); // unbalanced "{" — literal
      return;
    }
    alts.push(s.slice(curStart, close));
    const head = s.slice(0, open);
    const tail = s.slice(close + 1);
    for (const alt of alts) walk(head + alt + tail, depth + 1);
  };
  walk(pattern, 0);
  return results.length ? results : [pattern];
}

const escapeRe = (s: string) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');

/**
 * Translate one glob segment pattern into a RegExp source fragment supporting
 * `*` (within-segment), `**` (any depth incl. separators), `?` (single char).
 */
function globSegmentToReSource(glob: string): string {
  let re = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // consume all consecutive stars
        while (glob[i] === '*') i++;
        if (glob[i] === '/') {
          // "**/" matches zero or more leading segments
          re += '(?:[^/]+/)*';
          i++;
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
        i++;
      }
      continue;
    }
    if (c === '?') {
      re += '[^/]';
      i++;
      continue;
    }
    re += escapeRe(c);
    i++;
  }
  return re;
}

/**
 * Compile a glob into matchers. A pattern with NO "/" matches basenames at any
 * depth (like upstream glob: `"*.ts"` searches the whole tree); patterns with
 * "/" are anchored at the search root.
 */
export function compileGlob(pattern: string): { regexps: RegExp[]; basenameMode: boolean } {
  const expanded = expandBraces(pattern);
  const basenameMode = !expanded.some((g) => g.includes('/'));
  const regexps = expanded.map((g) => new RegExp(`^${globSegmentToReSource(g)}$`));
  return { regexps, basenameMode };
}

/**
 * Return workspace files under `baseDir` whose paths match `pattern`.
 * Matches are returned sorted.
 */
export function matchGlob(
  ws: Record<string, string>,
  pattern: string,
  baseDir = '',
): string[] {
  const root = normalizePath(baseDir);
  const { regexps, basenameMode } = compileGlob(pattern);
  const prefix = root ? `${root}/` : '';
  return allFilePaths(ws)
    .filter((p) => {
      if (prefix && !p.startsWith(prefix)) return false;
      const target = basenameMode ? p.slice(p.lastIndexOf('/') + 1) : p;
      return regexps.some((re) => re.test(target));
    });
}

/* ---------------------------- grep search -------------------------------- */

export interface GrepOptions {
  /** JS regular expression source */
  pattern: string;
  /** limit search to this subtree/file */
  path?: string;
  maxResults?: number;
  ignoreCase?: boolean;
}

export interface GrepMatch {
  file: string;
  lineNo: number;
  lineText: string;
}

/** Raw matches across the tree; throws on invalid regex. */
export function grepMatches(ws: Record<string, string>, opts: GrepOptions): GrepMatch[] {
  const re = new RegExp(opts.pattern, opts.ignoreCase ? 'i' : '');
  const root = normalizePath(opts.path ?? '');
  const prefix = root ? `${root}/` : '';
  const cap = opts.maxResults ?? 250;
  const found: GrepMatch[] = [];
  for (const p of allFilePaths(ws)) {
    if (prefix && !(root && p === root) && !p.startsWith(prefix)) continue;
    const lines = ws[p].split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        found.push({ file: p, lineNo: i + 1, lineText: lines[i].slice(0, 500) });
        if (found.length >= cap) return found;
      }
    }
  }
  return found;
}

/** Human-friendly grep output grouped by file with line numbers. */
export function formatGrepOutput(matches: GrepMatch[], cappedAt: number): string {
  if (!matches.length) return 'No matches.';
  const byFile = new Map<string, GrepMatch[]>();
  for (const m of matches) {
    const arr = byFile.get(m.file);
    if (arr) arr.push(m);
    else byFile.set(m.file, [m]);
  }
  const parts: string[] = [];
  for (const [file, ms] of byFile) {
    parts.push(file);
    for (const m of ms) parts.push(`  ${String(m.lineNo).padStart(4)}| ${m.lineText}`);
  }
  if (matches.length >= cappedAt) {
    parts.push(`[dsh: ${cappedAt}-match limit reached — narrow your search.]`);
  }
  return parts.join('\n');
}

/* ------------------------- read formatting ------------------------------- */

/** cat -n style numbered content window. */
export function formatReadWindow(content: string, offset = 1, limit = 2000): string {
  const lines = content.split('\n');
  const startIdx = Math.max(0, Math.floor(offset) - 1);
  const endIdx = Math.min(lines.length, startIdx + Math.max(1, Math.floor(limit)));
  const width = String(endIdx).length;
  const out: string[] = [];
  for (let i = startIdx; i < endIdx; i++) {
    out.push(`${String(i + 1).padStart(width, ' ')}\t${lines[i]}`);
  }
  if (endIdx < lines.length) {
    out.push(`… (${lines.length - endIdx} more line${lines.length - endIdx === 1 ? '' : 's'} — raise \`limit\`)`);
  }
  return out.join('\n') || '(empty file)';
}

/**
 * Render the whole tree ASCII-style (used in system prompt snapshots).
 * Implicit directories appear as nodes; counts mirror `tree` output.
 */
export function renderTree(
  ws: Record<string, string>,
  root = '',
  opts?: { dirsFirst?: boolean },
): string {
  type Node = { name: string; children: Map<string, Node>; isFile: boolean };
  const rootNode: Node = { name: '', children: new Map(), isFile: false };
  for (const p of allFilePaths(ws)) {
    const segs = p.split('/');
    let cur = rootNode;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const isFile = i === segs.length - 1;
      let next = cur.children.get(seg);
      if (!next) {
        next = { name: seg, children: new Map(), isFile };
        cur.children.set(seg, next);
      }
      cur = next;
    }
  }

  const dirsCount = { n: 0 };
  const filesCount = { n: 0 };
  const lines: string[] = [];

  const visit = (node: Node, prefix: string, isFirstLevelRootChildren: boolean) => {
    const kids = Array.from(node.children.values()).sort((a, b) => {
      const ad = a.children.size > 0;
      const bd = b.children.size > 0;
      if ((opts?.dirsFirst ?? true) !== false) {
        if (ad !== bd) return ad ? -1 : 1;
        return a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });
    kids.forEach((kid, idx) => {
      const last = idx === kids.length - 1;
      const branch = isFirstLevelRootChildren ? '' : `${last ? '└── ' : '├── '}`;
      const isDir = kid.children.size > 0;
      if (isDir) {
        dirsCount.n++;
        lines.push(`${prefix}${branch}${kid.name}/`);
        visit(kid, isFirstLevelRootChildren ? '' : `${prefix}${last ? '    ' : '│   '}`, false);
      } else {
        filesCount.n++;
        lines.push(`${prefix}${branch}${kid.name}`);
      }
    });
  };

  const rootName = root || '.';
  lines.push(rootName);
  visit(rootNode, '', true);
  lines.push('');
  lines.push(`${dirsCount.n} director${dirsCount.n === 1 ? 'y' : 'ies'}, ${filesCount.n} file${filesCount.n === 1 ? '' : 's'}`);
  return lines.join('\n');
}
