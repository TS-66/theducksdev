/**
 * DSH Web — mini shell interpreter over the session virtual filesystem.
 *
 * Implements a practical subset of POSIX-flavoured shell behaviour
 * (pwd/cd/ls/cat/head/tail/echo/touch/mkdir/rm/mv/cp/wc/find/tree/grep plus
 * redirections, pipes, && || ; chaining) directly against a
 * `Record<string, string>` workspace. No subprocesses — everything runs
 * synchronously in the browser, mirroring what @deepseek-ai/dsh-tool-bash
 * offers upstream but fully serverless.
 */

import {
  isDirectory,
  listDir,
  matchGlob,
  allFilePaths,
  joinPath,
  normalizePath,
  renderTree,
} from './tools-vfs';

export const MAX_SHELL_OUTPUT = 20_000;

export interface ShellResult {
  stdout: string;
  /** working directory AFTER the command chain (persist by caller) */
  cwd: string;
  /** true when final exit code === 0 */
  ok: boolean;
}

/* ------------------------------ tokenizer -------------------------------- */

interface Token {
  value: string;
  quoted: boolean;
}

function tokenize(input: string): { tokens: Token[]; error?: string } {
  const tokens: Token[] = [];
  let i = 0;
  let cur = '';
  let curQuoted = false;
  let dirty = false;
  const push = () => {
    if (dirty) {
      tokens.push({ value: cur, quoted: curQuoted });
      cur = '';
      curQuoted = false;
      dirty = false;
    }
  };
  while (i < input.length) {
    const c = input[i];
    if (c === '\\' && i + 1 < input.length) {
      cur += input[i + 1];
      i += 2;
      dirty = true;
      continue;
    }
    if (c === "'") {
      const end = input.indexOf("'", i + 1);
      if (end === -1) return { tokens, error: 'unexpected EOF while looking for matching `' + "'" + "'" };
      cur += input.slice(i + 1, end);
      curQuoted = true;
      dirty = true;
      i = end + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let closed = false;
      while (j < input.length) {
        if (input[j] === '\\' && j + 1 < input.length) {
          cur += input[j + 1];
          j += 2;
          curQuoted = true;
          dirty = true;
          continue;
        }
        if (input[j] === '"') {
          closed = true;
          break;
        }
        cur += input[j];
        j++;
      }
      if (!closed) return { tokens, error: 'unexpected EOF while looking for matching `"`' };
      curQuoted = true;
      dirty = true;
      i = j + 1;
      continue;
    }
    if (/\s/.test(c)) {
      push();
      i++;
      continue;
    }
    cur += c;
    dirty = true;
    i++;
  }
  push();
  return { tokens };
}

/* --------------------------- statement parsing ---------------------------- */

type Op = ';' | '&&' | '||';

interface Statement {
  opBefore: Op;
  text: string;
}

/** Split on top-level ; && || (bare & treated as ;) while respecting quotes. */
function splitStatements(cmd: string): Statement[] {
  const stmts: Statement[] = [];
  let buf = '';
  let op: Op = ';';
  let quote: string | null = null;
  let i = 0;
  const flush = (nextOp: Op) => {
    if (buf.trim().length > 0) stmts.push({ opBefore: op, text: buf.trim() });
    buf = '';
    op = nextOp;
  };
  while (i < cmd.length) {
    const c = cmd[i];
    if (quote) {
      buf += c;
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"') {
        buf += cmd[i + 1] ?? '';
        i++;
      }
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      buf += c;
      i++;
      continue;
    }
    if (c === '\\' && i + 1 < cmd.length) {
      buf += c + cmd[i + 1];
      i += 2;
      continue;
    }
    if (c === ';') {
      flush(';');
      i++;
      continue;
    }
    if (c === '&') {
      if (cmd[i + 1] === '&') {
        flush('&&');
        i += 2;
      } else {
        flush(';'); // background ≈ sequential here
        i++;
      }
      continue;
    }
    if (c === '|' && cmd[i + 1] === '|') {
      flush('||');
      i += 2;
      continue;
    }
    buf += c;
    i++;
  }
  flush(';');
  return stmts;
}

