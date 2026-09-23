# Third-party notices

## ZCode (zai-org/ZCode) — Apache-2.0

Selected *ideas and interface patterns* in this project were informed by
studying the open-source ZCode harness (https://github.com/zai-org/ZCode),
which is licensed Apache-2.0, © Z.ai:

- the SKILL.md convention (named skill briefs with frontmatter-style
  `description` + trigger phrases) behind `src/lib/ducky/skills.ts`;
- the computer-use design discipline (capability detection, fail-closed
  behavior when helpers are missing, explicit consent gates) behind
  `bin/ducky.js` (`ducky bridge`) and `src/lib/ducky/pc.ts`;
- interface principles from its design system (calm dense operational UI,
  strict interface type scale, mobile-safe input sizing);
- the Zai Dark theme values and trajectory role colors adapted into our
  dark theme (`--background #161616`, role colors for user/assistant/
  reasoning/tool-call/tool-result) and the 14px interface type scale;
- the permission-dialog option pattern (numbered allow-once / always-allow /
  deny rows with keyboard shortcuts and deny-with-feedback) behind
  `src/components/ducky/approval-card.tsx`;
- the time-aware empty-state greeting boundaries (5/9/12/14/18/23h) behind
  `src/components/ducky/hero.tsx`;
- the skill playbooks adapted (not copied) into `src/lib/ducky/skills.ts`:
  `agent-browser` (open → snapshot → act → re-snapshot → verify loop),
  `ai-elements` (conversation/message/prompt-input/tool structure),
  `architecture-governance` (one-owner modules, layered deps),
  `dep-refs` (symbol reference tracing before deletes),
  `dogfood` (repro-first exploratory QA reports),
  `electron` (remote-debugging-port desktop automation);
- the computer-use contract shapes (broker error codes, read-only vs
  mutating route split, accessibility/screenRecording permission status)
  behind `src/lib/ducky/pc.ts` — our bridge protocol itself is original.

Two files are vendored VERBATIM from ZCode (only a notice header added),
each carrying its Apache-2.0 attribution inline:
- `src/lib/ducky/zcode-vendor/trajectory-role-styles.ts`
  (upstream `packages/ui/src/ModelTrajectoryRoleStyles.ts`) — role label
  classes consumed by the transcript (`message-item.tsx`, `tool-call-card.tsx`);
- `src/lib/ducky/zcode-vendor/trajectory-format.ts`
  (upstream `packages/ui/src/ModelTrajectoryFormat.ts`) — duration/clock
  formatters consumed by `tool-call-card.tsx`.

No other ZCode source files are vendored here; all other implementations
are original.
If you reuse Ducky code that derives from these ideas, keep this notice.
