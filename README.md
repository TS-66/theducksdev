# Ducky Coder

<div align="center">
  <img src="public/ducky-logo.png" alt="Ducky Coder" width="128" height="128" />
</div>
<p align="center">
  <a href="https://github.com/TS-66/theducksdev">GitHub</a>
</p>

Ducky Coder is an AI coding workspace with desktop, browser, and terminal interfaces. This repository contains the clients, backend services, shared UI, and Agent CLI and runtime source code.

**No sign-in required.** Ducky Coder runs in guest mode: there is no account, no OAuth, no login screen. Configure model providers with your own API keys (see Tutorial 4).

## Updates

- 2026-9-24: Rebranded to Ducky Coder, sign-in removed (guest mode), `ducky web` launcher added.

## Tutorials

### Tutorial 0 — Install with curl (no account, no token)

```bash
curl -fsSL https://raw.githubusercontent.com/TS-66/theducksdev/main/install.sh | bash
```

This downloads the latest public release, verifies its checksum, and installs the `ducky` command to `~/.local/bin` (ensure it is on `PATH`). Pin a version or a custom repo:

```bash
DUCKY_VERSION=3.14.3 curl -fsSL https://raw.githubusercontent.com/TS-66/theducksdev/main/install.sh | bash
```

Then run `ducky` (terminal UI) or `ducky --web` (browser UI). You need Node.js **24.14.0+** on your machine; everything else ships in the release tarball. To publish a release, push a version tag (see Packaging → Release below) — CI builds the tarball and attaches it to the GitHub Release, which is what the installer downloads.

> **Small machine (2–4 GB RAM)?** Skip the production bundle entirely: `./bin/ducky web --dev` runs vite + the backend with hot reload and opens `http://localhost:5173`. It uses a fraction of the RAM that `vite build` needs (the "modules transformed" stall / `Killed` exit 137 comes from the 7000-module production bundle, which `--dev` never runs).

### Tutorial 1 — Open the Web UI from source (fastest start for contributors)

Requirements: Git, Node.js **24.14.0**, pnpm **10.33.2** ([mise.toml](mise.toml) is the source of truth).

```bash
git clone https://github.com/TS-66/theducksdev "ducky coder"
cd "ducky coder"
pnpm install
./bin/ducky web --build
```

The first run builds the Web client and backend, serves the production build on `http://localhost:3030`, and opens your browser. Later runs reuse the build:

```bash
./bin/ducky web
./bin/ducky web --port 3030 --workspace /path/to/project
./bin/ducky web --no-open --skip-build
```

Put `ducky` on your PATH once, then use it anywhere:

```bash
./bin/ducky install   # symlinks ~/.local/bin/ducky (ensure it is on PATH)
ducky web
```

Press `Ctrl+C` to stop the server. See [DUCKY-CODER.md](DUCKY-CODER.md) for launcher details.

### Tutorial 2 — Desktop development

```bash
pnpm bootstrap
pnpm dev:desktop

# Use the test environment
pnpm dev:desktop:test
```

`pnpm dev:desktop` defaults to `pnpm dev:desktop:prod`. The startup script prepares local runtime assets, builds the desktop Agent, then starts Electron and source watchers.

Use a separate development data directory with `DUCKY_DATA_BASE_DIR` (macOS / Linux):

```bash
DUCKY_DATA_BASE_DIR="$HOME/.ducky-dev-home" pnpm dev:desktop:test
```

### Tutorial 3 — Web + backend development

Use development mode when editing Web or backend source code:

```bash
pnpm dev:web

# Set the backend workspace (macOS / Linux)
DUCKY_SERVER_WORKSPACE=/path/to/project pnpm dev:web
```

This starts the Web dev server (`http://localhost:5173`) and the backend (`http://localhost:3030`). `/ws` and `/api` requests are proxied to the local backend. After changing Agent source code, run `pnpm --filter @ducky/cli... build` and restart the service.

### Tutorial 4 — Connect a model provider (no login)

1. Open Settings (gear icon, bottom-left) → Providers.
2. Add a provider with your API key (e.g. OpenAI-compatible endpoint + key, or Anthropic).
3. Select it as the active model and start chatting.