interface SimpleInvocation {
  argv: Token[];
  stdoutFile?: string;
  appendStdout?: boolean;
  stdinFile?: string;
  stderrNull?: boolean;
}

/** Split one pipeline string on | into redirect-aware invocations. */
function splitPipeline(text: string): { stages: SimpleInvocation[]; error?: string } {
  // detect >/>>/< targets first (only one redirect set supported)
  const stages: SimpleInvocation[] = [];
  const pipeSplit: string[] = [];
  let buf = '';
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      buf += c;
      if (c === quote) quote = null;
      continue; // for-loop supplies the step
    }
    if (c === '"' || c === "'") {
      quote = c;
      buf += c;
      continue;
    }
    if (c === '|') {
      // ignore "||" (already handled at statement level)
      pipeSplit.push(buf);
      buf = '';
      i++;
      continue;
    }
    buf += c;
  }
  pipeSplit.push(buf);

  for (const rawStage of pipeSplit) {
    const { tokens, error } = tokenize(rawStage);
    if (error) return { stages, error: `syntax error near unexpected token: ${error}` };
    const stage: SimpleInvocation = { argv: [] };
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const m = /^(\d*)(>>|>|<)(&?)$/.exec(t.value);
      if (m && !t.quoted) {
        const [, , redir, amp] = m;
        const target = tokens[i + 1]?.value;
        if (!target) return { stages, error: `syntax error: missing redirect target` };
        if (redir === '<') stage.stdinFile = target;
        else {
          stage.stdoutFile = target;
          stage.appendStdout = redir === '>>';
          if (amp) stage.stderrNull = true;
        }
        i++; // consume target
        continue;
      }
      stage.argv.push(t);
    }
    if (stage.argv.length > 0) stages.push(stage);
  }
  return { stages };
}

/* ------------------------------ fs helpers ------------------------------- */

const resolveWsPath = (cwd: string, p: string): string =>
  p.startsWith('/') ? normalizePath(p) : joinPath(cwd, p);

function dirExists(ws: Record<string, string>, dir: string): boolean {
  return dir === '' ? Object.keys(ws).length > 0 : isDirectory(ws, dir);
}

function readOrNull(ws: Record<string, string>, p: string): string | null {
  return Object.prototype.hasOwnProperty.call(ws, p) ? ws[p] : null;
}

/** Expand wildcard arguments against the vFS (relative patterns resolve under cwd). */
function expandArgs(argv: Token[], ws: Record<string, string>, cwd: string): Token[] {
  const out: Token[] = [];
  for (const t of argv) {
    const hasWildcard = !t.quoted && ['*', '?'].some((ch) => t.value.includes(ch));
    if (!hasWildcard) {
      out.push(t);
      continue;
    }
    const matched = matchGlob(ws, t.value, cwd);
    if (matched.length === 0) {
      out.push(t); // keep literal like bash does for unmatched globs
      continue;
    }
    for (const p of matched.sort()) out.push({ value: p, quoted: false });
  }
  return out;
}

function fnMatch(pattern: string, path: string): boolean {
  const re = new RegExp(
    '^' +
      pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]') +
      '$',
  );
  const base = path.slice(path.lastIndexOf('/') + 1);
  return re.test(path) || re.test(base);
}

/* ------------------------- output helpers ------------------------------- */

function padColumns(names: string[], width = 80): string {
  if (!names.length) return '';
  const maxLen = Math.max(...names.map((n) => n.length));
  const cols = Math.max(1, Math.floor(width / (maxLen + 2)));
  const lines: string[] = [];
  for (let i = 0; i < names.length; i += cols) {
    lines.push(
      names
        .slice(i, i + cols)
        .map((n) => n.padEnd(maxLen + 2))
        .join('')
        .trimEnd(),
    );
  }
  return lines.join('\n');
}

