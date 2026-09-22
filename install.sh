#!/usr/bin/env bash
#
# Ducky AI | Coder — one-line installer.
#
#   Interactive (clone/download first when the repo is private, then run):
#     export GITHUB_TOKEN=ghp_...
#     curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" \
#       https://raw.githubusercontent.com/TS-66/theducksdev/main/install.sh -o /tmp/opencode/ducky-install.sh
#     bash /tmp/opencode/ducky-install.sh
#
#   ONE command to copy (repo is private, so curl asks for a GitHub token at
#   a password prompt — paste a fine-grained PAT with "Contents: read"):
#     curl -fsSL -u ducky https://raw.githubusercontent.com/TS-66/theducksdev/main/install.sh | bash
#   Then answer two prompts: (1) GitHub token [asked by curl], (2) your free
#   NVIDIA key [asked by the installer — every user needs their OWN key from
#   build.nvidia.com, so no curl on earth can embed it].
#
#   Fully non-interactive (pipe-friendly — pass everything as flags):
#     export GITHUB_TOKEN=ghp_...
#     curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" \
#       https://raw.githubusercontent.com/TS-66/theducksdev/main/install.sh \
#       | bash -s -- --key nvapi-... --no-open
#
# What it does: fetches the app (private-repo aware) → installs deps →
# builds → links the global `ducky` command → runs `ducky setup` (+ `--web`).
#
set -euo pipefail

REPO="TS-66/theducksdev"
REF="main"
DEST="$HOME/ducky-ai-coder"
PORT="3000"
HOST="127.0.0.1"
OPEN_BROWSER=1
DO_RUN=1
DO_BUILD=1
DO_LINK=1
LOCAL_DIR=""
SETUP_KEY=""
SETUP_MODEL=""
DRY_RUN=0

say()  { printf '\033[33m[ducky-install]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[ducky-install]\033[0m \033[33mwarning:\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[31m[ducky-install:error]\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: install.sh [options]

  --ref <branch>     git ref to install (default: main)
  --dir <path>       where to put the app (default: ~/ducky-ai-coder)
  --local <path>     skip download — install from an existing checkout
  --port <n>         web UI port for the final `ducky --web` (default: 3000)
  --host <addr>      web UI host (default: 127.0.0.1 = this machine only)
  --no-open          don't auto-open the browser at the end
  --no-run           stop after install (don't run setup/web UI)
  --no-build         skip `next build` (run `ducky --web --dev` instead)
  --no-link          don't create the global `ducky` command
  --key <nvapi-...>  NVIDIA key for non-interactive `ducky setup`
  --model <id>       model id for non-interactive setup (default preset)
  --dry-run          print what would happen, change nothing
  -h, --help         this help

Env: GITHUB_TOKEN (or GH_TOKEN) — needed to download while the repo is private.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="${2:?}"; shift 2 ;;
    --dir) DEST="${2:?}"; shift 2 ;;
    --local) LOCAL_DIR="${2:?}"; shift 2 ;;
    --port) PORT="${2:?}"; shift 2 ;;
    --host) HOST="${2:?}"; shift 2 ;;
    --no-open) OPEN_BROWSER=0; shift ;;
    --no-run) DO_RUN=0; shift ;;
    --no-build) DO_BUILD=0; shift ;;
    --no-link) DO_LINK=0; shift ;;
    --key) SETUP_KEY="${2:?}"; shift 2 ;;
    --model) SETUP_MODEL="${2:?}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown flag: $1 (see --help)" ;;
  esac
done

TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"

