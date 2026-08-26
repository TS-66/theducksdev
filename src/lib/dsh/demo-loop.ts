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
  /** interactive question bridge (same wire format as the live loop) */
  askUser?: (questions: Array<{
    id: string;
    question: string;
    header?: string;
    options?: Array<{ label: string; description?: string }>;
    multi_select?: boolean;
  }>) => Promise<string>;
  /** whether the session currently has plan mode toggled on */
  planModeActive?: boolean;
  /** bridge that shows the plan-approval card; resolves with the user's decision */
  onPlanExit?: () => Promise<boolean>;
  /** persist the drafted plan into session state (shown later in approval cards) */
  setPlanDraft?: (draft: string) => void;
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

/**
 * Recent web_search results per session, so a follow-up like
 * “fetch the first result” can resolve against the REAL last search.
 * Client-side demo memory only — deliberately ephemeral.
 */
const lastSearchUrls = new Map<string, string[]>();

const ORDINALS: Array<[RegExp, number]> = [
  [/\b(?:first|top|1st|leading|best)\b/, 0],
  [/\b(?:second|2nd)\b/, 1],
  [/\b(?:third|3rd)\b/, 2],
  [/\b(?:fourth|4th)\b/, 3],
  [/\b(?:fifth|5th)\b/, 4],
];

function ordinalIndex(text: string): number {
  for (const [re, idx] of ORDINALS) if (re.test(text)) return idx;
  return -1;
}

function extractUrl(raw: string): string | null {
  const m = raw.match(/https?:\/\/[^\s`'"<>）)]+/i);
  if (!m) return null;
  // trim trailing sentence punctuation that often glues onto URLs
  return m[0].replace(/[.,;:!?…]+$/, '');
}

/**
 * Pull the actual search topic out of a natural-language request:
 * "search the web for deepseek models" → "deepseek models".
 */
function extractSearchQuery(raw: string): string {
  let q = raw.trim();
  q = q.replace(/^(please|can you|could you|dsh[,:]?|hey)\s+/i, '');
  q = q.replace(/^(web\s*search|search\s+(the\s+web|online|the\s+internet))(\s+for|\s+about|\s+:)\s*/i, '');
  q = q.replace(/^look\s*up(\s+on( the)? web)?(\s+for|\s+about)?\s*/i, '');
  q = q.replace(/^search\s+for\s+/i, '');
  q = q.replace(/^(for|about)\s+/i, '');
  q = q.replace(/[?.!]+$/, '');
  return q.length > 0 ? q : raw.trim();
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
    /* ------------------------- route: plan mode --------------------------- */
    // Plan mode intercepts EVERYTHING: while active the harness must stay
    // read-only, research, then hand a plan to exit_plan_mode for approval.
    if (opts.planModeActive && can('exit_plan_mode')) {
      await streamText(
        `Demo mode — **plan mode is active**, so I'll stay read-only and draft an implementation plan first.\n\n`,
        emitSafe,
        signal,
      );
      if (can('bash')) await runTool('bash', { command: 'tree' });
      if (can('read_file')) await runTool('read_file', { path: 'README.md', limit: 12 });

      const goal =
        opts.userText.length > 84 ? `${opts.userText.slice(0, 84)}…` : opts.userText;
      const files = opts.listFiles();
      const hasTests = files.some((f) => f.includes('test'));
      const touchFiles = [
        'src/greet.ts',
        'src/index.ts',
        ...(hasTests ? ['tests/greet.test.ts'] : []),
        'README.md',
      ];

      const draft = `# Implementation plan — ${goal}

## Objective
${opts.userText}

## Current state\n\n- Workspace \`greeting-service\` tracks ${files.length} files; entrypoint is \`src/index.ts\`.\n- Greeting copy lives in \`src/greet.ts\`; CLI flags are parsed inline.\n\n## Phases\n\n1. **Research** — read the touched modules and map call sites (read-only).\n2. **Implement** — apply focused edits via \`edit_file\`, one concern per diff.\n3. **Verify** — run the shell checks / tests and grep the result.\n4. **Document** — update the README section for behavior changes.\n\n## Files touched\n\n${touchFiles.map((f) => `- \`${f}\``).join('\n')}\n\n## Risks & mitigations\n\n- Template drift → keep fallbacks behind defaults, covered by unit tests.\n- CLI surface churn → additive flags only; deprecate before removing.