function chmodLike(isDir: boolean, size: number | null): string {
  const perms = isDir ? 'drwxr-xr-x' : '-rw-r--r--';
  const sizeStr = size === null ? '-' : String(size);
  return `${perms}  dsh  ${sizeStr.padStart(8)}  `;
}

/* ----------------------------- dispatcher -------------------------------- */

interface ExecContext {
  ws: Record<string, string>;
  cwd: { value: string };
  stdin: string;
}

interface CommandOutcome {
  out: string;
  exit: number;
  /** override stdout content used for piping (defaults to out) */
  pipeOut?: string;
}

const COMMAND_LIST =
  'pwd, cd, ls, cat, head, tail, echo, touch, mkdir, rm, mv, cp, wc, find, tree, date, whoami, uname, grep';

function execCommand(ctx: ExecContext, inv: SimpleInvocation): CommandOutcome {
  const argvTokens = expandArgs(inv.argv, ctx.ws, ctx.cwd.value);
  const name = argvTokens[0]?.value ?? '';
  const args = argvTokens.slice(1).map((t) => t.value);
  const fail = (msg: string, code = 1): CommandOutcome => ({ out: msg, exit: code });

  const writeFileTo = (p: string, content: string, append: boolean) => {
    const target = resolveWsPath(ctx.cwd.value, p);
    if (!target) return fail('dsh: cannot write to workspace root', 1);
    ctx.ws[target] = append ? `${readOrNull(ctx.ws, target) ?? ''}${content}` : content;
    return null;
  };

  switch (name) {
    case 'pwd':
      return { out: ctx.cwd.value || '/', exit: 0 };

    case 'cd': {
      const target = args[0] ?? '/';
      const dir = target === '-' ? ctx.cwd.value : resolveWsPath(ctx.cwd.value, target);
      const norm = normalizePath(dir);
      if (norm !== '' && !dirExists(ctx.ws, norm)) {
        return fail(`dsh: cd: no such directory: ${target}`, 1);
      }
      ctx.cwd.value = norm;
      return { out: '', exit: 0 };
    }

    case 'ls': {
      const showAll = args.some((a) => a.startsWith('-') && a.includes('a'));
      const long = args.some((a) => a.startsWith('-') && a.includes('l'));
      const operands = args.filter((a) => !a.startsWith('-'));
      const dirs = operands.length ? operands : ['.'];
      const rows: string[] = [];
      for (const d of dirs) {
        const abs = resolveWsPath(ctx.cwd.value, d);
        if (!dirExists(ctx.ws, abs)) {
          if (hasFile(ctx.ws, abs)) {
            rows.push(long ? `${chmodLike(false, (ctx.ws[abs] ?? '').length)}${abs}` : abs);
            continue;
          }
          return fail(`dsh: ls: cannot access '${d}': No such file or directory`, 1);
        }
        if (dirs.length > 1) rows.push(`${abs}:`);
        const entries = listDir(ctx.ws, abs).filter((e) => showAll || !e.startsWith('.'));
        if (long) {
          rows.push(`total ${entries.length}`);
          for (const e of entries) {
            if (e.endsWith('/')) rows.push(`${chmodLike(true, null)}${e}`);
            else rows.push(`${chmodLike(false, (ctx.ws[`${abs}/${e}`.replace(/^\/+/, '')] ?? '').length)}${e}`);
          }
        } else {
          rows.push(padColumns(entries));
        }
      }
      return { out: rows.filter((r) => r !== '').join('\n'), exit: 0 };
    }

    case 'cat': {
      if (args.length === 0) return { out: ctx.stdin, exit: 0 };
      const parts: string[] = [];
      for (const f of args) {
        if (f === '-') {
          parts.push(ctx.stdin);
          continue;
        }
        const abs = resolveWsPath(ctx.cwd.value, f);
        const content = readOrNull(ctx.ws, abs);
        if (content === null) return fail(`dsh: cat: ${f}: No such file or directory`, 1);
        parts.push(content);
      }
      return { out: parts.join('').replace(/\n$/, ''), exit: 0 };
    }

    case 'head':
    case 'tail': {
      let n = 10;
      const rest: string[] = [];
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '-n') n = parseInt(args[++i] ?? '10', 10) || 10;
        else if (/^-\d+$/.test(a)) n = Math.abs(parseInt(a, 10));
        else if (!a.startsWith('-')) rest.push(a);
      }
      const sources: Array<{ label?: string; body: string }> = [];
      if (rest.length === 0) sources.push({ body: ctx.stdin });
      for (const f of rest) {
        const abs = resolveWsPath(ctx.cwd.value, f);
        const content = readOrNull(ctx.ws, abs);
        if (content === null) return fail(`dsh: ${name}: ${f}: No such file or directory`, 1);
        sources.push(rest.length > 1 ? { label: f, body: content } : { body: content });
      }
      const chunks: string[] = [];
      for (const s of sources) {
        let lines = s.body.split('\n');
        if (lines[lines.length - 1] === '') lines.pop();
        const slice = name === 'head' ? lines.slice(0, n) : lines.slice(-n);
        chunks.push(
          [
            ...(s.label ? [`==> ${s.label} <==`] : []),
            ...slice,
          ].join('\n'),
        );
      }
      return { out: chunks.join('\n'), exit: 0 };
    }

    case 'echo': {
      const noNewline = args[0] === '-n';
      const text = (noNewline ? args.slice(1) : args).join(' ');
      return { out: text, exit: 0 };
    }

    case 'touch': {
      if (!args.length) return fail('dsh: touch: missing file operand', 1);
      for (const f of args) {
        const abs = resolveWsPath(ctx.cwd.value, f);
        if (!abs) return fail('dsh: touch: invalid path', 1);
        if (!hasFile(ctx.ws, abs)) ctx.ws[abs] = '';
      }
      return { out: '', exit: 0 };
    }

    case 'mkdir': {
      const recursive = args.some((a) => a === '-p');
      const dirs = args.filter((a) => !a.startsWith('-'));
      if (!dirs.length) return fail('dsh: mkdir: missing operand', 1);
      for (const d of dirs) {
        const abs = resolveWsPath(ctx.cwd.value, d);
        if (!abs) return fail('dsh: mkdir: invalid path', 1);
        if (dirExists(ctx.ws, abs)) continue;
        if (!recursive) {
          const parent = abs.includes('/') ? abs.slice(0, abs.lastIndexOf('/')) : '';
          if (parent !== '' && !dirExists(ctx.ws, parent)) {
            return fail(`dsh: mkdir: cannot create directory '${d}': No such file or directory`, 1);
          }
        }
        ctx.ws[`${abs}/.keep`] = '';
      }
      return { out: '', exit: 0 };
    }

    case 'rm': {
      const recursive = args.some((a) => /^-[rf]+$|^-rf$/.test(a));
      const force = args.some((a) => a.includes('f'));
      const targets = args.filter((a) => !a.startsWith('-'));
      if (!targets.length) return fail('dsh: rm: missing operand', 1);
      for (const t of targets) {
        const abs = resolveWsPath(ctx.cwd.value, t);
        if (!abs) return force ? { out: '', exit: 0 } : fail('dsh: rm: refusing to remove workspace root', 1);
        if (hasFile(ctx.ws, abs)) {
          delete ctx.ws[abs];
          continue;
        }
        if (dirExists(ctx.ws, abs)) {
          if (!recursive) return fail(`dsh: rm: cannot remove '${t}': Is a directory`, 1);
          const prefix = `${abs}/`;
          for (const k of Object.keys(ctx.ws).filter((k) => k.startsWith(prefix))) delete ctx.ws[k];
          continue;
        }
        if (!force) return fail(`dsh: rm: cannot remove '${t}': No such file or directory`, 1);
      }
      return { out: '', exit: 0 };
    }

    case 'mv':
    case 'cp': {
      const recursive = args.some((a) => a.startsWith('-') && a.includes('r'));
      const operands = args.filter((a) => !a.startsWith('-'));
      if (operands.length < 2) return fail(`dsh: ${name}: missing destination operand`, 1);
      const destAbs = resolveWsPath(ctx.cwd.value, operands[operands.length - 1]);
      const sources = operands.slice(0, -1);
      if (sources.length > 1 && !dirExists(ctx.ws, destAbs)) {
        return fail(`dsh: ${name}: target '${operands[operands.length - 1]}' is not a directory`, 1);
      }
      for (const src of sources) {
        const srcAbs = resolveWsPath(ctx.cwd.value, src);
        const content = readOrNull(ctx.ws, srcAbs);
        if (content === null) {
          if (dirExists(ctx.ws, srcAbs)) {
            if (!recursive && name === 'cp') {
              return fail(`dsh: cp: omitting directory '${src}'`, 1);
            }
            const prefix = `${srcAbs}/`;
            const stem = destAbs.endsWith('/') || dirExists(ctx.ws, destAbs) ? `${destAbs}/${src.split('/').pop()}` : destAbs;
            for (const k of Object.keys(ctx.ws).filter((k) => k.startsWith(prefix))) {
              ctx.ws[`${stem}/${k.slice(prefix.length)}`] = ctx.ws[k];
              if (name === 'mv') delete ctx.ws[k];
            }
            continue;
          }
          return fail(`dsh: ${name}: cannot stat '${src}': No such file or directory`, 1);
        }
        const targetName = srcAbs.includes('/') ? srcAbs.slice(srcAbs.lastIndexOf('/') + 1) : srcAbs;
        const dest = dirExists(ctx.ws, destAbs) ? `${destAbs}/${targetName}` : destAbs;
        if (!dest) return fail(`dsh: ${name}: invalid destination`, 1);
        ctx.ws[dest] = content;
        if (name === 'mv') delete ctx.ws[srcAbs];
      }
      return { out: '', exit: 0 };
    }

    case 'wc': {
      const mode = args.find((a) => /^-[lwc]$/.test(a))?.[1] as 'l' | 'w' | 'c' | undefined;
      const files = args.filter((a) => !a.startsWith('-'));
      const collect: Array<{ label?: string; body: string }> = [];
      if (!files.length) collect.push({ body: ctx.stdin });
      for (const f of files) {
        const abs = resolveWsPath(ctx.cwd.value, f);
        const c = readOrNull(ctx.ws, abs);
        if (c === null) return fail(`dsh: wc: ${f}: No such file or directory`, 1);
        collect.push(files.length > 1 ? { label: f, body: c } : { body: c });
      }
      const rows = collect.map(({ label, body }) => {
        const l = (body.match(/\n/g) ?? []).length + (body.length && !body.endsWith('\n') ? 1 : 0);
        const w = body.split(/\s+/).filter(Boolean).length;
        const c = body.length;
        const num = mode === 'l' ? l : mode === 'w' ? w : c;
        return `${String(num).padStart(7)}${label ? ` ${label}` : ''}`;
      });
      if (collect.length > 1) {
        const totals = collect.reduce(
          (acc, { body }) => {
            acc.l += (body.match(/\n/g) ?? []).length;
            acc.w += body.split(/\s+/).filter(Boolean).length;
            acc.c += body.length;
            return acc;
          },
          { l: 0, w: 0, c: 0 },
        );
        rows.push(`${String(mode === 'l' ? totals.l : mode === 'w' ? totals.w : totals.c).padStart(7)} total`);
      }
      return { out: rows.join('\n'), exit: 0 };
    }

    case 'find': {
      let base = '.';
      let namePat: string | undefined;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-name') namePat = args[++i];
        else if (!args[i].startsWith('-')) base = args[i];
      }
      const abs = resolveWsPath(ctx.cwd.value, base);
      if (!dirExists(ctx.ws, abs)) return fail(`dsh: find: '${base}': No such file or directory`, 1);
      const prefix = abs ? `${abs}/` : '';
      const hits: string[] = [];
      const seenDirs = new Set<string>();
      for (const k of allFilePaths(ctx.ws)) {
        if (prefix && !k.startsWith(prefix)) continue;
        let dirPart = k.includes('/') ? k.slice(0, k.lastIndexOf('/')) : '';
        while (dirPart !== '' && dirPart !== abs && !seenDirs.has(dirPart)) {
          seenDirs.add(dirPart);
          if ((!namePat || fnMatch(namePat, dirPart))) hits.push(dirPart);
          dirPart = dirPart.includes('/') ? dirPart.slice(0, dirPart.lastIndexOf('/')) : '';
        }
        if (!namePat || fnMatch(namePat, k)) hits.push(k);
      }
      return { out: (hits.length ? hits.sort() : [abs || '.']).join('\n'), exit: 0 };
    }

    case 'tree': {
      const base = args.find((a) => !a.startsWith('-')) ?? '.';
      const abs = resolveWsPath(ctx.cwd.value, base);
      if (!dirExists(ctx.ws, abs)) return fail(`dsh: tree: ${base}: No such file or directory`, 1);
      const prefix = abs ? `${abs}/` : '';
      const subtree: Record<string, string> = {};
      for (const k of Object.keys(ctx.ws)) {
        if (k.startsWith(prefix)) subtree[prefix ? k.slice(prefix.length) : k] = ctx.ws[k];
      }
      return { out: renderTree(subtree, '.', { dirsFirst: true }), exit: 0 };
    }

    case 'date':
      return { out: new Date().toString(), exit: 0 };

    case 'true':
      return { out: '', exit: 0 };

    case 'false':
      return { out: '', exit: 1 };

    case 'whoami':
      return { out: 'dsh', exit: 0 };

    case 'uname':
      return { out: 'DSH Web simulated linux x86_64', exit: 0 };

    case 'grep': {
      const ignoreCase = args.some((a) => a.startsWith('-') && a.includes('i'));
      const invert = args.some((a) => a.startsWith('-') && a.includes('v'));
      const positional = args.filter((a) => !a.startsWith('-'));
      const pattern = positional.shift();
      if (!pattern) return fail('dsh: grep: usage: grep [-i] PATTERN [FILE...]', 2);
      let re: RegExp;
      try {
        re = new RegExp(pattern, ignoreCase ? 'i' : '');
      } catch (e) {
        return fail(`dsh: grep: invalid regular expression: ${(e as Error).message}`, 2);
      }
      type Hit = { file?: string; lineNo: number; text: string };
      const hits: Hit[] = [];
      if (!positional.length) {
        ctx.stdin.split('\n').forEach((line, idx) => {
          if (re.test(line) !== invert) hits.push({ lineNo: idx + 1, text: line });
        });
        return { out: hits.map((h) => h.text).join('\n'), exit: hits.length ? 0 : 1 };
      }
      let hadError = false;
      for (const f of positional) {
        const abs = resolveWsPath(ctx.cwd.value, f);
        const content = readOrNull(ctx.ws, abs);
        if (content === null) {
          if (dirExists(ctx.ws, abs)) {
            for (const p of allFilePaths(ctx.ws)) {
              if (!p.startsWith(`${abs}/`)) continue;
              ctx.ws[p].split('\n').forEach((line, idx) => {
                if (re.test(line) !== invert) hits.push({ file: p, lineNo: idx + 1, text: line });
              });
            }
            continue;
          }
          hadError = true;
          hits.unshift({ file: undefined, lineNo: 0, text: `dsh: grep: ${f}: No such file or directory` });
          continue;
        }
        content.split('\n').forEach((line, idx) => {
          if (re.test(line) !== invert) hits.push({ file: f, lineNo: idx + 1, text: line });
        });
      }
      const outText = hits.map((h) => (h.file ? `${h.file}:${h.lineNo}:${h.text}` : h.text)).join('\n');
      return { out: outText, exit: hadError ? 2 : hits.length ? 0 : 1 };
    }

    default:
      return {
        out: `dsh: ${name}: command not found (simulated shell supports: ${COMMAND_LIST})`,
        exit: 127,
      };
  }
}