All provider credentials stay in your local credential store (`~/.zcode/`). There is no cloud account to sync them to. Features that inherently need an account (private share import, marketplace publishing, plan/usage badges) are unavailable in guest mode; public conversation shares still open.

### Tutorial 5 — Remote workspaces (SSH / WSL)

```bash
pnpm bootstrap:with-remote
pnpm dev:desktop
```

Prepare remote assets first (`mock-cdn`), then connect a remote project from the UI and choose "download locally, then upload". Dev resources come from local `packages/desktop/mock-cdn` and local build output over SFTP — no CDN access.

### Tutorial 6 — CLI distribution

The command-line distribution bundles the TUI, Web client, and Agent behind one `ducky` command. With no arguments it starts the TUI; a leading `--web` starts Web mode; all other arguments go to the Agent CLI. Both modes run locally without Electron.

```bash
ducky                 # terminal UI
ducky --web           # Web interface (current dir = workspace, browser opens)
ducky --web --workspace /path/to/project --port 3030 --no-open
ducky --help
ducky --web --help
```

In Web mode it listens on `127.0.0.1` without token authentication by default and picks a free port. For LAN access use `--host 0.0.0.0` (a token is then generated; open the token URL from the terminal, override with `--token`, or disable with `--no-token`). When starting the HTTP entry directly, set `DUCKY_SERVER_AUTH_TOKEN`. `pnpm build:ducky` only creates the distribution; it never replaces an existing `ducky` on `PATH` (check with `command -v ducky` / `where.exe ducky`).

Develop the TUI/Agent from source:

```bash
pnpm --filter @ducky/cli dev --help
pnpm --filter @ducky/cli dev
pnpm --filter @ducky/cli... build
node apps/ducky-cli/packages/cli/dist/zcode.cjs --help
```

## Setup reference

```bash
pnpm bootstrap   # install deps + prepare desktop runtime assets + build:bootstrap
```

| Command                        | Purpose                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                 | Install dependencies (also regenerates `pnpm-lock.yaml` after the rebrand)                                     |
| `pnpm prepare:desktop-runtime` | Prepare desktop runtime assets, including remote assets by default                                             |
| `pnpm prepare:remote-assets`   | Prepare remote runtime assets separately                                                                       |
| `pnpm bootstrap:with-remote`   | Deps + local and remote assets, then sequential build; skips the desktop application bundle                    |
| `pnpm build`                   | Recursively run each workspace package's build script, including asset preparation                             |

The Agent CLI and runtime source lives in [apps/ducky-cli/](apps/ducky-cli/) as a regular directory — no submodule setup needed.

## Configuration

Root [.env.example](.env.example) holds sample service URLs and build settings. Copy to `.env`, put local overrides in `.env.local`. Old `ZCODE_*` variable names are not read anymore — rename them to `DUCKY_*`.

| Setting                              | Purpose                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `DUCKY_DATA_BASE_DIR`                | Base directory for application data (stored under its `.zcode/` subdir)  |
| `DUCKY_SERVER_WORKSPACE`             | Workspace path for the Web backend                                       |
| `DUCKY_BUILTIN_PROVIDER_CONFIG_FILE` | Local provider config file path; built-in configuration when unset       |
| `DUCKY_DIST_BASE_URL`                | Download base URL used by the CLI distribution installer                 |

See [config/README.md](config/README.md) for the default client configuration.

## Packaging

See [third-party/README.md](third-party/README.md) for notice generation and distribution checks.

### Desktop

```bash
pnpm bundle:desktop
pnpm bundle:desktop -- --os win --arch x64
pnpm bundle:desktop -- --help
```

Default target is macOS arm64, output `packages/desktop/dist/`. `--os`: `mac` / `win` / `linux`; `--arch`: `x64` / `arm64`. Install the DMG by dragging Ducky Coder into Applications. For unsigned local builds blocked by macOS on first open:

```bash
sudo xattr -rd com.apple.quarantine "/Applications/Ducky Coder.app"
```

### Ducky CLI distribution

```bash
pnpm build:ducky --base-url https://downloads.example.com/ducky/
pnpm build:ducky                # when DUCKY_DIST_BASE_URL is configured
pnpm build:ducky --skip-build   # repackage existing build outputs
pnpm build:ducky --help
```

