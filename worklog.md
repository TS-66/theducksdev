# DSH Web — Worklog

Project: DeepSeek Harness Web Edition (`dsh web` clone as a Next.js 16 app, Vercel-deployable).

## Reference research (done by coordinator)

Cloned https://github.com/deepseek-ai/deepseek-harness.git to /tmp/deepseek-harness.
Key findings:
- `dsh` is an agent harness, "everything is a plugin" (Cordis-powered), ships CLI + Web UI on port 3080.
- Model access via DeepSeek API key (Settings → Models), OpenAI-compatible endpoints. Models: deepseek-chat, deepseek-reasoner.
- Tool catalog (docs/tool-catalog.md): read/write/edit (tool-fs), glob/grep (fs-search, ripgrep), bash/pwsh, todo_write, subagent(+subagent_fork) & send_message/list_agents/interrupt_agent, job_*, ask_user_question, exit_plan_mode, skill, schedule_create/delete/list, session_event_read/search/trace/session_search/session_trace, web_search/web_fetch, lsp, terminal_* set, workflow, ralph, goals (create/get/update_goal).
- Agent loop: tools/pre-execute (allow/deny/ask approval gate) → guards → execute → post-execute → result event. Permission policy asks user before side-effecting ops.
- Sessions persist events; UI renders latest todo_write as checklist; plan mode with exit_plan_mode approval.

## Architecture decisions for this build

- **Vercel-first**: fully stateless backend. Sessions/workspace/settings live in browser localStorage via zustand persist. No DB.
- `/api/chat` = streaming SSE pass-through proxy to `${baseUrl}/chat/completions` (DeepSeek OpenAI-compatible). Client parses stream + runs agent loop (multi-iteration tool calling) client-side → serverless-safe.
- Virtual workspace FS stored per-session in localStorage; fs/shell tools operate on it. Bash tool = mini shell interpreter over vFS (ls/cat/echo>/mkdir/rm/grep/find/wc/head/tail/tree...).
- Plugin registry mirrors real package names; toggling plugin excludes its tools from request `tools` array.
- Auth: user-provided key in Settings (localStorage), optional env fallback DEEPSEEK_API_KEY on server.

## Canonical contract

`src/lib/dsh/types.ts` — authored by coordinator (Task 1). Engine & UI must import from it. Changes require coordinator approval.

---
Task ID: 1
Agent: coordinator
Task: Research upstream repo, define architecture + canonical types contract.

Work Log:
- Cloned/read deepseek-harness source: README, docs/user/guide, tool-catalog.md, packages layout
- Created src/lib/dsh/types.ts canonical contract (wire protocol, Session/ChatMessage/TodoItem/ApprovalRequest, PluginManifest/ToolDefinition, Settings/PermissionPolicy, AgentEvent/RunLoopOptions)
- Created dirs src/lib/dsh and src/components/dsh
- Initialized this worklog

Stage Summary:
- Ready to dispatch parallel subagents: 2-a engine+API, 2-b UI. Contract locked in types.ts.

---
Task ID: 3-c/d (integration + QA)
Agent: coordinator
Task: Integrate subagent outputs, fix type/lint errors, browser-verify end-to-end, ship Vercel config.

Work Log:
- Fixed TS2459: exported `SettingsTab` from settings-sheet.tsx (page.tsx imports it)
- Removed 2 unused eslint-disable directives (code-block.tsx, markdown-body.tsx) → lint 100% clean
- Verified engine↔UI contract alignment: store has clearSession/hydrated/replaceWorkspace; plugins exports TOOL_EXECUTOR_BUILDERS, ToolExecutionContext, resolveEnabledPluginIds; agent-loop RunLoopOptionsExt (messages/askUser/onPlanExit/planModeActive) as designed
- Fixed error-message duplication UX: hook no longer copies e.message into content when patching error status (Alert card renders it once)
- Browser QA via agent-browser: hero renders → "Start a new task" creates session + seeds vFS tree (src/tests/package.json/README.md/tsconfig.json visible) → file preview dialog w/ line numbers works → send message w/o key shows single graceful "Request failed" alert + API guidance → plugins sheet toggles (toast + status bar count 8/8→7/8→8/8) → settings Models/Behavior tabs render (key input, baseUrl, model cards, sliders, policy radios) → error fix verified on fresh send → mobile 390px layout OK (hamburger Sheet, compact header)
- Dev server: GET / 200; stale 500s in log were mid-iteration; current compile clean
- Vercel ship-out: vercel.json (framework + fn maxDurations), .env.example (DEEPSEEK_API_KEY), README.md (deploy button, env table, architecture diagram, notes)