function hasFile(ws: Record<string, string>, p: string): boolean {
  return Object.prototype.hasOwnProperty.call(ws, p);
}

/* ------------------------------- pipeline -------------------------------- */

function runPipeline(stages: SimpleInvocation[], ctx: ExecContext): CommandOutcome {
  let stdinData = ctx.stdin;
  let lastOutcome: CommandOutcome | null = null;
  let redirectionStage: SimpleInvocation | undefined;

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    let stageStdin = stdinData;

    if (stage.stdinFile) {
      const abs = resolveWsPath(ctx.cwd.value, stage.stdinFile);
      const content = readOrNull(ctx.ws, abs);
      if (content === null) {
        return {
          out: `dsh: ${stage.argv[0]?.value ?? ''}: ${stage.stdinFile}: No such file or directory`,
          exit: 1,
        };
      }
      stageStdin = content;
    }

    const curCtx: ExecContext = { ws: ctx.ws, cwd: ctx.cwd, stdin: stageStdin };
    const outcome = execCommand(curCtx, { ...stage, stdinFile: undefined });
    if (stage.stdoutFile) redirectionStage = stage;
    lastOutcome = outcome;
    stdinData = outcome.pipeOut ?? outcome.out;
  }

  if (redirectionStage?.stdoutFile) {
    const payload = ((lastOutcome?.pipeOut ?? lastOutcome?.out) ?? '') + '\n';
    const err = writeFileRedir(ctx, redirectionStage.stdoutFile, payload, !!redirectionStage.appendStdout);
    if (err) return { out: err, exit: 1 };
  }

  return (
    lastOutcome ?? {
      out: '',
      exit: 0,
    }
  );
}

