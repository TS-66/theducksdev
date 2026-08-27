# Ducky AI | Coder

A browser-native coding agent console. The everything-is-a-plugin harness experience — streaming agent, tool calling, virtual workspace, permission gates — running entirely in your browser, powered by a single model: **Ducky 3.5 Coder**.

![Ducky AI | Coder](public/ducky-logo.png)

## What is this?

Ducky AI | Coder is a zero-config, self-hostable coding agent web app:

- **One model: Ducky 3.5 Coder** — the only model you'll ever see. Which endpoint serves it is a pure deployment concern: `/api/chat` maps the public id to a server-side `AI_MODEL_ID` so the upstream name never reaches the client.
- **Streaming chat with tools** — the model calls tools across multiple iterations; results stream back as tool cards (per-tool icons, diff previews for edits, live output).
- **Virtual workspace** — a sandboxed filesystem stored in your browser (seeded with a sample repo). `read_file`, `write_file`, `edit_file`, `glob`, `grep` and a simulated `bash` (pipes, redirects, `&&` chains) all operate on it. Paste or import images, preview them, export everything as a valid `.zip`.
- **Everything is a plugin** — the plugin manager mirrors package-style ids (`@ducky-ai/ducky-tool-fs`, `ducky-tool-bash`, `ducky-tool-todo`, …). Toggling a plugin unloads its tools from the model's schema.
- **Permission gates** — `auto` / `ask` / `readonly` policies; side-effecting tools raise an inline approval card.
- **Plan mode** — read-only research phase ending in an `exit_plan_mode` approval.
- **Subagents** — the `subagent` tool spawns a focused child agent loop with a restricted toolset and returns its report.
- **Zero-config demo mode** — no key yet? A scripted engine drives *real* tool execution (reads, writes, diffs, todos, shell, plan approvals) and even *live* `web_search` / `web_fetch` / `vision_describe` (image understanding) — all server-side, no key needed.
- **Activity ledger** — a git-log-style timeline of every prompt, tool call and file change, with filters, copyable shas, workspace rewind (time-travel) and conversation trim.
- **Command palette & slash commands** — `⌘P` palette plus `/new`, `/clear`, `/plan`, `/model`, `/policy`, `/plugins`, `/activity`, `/export`, `/zip`, `/backup`, `/help`.

## Configuration

Everything lives in the browser's `localStorage` — no database, no server state. Add an **API key** in **Settings → Models** to unlock the full agent loop with Ducky 3.5 Coder — or configure the server once (below) and leave Settings empty.

### Environment variables (optional)

Copy `.env.example` to `.env.local` for local dev, or set them in your hosting dashboard:

| Variable | Required | Description |
| --- | --- | --- |
| `AI_BASE_URL` | See note | OpenAI-compatible chat-completions base URL. Required unless users supply their own Base URL in Settings. |
| `AI_API_KEY` | See note | Bearer key for the endpoint above. Required unless users paste their own key in Settings. |
| `AI_MODEL_ID` | No | Upstream model id that powers Ducky 3.5 Coder. Defaults to passing the public id through. |

> Note: at least one of (server env, user Settings) must provide the base URL and key, otherwise `/api/chat` returns an actionable 400.

### Deploying (e.g. Vercel)

The app is serverless-ready out of the box. Push the repo to Git, import it into your platform, and add `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL_ID` as (Production) environment variables — no database, no blob storage, no extra services. Stream function durations are already tuned via the route's `maxDuration`.

### Run anywhere

The backend is intentionally **stateless** (sessions/workspace/settings live in the browser; `/api/chat` is a streaming pass-through proxy), so it runs on any Node/Bun host or serverless platform:

```sh
bun install
bun run dev        # development
bun run build && bun run start   # production
```

## Architecture

```
Browser (client)                          Server (stateless)
┌────────────────────────────┐            ┌─────────────────────┐
│  zustand + localStorage    │            │  /api/chat          │
│   sessions · workspace ·   │  fetch()   │   SSE pass-through  │──▶ your OpenAI-compatible
│   settings · plugins       │───────────▶│  /api/web-search    │──▶ search backend
│  agent loop                │            │  /api/web-fetch     │    endpoint (env-configured)
│   (src/lib/ducky/          │            │  /api/vision        │
│    agent-loop.ts)          │            └─────────────────────┘
│  tool executors on vFS     │
└────────────────────────────┘
```

- `src/lib/ducky/types.ts` — canonical wire/UI contract.
- `src/lib/ducky/models.ts` — model registry (single public model: `ducky-3.5-coder`).
- `src/lib/ducky/plugins.ts` — plugin manifests + tool schemas.
- `src/lib/ducky/agent-loop.ts` — multi-iteration loop, SSE parsing, policy gate, subagent.
- `src/lib/ducky/demo-loop.ts` — zero-config scripted demo engine (real tool execution).
- `src/lib/ducky/tools-*.ts` — virtual FS, mini-bash, web tool fetchers.
- `src/hooks/use-ducky-agent.ts` — React ⇄ engine bridge (system prompt assembly, approvals).
- `src/app/api/chat/route.ts` — stateless streaming proxy + model-id mapping.

## Notes & limits

- The shell is a **safe simulation** over the virtual workspace — there is no real host execution (that's what keeps the app serverless-safe).
- Web tools degrade gracefully: when no backend is configured the model receives a structured error instead of crashing.
- Sessions, workspaces and settings never leave your browser except inside the proxied chat request.

## License

MIT.
