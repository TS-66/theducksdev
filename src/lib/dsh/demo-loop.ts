/**
 * DSH Web — scripted demo engine.
 *
 * When no DeepSeek API key is configured (or demo mode is forced), this
 * engine stands in for the model: it routes the user's message to one of a
 * few golden-path flows and drives the REAL tool executors against the real
 * virtual workspace — files are genuinely read/written, bash genuinely runs.
 * Only the decision-making is scripted; every tool result you see is real.
 *
 * Emits the same AgentEvent stream as the live agent loop, so the UI is
 * identical (streaming text, tool cards, diffs, todos).
 */

import type { AgentEvent, ChatMessage, Settings, TodoItem } from './types';
import { PLUGINS, resolveEnabledPluginIds } from './plugins';

interface DemoTurnOptions {
  sessionId: string;
  settings: Settings;
  /** user message text (already trimmed) */
  userText: string;
  executors: Record<string, (args: Record<string, unknown>) => Promise<string>>;
  enabledToolNames: Set<string>;
  /** workspace file list + reader for composing summaries */
  listFiles: () => string[];
  readFile: (path: string) => string | null;
  todos: TodoItem[];
  onEvent: (e: AgentEvent) => void;
  signal: AbortSignal;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });

/** Stream text with a lively cadence; aborts cleanly. */
async function streamText(
  text: string,
  onEvent: (e: AgentEvent) => void,
  signal: AbortSignal,
  chunkSize = 6,
  delayMs = 12,
): Promise<void> {
  for (let i = 0; i < text.length; i += chunkSize) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    onEvent({ type: 'text-delta', delta: text.slice(i, i + chunkSize) });
    await sleep(delayMs, signal);
  }
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

