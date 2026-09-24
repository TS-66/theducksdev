#!/usr/bin/env sh
# Ducky Coder installer — no account, no token.
# Downloads the public GitHub release tarball, verifies its checksum,
# and installs the `ducky` command.
#
#   curl -fsSL https://raw.githubusercontent.com/TS-66/theducksdev/main/install.sh | bash
#
# Options (environment):
#   DUCKY_VERSION   release version, e.g. 3.14.3 (default: latest release)
#   DUCKY_REPO      GitHub repo (default: TS-66/theducksdev)
#   DUCKY_DIST_HOME install root (default: $HOME/.zcode/runtime)
#   DUCKY_DIST_BIN_DIR  command dir (default: $HOME/.local/bin)
set -eu

REPO="${DUCKY_REPO:-TS-66/theducksdev}"
VERSION_INPUT="${DUCKY_VERSION:-}"
INSTALL_DIR="${DUCKY_DIST_HOME:-$HOME/.zcode/runtime}"
BIN_DIR="${DUCKY_DIST_BIN_DIR:-$HOME/.local/bin}"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ducky install requires $1" >&2
    exit 1
  fi
}

need_cmd curl
need_cmd tar
need_cmd node
need_cmd mktemp

# Public repo: the releases API needs no token.
if [ -z "$VERSION_INPUT" ]; then
  TAG="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).tag_name||'')}catch(e){}})" 2>/dev/null || true)"
  if [ -z "$TAG" ]; then
    echo "Could not determine the latest Ducky Coder release." >&2
    exit 1
  fi
else
  case "$VERSION_INPUT" in
    v*) TAG="$VERSION_INPUT" ;;
    *) TAG="v$VERSION_INPUT" ;;
  esac
fi

# Asset names use the bare version: tag v3.14.3 -> ducky-3.14.3.tar.gz
VERSION="$(printf '%s' "$TAG" | sed 's/^v//')"
BASE_URL="https://github.com/$REPO/releases/download/$TAG"
TARBALL="ducky-$VERSION.tar.gz"

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "Downloading Ducky Coder $VERSION ..."
curl -fL "$BASE_URL/$TARBALL" -o "$TMP_DIR/$TARBALL"
curl -fL "$BASE_URL/sha256.txt" -o "$TMP_DIR/sha256.txt"

echo "Verifying checksum ..."
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$TMP_DIR" && sha256sum -c sha256.txt)
elif command -v shasum >/dev/null 2>&1; then
  (cd "$TMP_DIR" && shasum -a 256 -c sha256.txt)
else
  echo "No sha256sum/shasum found; skipping checksum verification." >&2
fi

mkdir -p "$INSTALL_DIR/releases" "$BIN_DIR"
TARGET="$INSTALL_DIR/releases/$VERSION"
rm -rf "$TARGET.new"
mkdir -p "$TARGET.new"
tar -xzf "$TMP_DIR/$TARBALL" -C "$TARGET.new"
rm -rf "$TARGET"
mv "$TARGET.new/ducky" "$TARGET"
rm -rf "$TARGET.new"
ln -sfn "$TARGET" "$INSTALL_DIR/current"

cat > "$BIN_DIR/ducky" <<SH
#!/usr/bin/env sh
exec node "$INSTALL_DIR/current/bin/ducky.mjs" "\$@"
SH
chmod +x "$BIN_DIR/ducky"

echo "Ducky Coder $VERSION installed."
echo "Run: ducky (TUI) or ducky --web (Web UI)"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "Note: $BIN_DIR is not in PATH. Add it, e.g.: export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
esac
