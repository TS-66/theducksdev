# dsh web — DeepSeek Harness Web Edition

A browser-native recreation of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) — the everything-is-a-plugin agent harness — built as a single Next.js 16 app that deploys to **Vercel** in one click.

![dsh web](public/logo.svg)

## What is this?

`dsh` upstream is a CLI + Web-UI agent harness powered by [Cordis](https://github.com/cordiverse/cordis). This project recreates the core experience as a pure web app:

- **Streaming chat** with `deepseek-chat` (V3) and `deepseek-reasoner` (R1) — reasoning traces render as a collapsible *Thinking…* card.
- **Agent loop with tools** — the model can call tools across multiple iterations; results stream back as tool cards exactly like the harness console.
- **Virtual workspace** — a sandboxed filesystem stored in your browser (seeded with a sample repo). `read_file`, `write_file`, `edit_file`, `glob`, `grep` and a simulated `bash` (with pipes, redirects, `&&` chains) all operate on it.
- **Everything is a plugin** — the plugin manager mirrors upstream package names (`@deepseek-ai/dsh-tool-fs`, `dsh-tool-bash`, `dsh-tool-todo`, …). Toggling a plugin unloads its tools from the model's schema.
- **Permission gates** — `auto` / `ask` / `readonly` policies; side-effecting tools raise an inline approval card, replicating the harness `tools/pre-execute` allow/deny/ask seam.
- **Plan mode** — read-only research phase ending in an `exit_plan_mode` approval, like upstream.
- **Subagents** — the `subagent` tool spawns a focused child agent loop with a restricted toolset and returns its report.
- **Slash commands** — `/new`, `/clear`, `/plan`, `/model`, `/policy`, `/plugins`.

## Deploy to Vercel

The backend is intentionally **stateless** (sessions/workspace/settings live in the browser's `localStorage`; `/api/chat` is a streaming pass-through proxy), so it runs on Vercel's serverless runtime with zero configuration.

1. Push this repo to GitHub.
2. Click the button (or import manually at [vercel.com/new](https://vercel.com/new)):

   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdeepseek-ai%2Fdeepseek-harness&env=DEEPSEEK_API_KEY&project-name=dsh-web)

3. *(Optional)* Set `DEEPSEEK_API_KEY` in the Vercel project env vars to serve a server-side fallback key. If unset, every visitor pastes their own key in **Settings → Models** — it never leaves their browser except inside the proxied request.

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | No | Server-side fallback key. Users' own keys (entered in Settings) take precedence. |

### Run locally

```sh
bun install
bun run dev        # http://localhost:3000
```

## Architecture

```
Browser (client)                          Vercel (serverless)
┌────────────────────────────┐            ┌─────────────────────┐
│  zustand + localStorage    │            │  /api/chat          │
│   sessions · workspace ·   │  fetch()   │   SSE pass-through  │──▶ api.deepseek.com
│   settings · plugins       │───────────▶│  /api/web-search    │──▶ search backend
│  agent loop (this file:    │            │  /api/web-fetch     │
│   src/lib/dsh/agent-loop)  │            └─────────────────────┘
│  tool executors on vFS     │
└────────────────────────────┘
```

- `src/lib/dsh/types.ts` — canonical wire/UI contract.
- `src/lib/dsh/plugins.ts` — plugin manifests + tool schemas (upstream naming).
- `src/lib/dsh/agent-loop.ts` — multi-iteration loop, SSE parsing, policy gate, subagent.
- `src/lib/dsh/tools-*.ts` — virtual FS, mini-bash, web tool fetchers.
- `src/hooks/use-dsh-agent.ts` — React ⇄ engine bridge (system prompt assembly, approvals).
- `src/app/api/chat/route.ts` — stateless streaming proxy (Vercel-safe `fetch` only).

## Notes & limits

- The shell is a **safe simulation** over the virtual workspace — there is no real host execution (that's what keeps this deployable to serverless).
- Web tools degrade gracefully: when no search backend is configured the model receives a structured error instead of crashing.
- This is an independent homage, not affiliated with DeepSeek. Read the upstream docs at [github.com/deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness).

## License

MIT — see upstream for third-party notices.
