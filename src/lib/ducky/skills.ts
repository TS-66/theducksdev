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
];

export function getSkill(name: string): Skill | undefined {
  return SKILLS.find((s) => s.name === name.trim().toLowerCase());
}