Stage Summary:
- App fully functional: sessions, virtual workspace + tools, plugins registry, permission gates, plan mode, slash commands, status bar, sheets/dialogs, responsive mobile.
- Chat requires a DeepSeek API key (Settings) or server DEEPSEEK_API_KEY; /api/chat returns actionable 400 guidance without one (verified).
- tsc clean (project code), eslint 0/0, dev server 200s.

---
Task ID: R1 (cron review round 1)
Agent: coordinator
Task: QA stability, then zero-config demo mode + styling upgrades + output features.

Work Log:
- QA: page errors none, console clean, dev 200s → project stable, proceeded to features.
- FEATURE demo mode (zero-config): types.ts Settings gained `demoMode` + `isDemoMode()` helper (demo implied when apiKey empty). New src/lib/dsh/demo-loop.ts — scripted engine emitting the SAME AgentEvent protocol as the live loop but driving REAL executors: summarize flow (bash tree + read README/package.json → live stats table), LICENSE+deploy flow (writes real LICENSE & scripts/deploy.sh, verified via bash), test-review flow, shell playground (any ls/cat/tree/grep/wc/… command really executes), default capabilities intro. Text streams char-chunked for a live feel; aborts honored. Hook branches to demo before runAgentLoop; assistant meta.model = 'demo-script'.
- Fixed regex bug found in browser QA: "bash tree && wc …" fell to default route because pattern forbade space between `bash` and command → rewrote with [\s`'\"“”]* gap + expanded verb list (mkdir/touch/rm/mv/cp/date/uname/whoami).
- STYLING per-tool presentation (upstream tool-owned-UI spirit): new tool-meta.ts registry (icon+color per tool: read=sky file, write=emerald file-plus, edit=amber pen, bash=emerald terminal, glob/grep=violet, todo=teal, subagent=fuchsia, web=cyan, ask=orange). ToolCallCard now shows per-tool icon/tint/label chip + left accent border while running. New diff-view.tsx: edit_file cards render a real −/+ unified diff from old_str/new_str and auto-expand when done.
- FEATURES output: export-md.ts (session→Markdown transcript w/ details-collapsed tool calls, todos, workspace manifest; blob download), wired into sidebar dropdown ("Export .md") + /export slash command; sidebar session search (title+content filter w/ clear button + empty states); copy button on assistant messages (hover reveal, ✓ feedback).
- UI polish: amber DEMO chip in status bar (tooltip explains) + Settings→Models demo-mode toggle card (FlaskConical, amber tint).
- Browser QA all green: demo summarize (3 real tools, stats from real files), LICENSE flow (file tree live-updated to 9 files incl scripts/deploy.sh), bash route executes tree && wc, tool card expansion shows args+real output, /export toast, search filter + empty state. lint 0/0, tsc clean.

Stage Summary:
- App now works with ZERO configuration: no-key users get an honest scripted demo with real tool execution; adding a DeepSeek key seamlessly unlocks the full agent (no UI change needed).
- Tool cards are tool-specific with diff previews for edits — closest yet to upstream's tool-owned presentation.
- Known risk: demo regex routing is keyword-based (fine for golden paths); live agent path unchanged and still requires key or DEEPSEEK_API_KEY env.
- Next suggestions: ask_user_question/exit_plan_mode demo variants, token-usage tooltip breakdown, i18n zh, keyboard shortcut help dialog, workspace file upload/paste-create.
