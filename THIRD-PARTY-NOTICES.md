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
  reasoning/tool-call/tool-result) and the 14px interface type scale.

No ZCode source files are vendored here; all implementations are original.
If you reuse Ducky code that derives from these ideas, keep this notice.