need() { command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"; }
need curl
[ -n "$LOCAL_DIR" ] || need tar
command -v node >/dev/null 2>&1 || fail "node >= 20 is required (https://nodejs.org)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || fail "node >= 20 is required (found $(node -v))"

if command -v bun >/dev/null 2>&1; then PM="bun"; else PM="npm"; fi

run() {
  if [ "$DRY_RUN" = 1 ]; then
    printf '  $ %s\n' "$*"
  else
    "$@"
  fi
}

say "Ducky AI | Coder installer (ref=$REF, manager=$PM)"

# ── 1. source ──────────────────────────────────────────────────────────────
if [ -n "$LOCAL_DIR" ]; then
  [ -d "$LOCAL_DIR" ] || fail "--local dir not found: $LOCAL_DIR"
  [ -f "$LOCAL_DIR/package.json" ] || fail "--local dir has no package.json: $LOCAL_DIR"
  say "using local checkout: $LOCAL_DIR"
  DEST="$LOCAL_DIR"
else
  if [ -e "$DEST" ] && [ "$DRY_RUN" = 0 ]; then
    fail "$DEST already exists — pass --dir <fresh-path> or --local <checkout>"
  fi
  [ -n "$TOKEN" ] || fail "repo is private: export GITHUB_TOKEN=ghp_... first"
  say "downloading $REPO@$REF → $DEST"
  if [ "$DRY_RUN" = 1 ]; then
    run curl -fsSL -H "'Authorization: Bearer \$GITHUB_TOKEN'" \
      "https://api.github.com/repos/$REPO/tarball/$REF"
  else
    mkdir -p "$DEST"
    curl -fsSL -H "Authorization: Bearer $TOKEN" \
      "https://api.github.com/repos/$REPO/tarball/$REF" \
      | tar -xz -C "$DEST" --strip-components=1
  fi
fi

# ── 2. install + build ─────────────────────────────────────────────────────
say "installing dependencies ($PM install)"
if [ "$PM" = bun ]; then run bun install --cwd "$DEST"; else run npm install --prefix "$DEST" --no-audit --no-fund; fi

if [ "$DO_BUILD" = 1 ]; then
  say "building production bundle"
  if [ "$PM" = bun ]; then run bun --cwd "$DEST" run build; else run npm --prefix "$DEST" run build; fi
fi

# ── 3. global command ──────────────────────────────────────────────────────
if [ "$DO_LINK" = 1 ]; then
  say "linking global \`ducky\` command"
  LINK_OK=1
  if [ "$DRY_RUN" = 1 ]; then
    if [ "$PM" = bun ]; then run bun link --cwd "$DEST"; else (run cd "$DEST" && run npm link); fi
  else
    # System-wide link first (needs write access to the global prefix)…
    if [ "$PM" = bun ]; then
      bun link --cwd "$DEST" >/dev/null 2>&1 || LINK_OK=0
    else
      (cd "$DEST" && npm link >/dev/null 2>&1) || LINK_OK=0
    fi
    # …otherwise a user-local shim (no sudo ever needed).
    if [ "$LINK_OK" = 0 ]; then
      warn "system link needs permissions — installing user-local shim instead"
      mkdir -p "$HOME/.local/bin"
      ln -sf "$DEST/bin/ducky.js" "$HOME/.local/bin/ducky"
      chmod +x "$DEST/bin/ducky.js"
      case ":$PATH:" in
        *":$HOME/.local/bin:"*) ;;
        *)
          warn "~/.local/bin is not on PATH — add this line to ~/.bashrc:"
          warn '  export PATH="$HOME/.local/bin:$PATH"'
          ;;
      esac
      export PATH="$HOME/.local/bin:$PATH"
    fi
    command -v ducky >/dev/null 2>&1 || fail "link failed and no shim worked"
    say "global command ready: $(command -v ducky) (v$(ducky --version))"
  fi
fi

# ── 4. run ─────────────────────────────────────────────────────────────────
if [ "$DO_RUN" = 0 ]; then
  say "done (--no-run). Next: ducky setup && ducky --web"
  exit 0
fi

if [ ! -t 0 ] && [ -z "$SETUP_KEY" ]; then
  # Piped (curl | bash): stdin is the script, so ask on the real terminal.
  if [ -r /dev/tty ] && [ -w /dev/tty ]; then
    printf '  NVIDIA API key (nvapi-..., hidden — Enter to skip setup): ' > /dev/tty
    if read -rs TTY_KEY < /dev/tty; then
      printf '\n' > /dev/tty
      SETUP_KEY="$TTY_KEY"
    fi
  fi
fi
if [ -z "$SETUP_KEY" ] && [ ! -t 0 ]; then
  warn "no key given — skipping interactive setup."
  warn "re-run: ducky setup   (or reinstall with --key nvapi-...)"
else
  say "running setup (key stays on this machine)"
  if [ -n "$SETUP_KEY" ]; then
    if [ -n "$SETUP_MODEL" ]; then
      run node "$DEST/bin/ducky.js" setup --provider nvidia --key "$SETUP_KEY" --model "$SETUP_MODEL"
    else
      run node "$DEST/bin/ducky.js" setup --provider nvidia --key "$SETUP_KEY"
    fi
  else
    run node "$DEST/bin/ducky.js" setup --provider nvidia
  fi
fi

OPEN_FLAG=""; [ "$OPEN_BROWSER" = 1 ] || OPEN_FLAG="--no-open"
say "starting web UI on $HOST:$PORT"
# shellcheck disable=SC2086
run node "$DEST/bin/ducky.js" --web --port "$PORT" --host "$HOST" $OPEN_FLAG