_Awaiting your approval to exit plan mode._`;

      opts.setPlanDraft?.(draft);
      await streamText(`## Implementation plan\n\n${draft}\n\n`, emitSafe, signal);

      const callId = `demo_plan_${Date.now()}`;
      emitSafe({
        type: 'tool-call-start',
        callId,
        name: 'exit_plan_mode',
        argsRaw: JSON.stringify({ summary: goal }),
      });
      const started = Date.now();
      let approved = false;
      let ok = true;
      try {
        approved = (await opts.onPlanExit?.()) === true;
      } catch {
        ok = false;
      }
      emitSafe({
        type: 'tool-call-end',
        callId,
        name: 'exit_plan_mode',
        ok,
        result: approved
          ? 'User approved the plan.'
          : 'The user did NOT approve the plan yet. Keep refining; stay read-only while in plan mode.',
        durationMs: Date.now() - started,
      });
      await streamText(
        approved
          ? `\n✅ Plan approved — plan mode is now **off** and write tools are unlocked. With a real DeepSeek key I'd execute this plan with live diffs; in demo mode ask *“change the default greeting to Howdy”* to see the edit flow.`
          : `\n⏸ Plan kept open — you're still in plan mode. Ask me to adjust any phase, or approve the card when you're ready to proceed.`,
        emitSafe,
        signal,
      );
      emitSafe({ type: 'done', aborted: false });
      return;
    }

    /* ------------------------- route: web fetch (REAL) ------------------- */
    // Pairs with the web_search route: either an explicit URL in the message,
    // or an ordinal reference resolved from THIS session's last live search.
    // Like web_search above, this hits our serverless proxy — no key needed.
    {
      const explicitUrl = extractUrl(opts.userText);
      const wantsFetch =
        /\b(fetch|open|read|download|pull|get contents? of|scrape)\b/.test(text) ||
        explicitUrl !== null;
      let targetUrl: string | null = explicitUrl;
      if (!targetUrl && wantsFetch && /\b(web|result|link|url|page|article|site)\b/.test(text)) {
        const idx = ordinalIndex(text);
        const stored = lastSearchUrls.get(opts.sessionId) ?? [];
        if (idx >= 0 && stored[idx]) targetUrl = stored[idx];
        else if (/\b(?:first|top)\b/.test(text) && stored[0]) targetUrl = stored[0];
      }
      if (
        can('web_fetch') &&
        wantsFetch &&
        targetUrl &&
        /^https?:\/\//i.test(targetUrl)
      ) {
        await streamText(
          `Demo mode — running a **real** \`web_fetch\` through the server-side plugin proxy on:${'\n'}${targetUrl}\n\n`,
          emitSafe,
          signal,
        );
        const content = await runTool('web_fetch', { url: targetUrl });
        const failedFetch = /^Error:/i.test(content);
        if (!failedFetch) {
          const title = /^# (.+)$/m.exec(content)?.[1] ?? targetUrl;
          // quote the first meaningful lines of the extracted page text
          const bodyLines = content
            .split('\n')
            .filter((l) => l.trim().length > 40)
            .slice(0, 6)
            .map((l) => `> ${l.trim().slice(0, 160)}`)
            .join('\n');
          await streamText(
            `## Fetched — ${title}\n\n${bodyLines || '> (the extractor returned no long prose paragraphs — likely a JS-heavy page)'}` +
              `\n\nThat's the genuine page text pulled server-side by \`web_fetch\` — pair it with another “fetch the second result”, or run a new “search the web for …”.`,
            emitSafe,
            signal,
          );
        } else {
          await streamText(
            `The fetch didn't complete here (${content.trim()}). The plugin validates absolute http(s) URLs and streams sanitized text; some pages block automated readers. Try pasting a different URL or fetching one of the earlier search results.`,
            emitSafe,
            signal,
          );
        }
        emitSafe({ type: 'done', aborted: false });
        return;
      }
      void wantsFetch;
    }

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

    /* ------------------------- route: web search (REAL) ------------------- */
    // Unlike the other demo flows, web_search executes against our serverless
    // proxy (z-ai SDK backend) — it needs NO user API key, so this route is
    // genuinely live even in demo mode. Registered before the keyword routes
    // so explicit search requests always win.
    if (/(search|look ?up|find)\b[^\n]{0,80}\b(web|online|internet)\b|^web ?search|^search (the web|online|for)/.test(text)) {
      if (can('web_search')) {
        const q = extractSearchQuery(opts.userText);
        await streamText(
          `Demo mode — but this one is **real**: \`web_search\` runs through the server-side plugin proxy and needs no model key. Searching for “${q}”…\n\n`,
          emitSafe,
          signal,
        );
        const result = await runTool('web_search', { query: q, num: 6 });
        const failed = /^Error:/i.test(result) || /no results/i.test(result);
        // remember the real URLs so “fetch the first result” works next turn
        const urls = [...result.matchAll(/\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]);
        if (urls.length > 0) lastSearchUrls.set(opts.sessionId, urls);
        else lastSearchUrls.delete(opts.sessionId);
        await streamText(
          failed
            ? `\nThe search backend didn't return results here (${result.trim()}). On a deployed instance with the SDK configured this same call returns live results — and with an API key the agent would rank, fetch and synthesize them for you.`
            : `\nThose are **live results** fetched by the harness plugin — nothing scripted. In a full session the agent would now rank them and read promising links.\n\n→ Try **“fetch the first result”** — I'll run a real \`web_fetch\` on the top link and quote what it actually says.\n\nOr search another topic anytime: “search the web for …”.`,
          emitSafe,
          signal,
        );
        emitSafe({ type: 'done', aborted: false });
        return;
      }
    }

    /* ------------------------- route: unit tests ------------------------- */
    // word-boundary guarded: "latest" must NOT trigger the test review
    if (/\btests?\b|\btesting\b|unit test|test suite|test review/.test(text)) {
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

    /* ------------------------- route: live edit (diff demo) -------------- */
    if (
      /howdy|change .*greeting|default salutation|edit .*greet|rename .*greet|switch .*greeting/.test(
        text,
      )
    ) {
      await streamText(
        `Demo mode — scripting a real **edit_file** call so you can see the diff view. First, reading the target file.\n\n`,
        emitSafe,
        signal,
      );
      if (can('read_file')) await runTool('read_file', { path: 'src/greet.ts' });
      if (can('edit_file')) {
        await runTool('edit_file', {
          path: 'src/greet.ts',
          old_str: `export interface GreetOptions {\n  /** Leading word, defaults to "Hello". */`,
          new_str: `export interface GreetOptions {\n  /** Leading word, defaults to "Howdy". */`,
        });
        await runTool('edit_file', {
          path: 'src/greet.ts',
          old_str: `    this.salutation = options.salutation ?? 'Hello';`,
          new_str: `    this.salutation = options.salutation ?? 'Howdy';`,
        });
      }
      if (can('bash')) await runTool('bash', { command: "grep -n 'Howdy' src/greet.ts" });
      const outro = `Done — two edits applied to \`src/greet.ts\` (check the diff cards above, and preview the file in the sidebar):

1. \`GreetOptions\` docstring now documents the **\"Howdy\"** default
2. \`GreetingService\` fallback is \`'Howdy'\` instead of \`'Hello'\`

The edit cards show exactly what changed — that's the tool-owned presentation layer at work. Undo by asking the live agent (with an API key) to swap it back.`;
      await streamText(`\n${outro}`, emitSafe, signal);
      emitSafe({ type: 'done', aborted: false });
      return;
    }

    /* ------------------------- route: todos / checklist ------------------ */
    if (/(write|make|create|draft) .*(todo|checklist)|plan.*(refactor|release|work)|checklist/.test(text)) {
      await streamText(
        `Demo mode — scripting a \`todo_write\` call. The checklist below is real session state, rendered by the UI exactly like the harness.\n\n`,
        emitSafe,
        signal,
      );
      if (can('todo_write')) {
        await runTool('todo_write', {
          todos: [
            { content: 'Extract greeting templates into i18n module', status: 'completed' },
            { content: 'Add locale negotiation helper (accept-language)', status: 'in_progress' },
            { content: 'Port CLI flags to yargs-style parser', status: 'pending' },
            { content: 'Raise test coverage above 90%', status: 'pending' },
            { content: 'Publish 0.2.0 with changelog', status: 'pending' },
          ],
        });
      }
      const outro = `Checklist written — ${5} items, 1 in progress, 3 pending. The TodoCard persists in the composer deck and stays visible while you work; the live agent updates it via \`todo_write\` as it progresses through real tasks.

Ask me to *“edit the greeting defaults”* next and watch the todo flow hand off to a real file edit.`;
      await streamText(`\n${outro}`, emitSafe, signal);
      emitSafe({ type: 'done', aborted: false });
      return;
    }

    /* ------------------------- route: ask the user ------------------------ */
    if (/ask me|interview|my preference|survey me/.test(text)) {
      await streamText(
        `Demo mode — calling the real \`ask_user_question\` tool. Your answer comes back through the same bridge the live agent uses.\n\n`,
        emitSafe,
        signal,
      );
      if (can('ask_user_question') && opts.askUser) {
        // ask_user_question is bridge-wired (like the live loop's special
        // case), so emit tool events around the direct bridge call.
        const callId = `demo_ask_${Date.now()}`;
        const askArgs = {
          questions: [
            {
              id: 'salutation_style',
              header: 'Greeting style',
              question: 'Which salutation should greeting-service default to?',
              options: [
                { label: 'Howdy (Recommended)', description: 'Friendly, western, great for demos.' },
                { label: 'Hello', description: 'Neutral classic — current default.' },
                { label: 'Ahoy', description: 'Nautical flair for the bold.' },
              ],
            },
            {
              id: 'enthusiasm',
              header: 'Enthusiasm',
              question: 'How many exclamation marks by default?',
              options: [
                { label: 'One (!)', description: 'Professional warmth.' },
                { label: 'Two (!!) (Recommended)', description: 'The README example standard.' },
                { label: 'Three (!!!)', description: 'Maximum energy.' },
              ],
            },
          ],
        };
        emitSafe({
          type: 'tool-call-start',
          callId,
          name: 'ask_user_question',
          argsRaw: JSON.stringify(askArgs),
        });
        const started = Date.now();
        let answer: string;
        let ok = true;
        try {
          answer = await opts.askUser(askArgs.questions);
        } catch (e) {
          ok = false;
          answer = `Error: ${(e as Error).message}`;
        }
        emitSafe({
          type: 'tool-call-end',
          callId,
          name: 'ask_user_question',
          ok,
          result: `The user answered:\n${answer}`.slice(0, 4_000),
          durationMs: Date.now() - started,
        });
        await streamText(
          `\nGot it — the tool bridge returned:\n\n\`\`\`json\n${answer}\n\`\`\`\n\nWith a live key the agent would take this straight into an \`edit_file\` call and update \`src/greet.ts\` accordingly.`,
          emitSafe,
          signal,
        );
      } else if (can('ask_user_question')) {
        await streamText(
          `\n(This session runs without an interactive bridge connected — the live agent would pause here for your answer.)`,
          emitSafe,
          signal,
        );
      }
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
- **“change the default greeting to Howdy”** — real \`edit_file\` calls with live diff views
- **“write a checklist for the refactor”** — real \`todo_write\`, rendered as the checklist card
- **“interview me about the greeting style”** — real \`ask_user_question\` bridge
- **“search the web for deepseek models”** — real \`web_search\` via the server-side plugin (works even in demo)
- **“fetch the first result”** — real \`web_fetch\` reads the page behind your last search's top hit
- **Toggle Plan mode, then send any task** — research → drafted plan → \`exit_plan_mode\` approval card
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
