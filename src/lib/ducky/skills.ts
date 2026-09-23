/**
 * Ducky AI | Coder — built-in skill playbooks.
 *
 * Skills are focused how-to briefs the agent pulls into context with
 * `skill_show`. They cost zero tokens until used and turn vague prompts
 * ("review this", "debug that") into disciplined multi-step procedures.
 */

export interface Skill {
  name: string;
  description: string;
  body: string;
}

export const SKILLS: Skill[] = [
  {
    name: "code-review",
    description: "Review workspace changes like a senior engineer: correctness, security, edge cases.",
    body: [
      "# Skill: code-review",
      "1. `glob` the changed area; `read_file` every touched file fully — never review a diff fragment alone.",
      "2. Check in order: correctness (logic, off-by-ones, null paths), security (injection, secrets, eval),",
      "   errors (unhandled rejections, silent catches), performance (loops, N+1, unbounded growth).",
      "3. For each finding give: file + line, severity (blocker/major/nit), and a concrete fix.",
      "4. End with a verdict: APPROVE, APPROVE WITH NOTES, or REQUEST CHANGES.",
    ].join("\n"),
  },
  {
    name: "debug",
    description: "Systematic debugging: reproduce, isolate, fix, verify — no guessing.",
    body: [
      "# Skill: debug",
      "1. REPRODUCE: restate the symptom; find the smallest trigger (`read_file`, `bash`, logs).",
      "2. ISOLATE: binary-search the cause — halve the suspect area each step, form ONE hypothesis at a time.",
      "3. FIX: change the cause, not the symptom. Keep the diff minimal.",
      "4. VERIFY: re-run the reproduction; check neighbors (`grep` for the same pattern elsewhere).",
      "5. Report: root cause in one sentence, the fix, and how you verified it.",
    ].join("\n"),
  },
  {
    name: "refactor",
    description: "Safe refactors: checklist first, small steps, verify after each step.",
    body: [
      "# Skill: refactor",
      "1. `todo_write` a checklist with one item per step — check them off as you go.",
      "2. `read_file` everything you will touch BEFORE editing; never refactor blind.",
      "3. One behavior-preserving step at a time (`edit_file`, never drive-by rewrites).",
      "4. After each step: re-read the touched region and sanity-check imports/exports still line up.",
      "5. Never mix refactoring with feature changes in the same step.",
    ].join("\n"),
  },
  {
    name: "plan",
    description: "Write implementation plans worth approving: phases, risks, verification.",
    body: [
      "# Skill: plan",
      "1. Explore read-only first (`glob`, `grep`, `read_file`) — plans built on guesses get rejected.",
      "2. Structure: goal (1 line) → phases (numbered, each with files touched + why) → risks → verification.",
      "3. Every phase must name how it will be verified (read-back, targeted grep, build).",
      "4. Flag unknowns explicitly instead of burying them. In plan mode, end with `exit_plan_mode`.",
    ].join("\n"),
  },
  {
    name: "commit",
    description: "Write commit messages that explain WHY, not what.",
    body: [
      "# Skill: commit",
      "1. Summarize the change set first (`bash` status/diff or the activity ledger).",
      "2. Format: `<type>: <imperative summary ≤72 chars>` then a body with WHY (context, tradeoffs).",
      "3. Types: feat, fix, refactor, docs, test, chore. One logical change per message.",
      "4. Never commit secrets, keys, or `.env.local` — verify with a final file list.",
    ].join("\n"),
  },
  {
    name: "docs",
    description: "Documentation that stays true: short, example-led, colocated.",
    body: [
      "# Skill: docs",
      "1. Read the code first — document what it DOES, not what you wish it did.",
      "2. Lead with a runnable example; keep prose under it. One example beats three paragraphs.",
      "3. Document: purpose (1 line), usage (example), gotchas (bullets), never internals.",
      "4. Update the nearest existing doc instead of creating a new file when possible.",
    ].join("\n"),
  },
  {
    name: "test-gen",
    description: "Generate tests that actually protect: happy path, edges, regressions.",
    body: [
      "# Skill: test-gen",
      "1. `read_file` the unit under test completely, including its imports.",
      "2. Cover: the happy path, boundary values, empty/null inputs, and the exact regression being fixed.",
      "3. One assertion per test, names that read as specifications (`returns X when Y`).",
      "4. Keep tests hermetic — no network, no wall-clock dependence, no shared mutable state.",
    ].join("\n"),
  },
  {
    name: "web-research",
    description: "Research the live web fast: search broad, fetch narrow, cite sources.",
    body: [
      "# Skill: web-research",
      "1. `web_search` 2–3 phrasings of the question (broad first, then specific).",
      "2. `web_fetch` at most 3 primary sources — docs and changelogs over blogs.",
      "3. Answer with: what changed / what is true NOW, version numbers, and source links.",
      "4. Say when sources disagree instead of picking one silently. Note the search date.",
    ].join("\n"),
  },
  {
    name: "mcp-integration",
    description: "Connect the agent to outside apps (Blender, Roblox Studio…) via MCP bridges.",
    body: [
      "# Skill: mcp-integration",
      "1. `mcp_servers` first — never assume a bridge is connected; if empty, tell the human the exact URL to add in Settings → Connections → MCP.",
      "2. `mcp_list` to learn the bridge's real tool names — never invent tool names.",
      "3. `mcp_call` with small arguments first (list/get/status before create/delete).",
      "4. Bridges own their state: re-read after every mutation; report bridge errors verbatim.",
      "5. Examples: a Blender bridge exposes scene/object tools; a Roblox Studio bridge exposes instance/script tools — adapt to what `mcp_list` shows.",
    ].join("\n"),
  },
  {
    name: "api-design",
    description: "Design clean APIs: resources, verbs, errors, versioning.",
    body: [
      "# Skill: api-design",
      "1. Name resources as nouns, keep URLs hierarchical; one verb per route.",
      "2. Use status codes honestly (200/201/400/401/404/409/422/429/5xx) with a stable error shape.",
      "3. Version from day one (/v1); never break a shipped field — deprecate with sunset dates.",
      "4. Paginate every list (cursor > offset); document auth, rate limits and idempotency.",
    ].join("\n"),
  },
  {
    name: "sql",
    description: "Write safe SQL: read-only first, explicit columns, measured joins.",
    body: [
      "# Skill: sql",
      "1. SELECT with explicit columns — never SELECT * in shipped code.",
      "2. Reason about joins before writing: which table drives, what fan-out does each join add?",
      "3. Parameterize everything; no string-built queries, ever.",
      "4. Check the plan on big tables (EXPLAIN); add the index that the slow join needs.",
    ].join("\n"),
  },
  {
    name: "regex",
    description: "Craft correct regular expressions: build up, test edges, mind catastrophic backtracking.",
    body: [
      "# Skill: regex",
      "1. Build the pattern in pieces; test each against 3 matching + 3 non-matching strings (use `calc`? no — reason it through or test via `bash` grep).",
      "2. Prefer explicit classes over `.` and lazy over greedy when spans are involved.",
      "3. Avoid nested quantifiers (`(a+)+`) — rewrite or bound repetitions.",
      "4. For file edits use `regex_edit` with $1 groups; verify with `diff_files` after.",
    ].join("\n"),
  },
  {
    name: "git",
    description: "Git hygiene: small commits, honest messages, clean history.",
    body: [
      "# Skill: git",
      "1. One logical change per commit; stage hunks, not files, when scopes mix.",
      "2. Message: `<type>: <imperative ≤72ch>` + WHY body. Types: feat/fix/refactor/docs/test/chore.",
      "3. Never commit secrets, keys, env files or build output — verify the file list first.",
      "4. Pull with rebase on personal branches; never force-push shared history.",
    ].join("\n"),
  },
  {
    name: "perf",
    description: "Performance work that holds up: measure first, fix the bottleneck, prove it.",
    body: [
      "# Skill: perf",
      "1. Measure before touching anything; record the baseline number in a note.",
      "2. Fix the actual bottleneck (profile, don't guess) — one change at a time.",
      "3. Re-measure identically; report before/after with the method, not just vibes.",
      "4. Watch for regressions nearby (`grep` for sibling call sites of the changed code).",
    ].join("\n"),
  },
  {
    name: "security-review",
    description: "Security pass: injection, auth, secrets, dependencies.",
    body: [
      "# Skill: security-review",
      "1. Trace every external input (args, files, network, clipboard) to its sink.",
      "2. Check: injection (commands/SQL/HTML), auth gaps, secrets in code or logs, unsafe eval/deserialization.",
      "3. Rate findings: exploitable-now / latent / hardening. Lead with the first bucket.",
      "4. Every finding gets file + line + a concrete fix — never vague warnings.",
    ].join("\n"),
  },
  {
    name: "local-pc",
    description: "Control the human's REAL computer: see the screen, click, type — the full loop.",
    body: [
      "# Skill: local-pc",
      "1. `pc_status` FIRST, then `pc_caps` — know what exists (screenshot? input unlocked?) before promising anything. If down/locked, tell the human the exact command (`ducky bridge [--input]` + token paste).",
      "2. THE LOOP for anything visual: `pc_screen` → `vision_describe` (read text, buttons, coordinates) → `pc_move`/`pc_click`/`pc_type` → `pc_screen` again to VERIFY the result. Never click blind.",
      "3. Coordinates come from vision_describe on YOUR OWN screenshot only — never guess pixels, never reuse coordinates across different screen states.",
      "4. `pc_exec` for commands freely (read-only first); destructive ones need explicit human confirmation IN CHAT (the tool refuses machine-level destruction on its own).",
      "5. Prefer the virtual workspace for drafts; the PC is for things that must live on their machine. Report every landing zone: workspace vs PC path.",
    ].join("\n"),
  },
  {
    name: "data-analysis",
    description: "Analyze CSV-ish data in the workspace: preview, clean, summarize.",
    body: [
      "# Skill: data-analysis",
      "1. `preview_csv` first — confirm headers, delimiters and ragged rows before any math.",
      "2. Clean with `dedupe_lines`/`sort_lines`; count with `count_words`; compute with `calc` (exact, never estimated).",
      "3. State the grain (what one row means) and the filters applied, up front.",
      "4. Report: top findings as numbers with units, method in one line, caveats honestly.",
    ].join("\n"),
  },
];

export function getSkill(name: string): Skill | undefined {
  return SKILLS.find((s) => s.name === name.trim().toLowerCase());
}