Version defaults to root `package.json`. Output goes to `dist/ducky/` (`releases/<version>/ducky-<version>.tar.gz`, `sha256.txt`, `latest.json`, `install.sh`). Upload the directory to the download base URL; the installer puts the runtime under `~/.zcode/runtime` and the `ducky` command in `~/.local/bin` (override with `DUCKY_DIST_HOME` / `DUCKY_DIST_BIN_DIR`).

Test a packaged build locally without uploading:

```bash
ducky_version=$(node -p "require('./dist/ducky/latest.json').version")
mkdir -p dist/ducky/debug
tar -xzf "dist/ducky/releases/$ducky_version/ducky-$ducky_version.tar.gz" \
  -C dist/ducky/debug
node dist/ducky/debug/ducky/bin/ducky.mjs                       # TUI
node dist/ducky/debug/ducky/bin/ducky.mjs --web \
  --workspace "$PWD" --port 3030 --no-open                      # Web
```

Open `http://127.0.0.1:3030` to validate the full flow (pick another `--port` if `pnpm dev:web` is running).

### Release (publish a version for the curl installer)

```bash
git tag v3.14.3
git push origin v3.14.3
```

The `release-ducky` workflow (`.github/workflows/release-ducky.yml`) builds the distribution and attaches `ducky-<version>.tar.gz` + `sha256.txt` to the GitHub Release. The root `install.sh` downloads from there — fully public, no token. Make sure CI is green on `main` before tagging.

## Troubleshooting

- **`ducky: command not found`** — run `./bin/ducky install`, then ensure `~/.local/bin` is on `PATH` (`export PATH="$HOME/.local/bin:$PATH"`), open a new shell, and retry.
- **Web build gets `Killed` / exit 137, or stalls at "modules transformed"** — the machine ran out of RAM while bundling (7000+ modules) and started thrashing (that lag is your whole PC slowing down). Fastest fix: don't bundle at all — `./bin/ducky web --dev` serves from source with hot reload on `http://localhost:5173`. If you need the production bundle: `ducky web --build` already sizes the Node heap to ~75% of total RAM and auto-enables low-memory mode under 4.5 GB (override with `NODE_OPTIONS=--max-old-space-size=4096` / `DUCKY_LOW_MEM=1`). Still dies: close other apps, add swap (e.g. `sudo fallocate -l 4G /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`), or build on a bigger machine and copy `packages/web/dist` + `packages/server/dist` over, then run `./bin/ducky web --skip-build`. Easiest of all: install a published release instead of building (`curl -fsSL .../install.sh | bash`, Tutorial 0).
- **`ducky install` reports `EEXIST`** — fixed; pull latest and rerun. A stale/broken `~/.local/bin/ducky` is now replaced automatically.
- **Engine warning (`wanted node 24.14.0, current v24.21.0`)** — harmless; any Node 24 works.
- **Port in use** — pass another one: `./bin/ducky web --port 3040`.

## Repository Structure

| Directory                                            | Responsibility                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `packages/desktop`                                   | Electron Main, Host, Renderer, and desktop packaging                     |
| `packages/web`                                       | Web client                                                               |
| `packages/server`                                    | HTTP / WebSocket services and remote connections                         |
| `packages/ducky-server-cli`                          | Standalone server startup and process management                         |
| `packages/ui`                                        | Shared React components, hooks, and Zustand state                        |
| `packages/services`                                  | Business services and persistence                                        |
| `packages/shared`, `packages/rpc`, `packages/client` | Shared protocols and types, RPC framework, and Agent client SDK          |
| `packages/provider`, `packages/provider-node`        | Common provider capabilities and Node implementations                    |
| `apps/ducky-cli`                                     | Agent CLI, TUI, runtime, and tools                                       |
| `scripts`, `config`, `third-party`                   | Build and maintenance scripts, built-in configuration, notice materials  |
| `bin/ducky`, `scripts/ducky.mjs`                     | Ducky Coder launcher (`ducky web`)                                       |

## Project Notice

See [NOTICE.md](NOTICE.md) for feature scope, maintenance policy, execution and data risks, licensing, and third-party copyright information.