function writeFileRedir(
  ctx: ExecContext,
  p: string,
  content: string,
  append: boolean,
): string | null {
  const abs = resolveWsPath(ctx.cwd.value, p);
  if (!abs) return 'dsh: cannot redirect to workspace root';
  ctx.ws[abs] = append ? `${readOrNull(ctx.ws, abs) ?? ''}${content}` : content;
  return null;
}

/* --------------------------------- entry --------------------------------- */

/**
 * Execute `cmd` against the virtual filesystem.
 *
 * NOTE: `ws` is MUTATED in place for writes (caller passes a disposable
 * snapshot and persists it afterwards).
 */
export function runShellCommand(cmd: string, ws: Record<string, string>, cwd: string): ShellResult {
  const ctx: ExecContext = { ws, cwd: { value: normalizePath(cwd) }, stdin: '' };
  let stdoutAll: string[] = [];
  let lastExit = 0;
  let statementRan = false;

  const statements = splitStatements(cmd);
  if (!statements.length) return { stdout: '', cwd: ctx.cwd.value, ok: true };

  for (const stmt of statements) {
    const runnable =
      stmt.opBefore === ';' ||
      (stmt.opBefore === '&&' && lastExit === 0) ||
      (stmt.opBefore === '||' && lastExit !== 0);
    if (!runnable) continue;
    statementRan = true;

    const { stages, error } = splitPipeline(stmt.text);
    if (error) {
      stdoutAll.push(`dsh: syntax error: ${error}`);
      lastExit = 2;
      continue;
    }
    if (!stages.length) continue;

    const outcome = runPipeline(stages, ctx);
    if (outcome.out.length) stdoutAll.push(outcome.out);
    lastExit = outcome.exit;
    if (lastExit === 127) break; // unknown command aborts the chain, bash-like clarity
  }

  if (!statementRan) lastExit = lastExit || 0;

  let stdout = stdoutAll.join('\n');
  if (lastExit !== 0 && !stdout.endsWith(`[exit code: ${lastExit}]`)) {
    stdout += `\n[exit code: ${lastExit}]`;
  }
  if (stdout.length > MAX_SHELL_OUTPUT) {
    const notice = `[dsh: output truncated — showing last ${MAX_SHELL_OUTPUT} characters]\n`;
    stdout = notice + stdout.slice(stdout.length - MAX_SHELL_OUTPUT);
  }
  return { stdout, cwd: ctx.cwd.value, ok: lastExit === 0 };
}