export async function runDemoTurn(opts: DemoTurnOptions): Promise<void> {
  const { onEvent, signal } = opts;
  const emitSafe = (e: AgentEvent) => {
    try {
      onEvent(e);
    } catch {
      /* UI listeners must never break the loop */
    }
  };

  emitSafe({ type: 'iteration', n: 1 });

  const can = (t: string) => opts.enabledToolNames.has(t);

  /** run one real tool through the pipeline with events */
  const runTool = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> => {
    const callId = `demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let argsRaw = '{}';
    try {
      argsRaw = JSON.stringify(args);
    } catch {
      /* keep {} */
    }
    emitSafe({ type: 'tool-call-start', callId, name, argsRaw });
    const started = Date.now();
    let ok = true;
    let result: string;
    try {
      const fn = opts.executors[name];
      if (!fn) throw new Error(`tool '${name}' is not available`);
      result = await fn(args);
    } catch (e) {
      ok = false;
      result = `Error: ${(e as Error).message}`;
    }
    await sleep(160 + Math.random() * 240, signal);
    emitSafe({
      type: 'tool-call-end',
      callId,
      name,
      ok,
      result: result.slice(0, 4_000),
      durationMs: Date.now() - started,
    });
    return result;
  };

  const text = opts.userText.toLowerCase();

  try {
    /* ------------------------- route: shell playground ------------------- */
    const shellMatch = text.match(
      /(?:^|\bbash\b|\brun\s+|\bexec\s+)[\s`'"“”]*\b(ls|cat|tree|find|grep|wc|head|tail|pwd|echo|mkdir|touch|rm|mv|cp|date|uname|whoami)\b([^\n]*)/i,
    );
    if (can('bash') && shellMatch) {
      const cmd = `${shellMatch[1]}${shellMatch[2]}`.replace(/[`'"]$/g, '').trim();
      await streamText(
        `No API key configured — running in **demo mode**, but the shell is real. Executing:\n\n\`\`\`bash\n${cmd}\n\`\`\`\n\n`,
        emitSafe,
        signal,
      );
      await runTool('bash', { command: cmd });
      await streamText(
        `\n> Every tool result in demo mode is executed for real against the virtual workspace — only the agent's decisions are scripted. Add a DeepSeek API key in Settings to unlock the full agent.`,
        emitSafe,
        signal,
      );
      emitSafe({ type: 'done', aborted: false });
      return;
    }

    /* ------------------------- route: summarize repo --------------------- */
    if (/summar|overview|repository|packages|structure|explore/.test(text)) {
      const files = opts.listFiles();
      const tsFiles = files.filter((f) => f.endsWith('.ts'));
      const readme = opts.readFile('README.md') ?? '';
      const pkgRaw = opts.readFile('package.json');
      let pkgName = 'greeting-service';
      let scripts: string[] = [];
      try {
        const pkg = JSON.parse(pkgRaw ?? '{}') as {
          name?: string;
          scripts?: Record<string, string>;
        };
        if (pkg.name) pkgName = pkg.name;
        scripts = Object.keys(pkg.scripts ?? {});
      } catch {
        /* defaults hold */
      }
      const title = /^#\s+(.+)$/m.exec(readme)?.[1] ?? pkgName;

      await streamText(
        `Demo mode — no API key, so I'll answer from a scripted flow while executing **real** tools. Let me inspect the workspace.\n\n`,
        emitSafe,
        signal,
      );
      if (can('bash')) await runTool('bash', { command: 'tree' });
      if (can('read_file')) await runTool('read_file', { path: 'README.md', limit: 20 });
      if (can('read_file')) await runTool('read_file', { path: 'package.json' });

      const summary = `## Workspace summary

**\`${pkgName}\`** — ${title.replace(/`/g, '')}.

| Metric | Value |
| --- | --- |
| Files tracked | ${files.length} |
| TypeScript modules | ${tsFiles.length} |
| npm scripts | ${scripts.length ? scripts.map((s) => `\`${s}\``).join(', ') : '—'} |

### Layout

- \`src/index.ts\` — CLI entrypoint that prints greetings for a demo list of names
- \`src/greet.ts\` — the core \`greet()\` helper (template + punctuation handling)
- \`src/utils/format.ts\` — casing/spacing utilities shared by the CLI
- \`tests/greet.test.ts\` — unit tests covering plain names, trimmed input and punctuation

The repository is intentionally tiny: it exists so the harness tools have something real to read, edit and run while you evaluate dsh web.

> Add a DeepSeek API key in **Settings → Models** and I'll analyze anything you ask with the full agent loop.`;
      await streamText(`\n${summary}`, emitSafe, signal);
      emitSafe({ type: 'done', aborted: false });
      return;
    }

    /* ------------------------- route: license & deploy ------------------- */
    if (/licen[cs]e|deploy/.test(text)) {
      await streamText(
        `Demo mode — scripting a LICENSE + deploy flow, executed with **real** write tools.\n\n`,
        emitSafe,
        signal,
      );
      const year = new Date().getFullYear();
      const license = `MIT License\n\nCopyright (c) ${year} greeting-service contributors\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n`;
      const deploy = `#!/usr/bin/env bash\n# deploy.sh — build and deploy greeting-service to Vercel\nset -euo pipefail\n\necho "▸ building..."\nbun run build\n\necho "▸ deploying to Vercel..."\nvercel deploy --prod\n\necho "✓ deployed"\n`;
      if (can('write_file')) {
        await runTool('write_file', { path: 'LICENSE', content: license });
        await runTool('write_file', { path: 'scripts/deploy.sh', content: deploy });
      }
      if (can('bash')) await runTool('bash', { command: 'ls -la scripts && head -n 5 LICENSE' });
      const outro = `Done — two files created in the virtual workspace:

- \`LICENSE\` — MIT, © ${year} (visible in the sidebar file tree)
- \`scripts/deploy.sh\` — build + \`vercel deploy --prod\` one-shot

Check them with the sidebar preview or \`cat LICENSE\` in the composer. With a real API key the agent would also wire an npm \`deploy\` script into \`package.json\` and update the README badge.`;
      await streamText(`\n${outro}`, emitSafe, signal);
      emitSafe({ type: 'done', aborted: false });
      return;
    }

    /* ------------------------- route: unit tests ------------------------- */
    if (/test/.test(text)) {
      await streamText(
        `Demo mode — scripted test review, but the reads are real.\n\n`,
        emitSafe,
        signal,
      );
      if (can('read_file')) await runTool('read_file', { path: 'src/greet.ts' });
      if (can('read_file')) await runTool('read_file', { path: 'tests/greet.test.ts' });
      const review = `### Test review — \`tests/greet.test.ts\`

**Coverage looks solid for the happy paths:**

1. ✅ plain name → \`Hello, Ada!\`
2. ✅ whitespace is trimmed before greeting
3. ✅ empty input surfaces a validation error

**Suggested additions** (the agent would write these with a real key):

\`\`\`ts
it('greets unicode names without mangling', () => {
  expect(greet('Müsli')).toBe('Hello, Müsli!')
})

it('collapses internal whitespace runs', () => {
  expect(greet('Grace   Hopper')).toBe('Hello, Grace Hopper!')
})
\`\`\`

Run them with \`bun test\` — or ask the live agent to add them via \`edit_file\`.`;
      await streamText(`\n${review}`, emitSafe, signal);
      emitSafe({ type: 'done', aborted: false });
      return;
    }

    /* ------------------------- default: capabilities --------------------- */
    const files = opts.listFiles();
    const bytes = Object.values(opts.listFiles()).length;
    void bytes;
    const intro = `**Demo mode** — no DeepSeek API key is configured, so I'm running on a scripted engine. Tool execution is still 100% real: everything happens against the virtual workspace in your browser (${fmtNum(files.length)} files currently tracked).

Try one of these:

- **“summarize this repository”** — runs \`tree\` + real file reads, then reports structure
- **“add a LICENSE file and a deploy script”** — genuinely writes two files you can preview
- **“review the unit tests”** — reads the test suite and suggests additions
- **\`bash ls -la && head README.md\`** — executes any supported shell command for real

Then paste your DeepSeek API key in **Settings → Models** to unlock the full agent loop with \`deepseek-chat\` / \`deepseek-reasoner\`.`;
    await streamText(intro, emitSafe, signal);
    emitSafe({ type: 'done', aborted: false });
  } catch (e) {
    if (signal.aborted) {
      emitSafe({ type: 'done', aborted: true });
      return;
    }
    emitSafe({ type: 'error', message: `Demo engine failure: ${(e as Error).message}` });
    emitSafe({ type: 'done', aborted: false });
  }
}

/** Enabled tool names for demo gating, mirroring the real schema filter. */
export function demoEnabledToolNames(disabledPlugins: string[]): Set<string> {
  return new Set(
    PLUGINS.filter((p) => !disabledPlugins.includes(p.id)).flatMap((p) => p.tools),
  );
}

/** Convert nothing — re-exported for the hook's convenience. */
export type { ChatMessage };
