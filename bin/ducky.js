#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * ducky --web
 * Local launcher for Ducky AI | Coder (zcode-style web UI).
 *
 *   ducky --web [--port 3000] [--host localhost] [--dev] [--no-open] [--no-build]
 *   ducky --help
 *   ducky --version
 *
 * Zero extra deps: Node builtins only.
 * Resolves the app dir from this file location, ensures a production
 * build exists (or builds once), starts `next start`, waits for ready,
 * then opens the system browser.
 */

const { spawn, spawnSync, execSync } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");
const os = require("os");

// Package root = parent of bin/
const APP_DIR = path.resolve(__dirname, "..");
const PKG_PATH = path.join(APP_DIR, "package.json");

function readPkg() {
  try {
    return JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
  } catch {
    return { name: "ducky-ai-coder", version: "0.0.0" };
  }
}
const PKG = readPkg();

const ARGS = process.argv.slice(2);

function has(flag) {
  return ARGS.includes(flag);
}

function valueOf(flag, fallback) {
  const i = ARGS.indexOf(flag);
  if (i !== -1 && ARGS[i + 1] && !ARGS[i + 1].startsWith("--")) return ARGS[i + 1];
  // support --port=3000 form
  const pref = ARGS.find((a) => a.startsWith(flag + "="));
  if (pref) return pref.split("=").slice(1).join("=");
  return fallback;
}

function printHelp() {
  console.log(`
  \x1b[33m▲ ducky\x1b[0m — Ducky AI | Coder web launcher (v${PKG.version})

  Usage:
    ducky --web [options]       start the coder web UI and open a browser
    ducky setup [options]       connect YOUR model endpoint (key stays on this server)
    ducky update                pull latest release + reinstall + rebuild
    ducky bridge [options]      connect THIS PC (real shell + files, loopback + token)
    ducky --help                show this help
    ducky --version             print version

  Setup (connect YOUR model — any OpenAI-compatible endpoint):
    ducky setup                     guided: base URL + API key + model id,
                                live-tested against the endpoint before saving.
                                Key goes to your OS keychain first (macOS Keychain /
                                Linux Secret Service — nothing on disk, nothing in git);
                                locked .env.local file only as fallback.
                                (Server fallback only — every user can also add
                                their OWN key in Settings → Connections.)
    ducky setup --base-url https://... --key ... [--model ...]
                                non-interactive variant (CI / SSH).
    ducky setup --check         verify server key WITHOUT printing it (masked output only).
                                Add --file <path> to use a different env file (default: .env.local).

  Web options:
    --web                       start web UI (default when no command given)
    -p, --port <n>              port to listen on (default: 3000, auto-bumps if busy)
    --host <addr>               host to bind (default: 127.0.0.1 = this machine only)
    --dev                       run Next dev server instead of production build
    --no-open                   don't auto-open the browser, just print the URL
    --no-build                  skip auto ` + "`next build`" + ` even if .next is missing
    -h, --help                  help
    -v, --version               version

  Install (global):
    npm i -g ./theducksdev        # or: npm i -g ducky-ai-coder
    ducky setup                   # connect your model endpoint once
    ducky --web

  Local (no install):
    npm install && npm run build
    node ./bin/ducky.js setup
    node ./bin/ducky.js --web

  Database-backed secrets (your own DB writes the file, live rotation, no restart):
    DUCKY_SECRETS_FILE=/run/ducky/secrets.json ducky --web
    file: {"apiKey":"...","model":"...","baseUrl":"https://..."}

  This PC (real shell + files for the UI terminal and pc_* tools):
    ducky bridge --port 3791 --root ~/projects
                                binds 127.0.0.1 only, prints a one-time token —
                                paste it into Settings → Connections → This PC.
                                Ctrl+C disconnects instantly. Nothing above
                                --root is ever reachable.
    ducky bridge --input        ALSO unlock real mouse/keyboard/screen control
                                (screenshot is read-only and always on when the
                                OS allows it; input stays locked otherwise).

  How the key stays hidden:
    • key lives ONLY in server memory/env: OS keychain → shell env → locked file
    • never in code, git, browser, devtools, or chat — /api/config returns booleans only
    • --web binds localhost (this machine): a LOCAL popup, not a website.
      Never use --host 0.0.0.0 unless you accept LAN users spending your key.
`);
}

function maskKey(k) {
  const s = String(k || "");
  if (!s) return "(not set)";
  if (s.length <= 8) return "•••• (len " + s.length + ", set)";
  return s.slice(0, 6) + "-…•••• (len " + s.length + ", set)";
}

function parseEnvFile(p) {
  const out = { lines: [], map: new Map() };
  let raw = "";
  try {
    raw = fs.readFileSync(p, "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out.map.set(m[1], m[2]);
    out.lines.push(line);
  }
  return out;
}

function writeEnvFile(p, entries) {
  const parsed = parseEnvFile(p);
  const seen = new Set();
  const next = parsed.lines.map((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && Object.prototype.hasOwnProperty.call(entries, m[1])) {
      seen.add(m[1]);
      return `${m[1]}=${entries[m[1]]}`;
    }
    return line;
  });
  for (const [k, v] of Object.entries(entries)) {
    if (!seen.has(k)) {
      if (next.length && next[next.length - 1].trim() !== "") next.push("");
      next.push(`${k}=${v}`);
    }
  }
  fs.writeFileSync(p, next.join("\n").replace(/\n+$/, "\n"), { mode: 0o600 });
  try {
    fs.chmodSync(p, 0o600);
  } catch { /* windows */ }
}

function promptText(q) {
  const rl = require("readline").createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(q, (a) => {
    rl.close();
    resolve(a.trim());
  }));
}

/* ── OS-keychain vault (new hidden-key system) ──────────────────────────
 * Priority: shell env → OS keychain → .env.local file.
 * The keychain (macOS Keychain / Linux Secret Service) keeps the secret out
 * of ALL files: nothing in git, nothing on disk in plaintext, nothing in the
 * browser. Non-secret settings (provider/model) stay in .env.local.
 * Windows has no dependency-free readable credential store → locked file. */

const KEYCHAIN_SERVICE = "ducky-ai-coder";
const KEYCHAIN_ACCOUNT = "provider-api-key";
const KEYCHAIN_ACCOUNT_LEGACY = "nvidia-api-key"; // read-only fallback, migrated on next setup

function keychainBackend() {
  if (process.platform === "darwin") {
    const r = spawnSync("security", ["-h"], { stdio: "ignore" });
    if (r.error) return null;
    return "macos";
  }
  if (process.platform === "linux") {
    const r = spawnSync("secret-tool", ["--help"], { stdio: "ignore" });
    if (r.error) return null;
    return "linux";
  }
  return null;
}

function keychainSet(secret) {
  const be = keychainBackend();
  if (!be) return { ok: false, reason: "no OS keychain tool (macOS Keychain / secret-tool) found" };
  try {
    if (be === "macos") {
      const r = spawnSync("security", ["add-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w", secret, "-U"], { stdio: "ignore" });
      if (r.status !== 0) return { ok: false, reason: "`security add-generic-password` failed" };
      return { ok: true, where: "macOS Keychain" };
    }
    const r = spawnSync("secret-tool", ["store", "--label=Ducky AI Coder (provider API key)", "service", KEYCHAIN_SERVICE, "account", KEYCHAIN_ACCOUNT], { input: secret, stdio: ["pipe", "ignore", "ignore"] });
    if (r.status !== 0) return { ok: false, reason: "`secret-tool store` failed (is a Secret Service daemon running?)" };
    return { ok: true, where: "Linux Secret Service" };
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e) };
  }
}

function keychainGetOne(account) {
  const be = keychainBackend();
  if (!be) return { key: "", where: "" };
  try {
    if (be === "macos") {
      const r = spawnSync("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      if (r.status !== 0) return { key: "", where: "" };
      return { key: String(r.stdout || "").replace(/[\r\n]+$/, "").trim(), where: "macOS Keychain" };
    }
    const r = spawnSync("secret-tool", ["lookup", "service", KEYCHAIN_SERVICE, "account", account], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    if (r.status !== 0) return { key: "", where: "" };
    return { key: String(r.stdout || "").replace(/[\r\n]+$/, "").trim(), where: "Linux Secret Service" };
  } catch {
    return { key: "", where: "" };
  }
}

function keychainGet() {
  const cur = keychainGetOne(KEYCHAIN_ACCOUNT);
  if (cur.key) return cur;
  return keychainGetOne(KEYCHAIN_ACCOUNT_LEGACY);
}

/** Remove a plaintext key line from the env file (used after keychain save). */
function scrubKeyFromEnvFile(p) {
  let raw = "";
  try {
    raw = fs.readFileSync(p, "utf8");
  } catch {
    return false;
  }
  const kept = raw.split("\n").filter((line) => !/^\s*AI_API_KEY\s*=/.test(line));
  if (kept.length === raw.split("\n").length) return false;
  fs.writeFileSync(p, kept.join("\n").replace(/\n+$/, "\n"), { mode: 0o600 });
  try {
    fs.chmodSync(p, 0o600);
  } catch { /* windows */ }
  return true;
}

function promptHidden(q) {
  // POSIX: disable echo via stty; fallback to visible prompt on Windows/odd ttys.
  if (process.platform !== "win32" && process.stdin.isTTY) {
    process.stdout.write(q);
    let raw = "";
    try {
      const { spawnSync } = require("child_process");
      spawnSync("stty", ["-echo"], { stdio: ["inherit", "ignore", "ignore"] });
      const buf = Buffer.alloc(4096);
      let n = 0;
      try {
        n = fs.readSync(process.stdin.fd, buf, 0, 4096, null);
      } catch { n = 0; }
      raw = buf.slice(0, Math.max(0, n)).toString("utf8").replace(/[\r\n]+$/, "");
    } finally {
      try {
        const { spawnSync } = require("child_process");
        spawnSync("stty", ["echo"], { stdio: ["inherit", "ignore", "ignore"] });
      } catch { /* noop */ }
      process.stdout.write("\n");
    }
    return Promise.resolve(raw.trim());
  }
  return promptText(q);
}

/** Live-test a base URL + key against the provider's /models endpoint. */
function probeEndpoint(baseUrl, apiKey) {
  const clean = String(baseUrl || "").trim().replace(/\/+$/, "").replace(/\/chat\/completions$/i, "");
  const urls = [`${clean}/models`];
  if (!/\/v\d+[a-z]*$/i.test(clean)) urls.push(`${clean}/v1/models`);
  return new Promise((resolve) => {
    let pending = urls.length;
    let best = { ok: false, models: 0, message: "unreachable" };
    const done = (r) => {
      if (r.ok && r.models >= best.models) best = r;
      else if (!best.ok && best.message === "unreachable") best = r;
      if (--pending === 0) resolve(best);
    };
    for (const u of urls) {
      const lib = u.startsWith("https") ? require("https") : require("http");
      try {
        const req = lib.get(
          u,
          { headers: { Authorization: `Bearer ${apiKey}` } },
          (res) => {
            let body = "";
            res.on("data", (c) => {
              body += c;
              if (body.length > 200000) req.destroy();
            });
            res.on("end", () => {
              if (res.statusCode === 404) return done({ ok: false, models: 0, message: "not an OpenAI-compatible /models path" });
              if (res.statusCode !== 200) {
                return done({ ok: false, models: 0, message: `HTTP ${res.statusCode} — key rejected or bad URL` });
              }
              try {
                const data = JSON.parse(body);
                const n = Array.isArray(data.data) ? data.data.length : 0;
                done({ ok: true, models: n, message: `${n} model(s) listed` });
              } catch {
                done({ ok: false, models: 0, message: "reachable but response was not JSON" });
              }
            });
          },
        );
        req.on("error", (e) => done({ ok: false, models: 0, message: `unreachable (${e.message})` }));
        req.setTimeout(12000, () => {
          req.destroy();
          done({ ok: false, models: 0, message: "timed out after 12s" });
        });
      } catch (e) {
        done({ ok: false, models: 0, message: String((e && e.message) || e) });
      }
    }
  });
}

async function runSetup() {
  // NOTE: flag is --file (not --env-file): Node 20.6+ natively pre-parses
  // --env-file anywhere on the command line and would swallow ours.
  const envFile = valueOf("--file", path.join(APP_DIR, ".env.local"));
  const checkOnly = has("--check");

  if (checkOnly) {
    // Never print the key value — masked metadata only.
    const fromFile = parseEnvFile(envFile).map;
    const kc = keychainGet();
    let key = (process.env.AI_API_KEY || "").trim();
    let source = key ? "shell env" : "";
    if (!key && kc.key) {
      key = kc.key;
      source = kc.where;
    }
    if (!key && fromFile.get("AI_API_KEY")) {
      key = String(fromFile.get("AI_API_KEY")).trim();
      source = envFile + " (mode " + ((fs.statSync(envFile).mode & 0o777).toString(8) || "?") + ")";
    }
    const model = (process.env.AI_MODEL_ID || fromFile.get("AI_MODEL_ID") || "").trim() || "(not set)";
    const base = (process.env.AI_BASE_URL || fromFile.get("AI_BASE_URL") || "").trim() || "(not set)";
    console.log(`
  \x1b[33m▲ ducky setup --check\x1b[0m  (values masked — key is never printed)
  ─────────────────────────────────────────────
   env file   ${envFile} ${fs.existsSync(envFile) ? "(exists)" : "(missing)"}
   base url   ${base}
   model      ${model}
   key        ${maskKey(key)}
   stored in  ${key ? source : "(nowhere)"}
   status     ${key ? "\x1b[32mkey present on server — browsers see only 'key hidden'\x1b[0m" : "\x1b[31mNO KEY — run: ducky setup\x1b[0m"}
  ─────────────────────────────────────────────
`);
    process.exit(key ? 0 : 1);
  }

  console.log(`
  \x1b[33m▲ ducky setup\x1b[0m — connect YOUR model endpoint (any OpenAI-compatible API)
  Order of hiding: OS keychain first (nothing on disk) → locked file fallback.
  The connection is live-tested before anything is saved.
`);

  let key = valueOf("--key", "");
  let model = valueOf("--model", "");
  let baseUrl = valueOf("--base-url", "");

  // Non-interactive (CI/SSH pipes): never block on prompts. The key must
  // come via --key; the base URL via --base-url.
  const tty = Boolean(process.stdin.isTTY);
  const askText = async (q) => {
    if (!tty) return "";
    return promptText(q);
  };

  if (!baseUrl) {
    baseUrl = await askText("  Base URL (https://your-endpoint/v1): ");
    if (!baseUrl && !tty) fail("No base URL: re-run with --base-url https://... (non-interactive shells can't prompt). Nothing was written.");
  }
  if (!baseUrl) fail("No base URL entered. Aborting — nothing was written.");
  if (!key) {
    if (!tty) fail("No API key: re-run with --key ... (non-interactive shells can't prompt). Nothing was written.");
    key = await promptHidden("  API key (hidden input): ");
  }
  if (!key) fail("No key entered. Aborting — nothing was written.");
  if (!model) {
    model = await askText("  Model id (Enter to pick after the live test): ");
  }

  // Live-test BEFORE saving: the endpoint must answer /models with this key.
  console.log(`  testing connection…`);
  const probe = await probeEndpoint(baseUrl, key);
  if (probe.ok) {
    console.log(`  \x1b[32m✓ live\x1b[0m — ${probe.message}.`);
  } else {
    console.log(`  \x1b[33m! not verified\x1b[0m — ${probe.message}.`);
    if (tty) {
      const again = await promptText("  Save anyway? [y/N]: ");
      if (!/^(y|yes)$/i.test(again.trim())) fail("Aborted — nothing was written. Fix the URL/key and retry.");
    } else {
      warn("saving unverified (non-interactive) — verify with: ducky setup --check");
    }
  }

  // Non-secrets always go to the env file (safe to keep, gitignored anyway).
  const entries = {};
  if (model) entries.AI_MODEL_ID = model;
  if (baseUrl) entries.AI_BASE_URL = baseUrl;
  writeEnvFile(envFile, entries);

  // Secret: OS keychain first (nothing on disk, nothing in git — ever).
  // Locked file (chmod 600) only when no keychain tool exists.
  const kc = keychainSet(key);
  let storedIn;
  if (kc.ok) {
    const scrubbed = scrubKeyFromEnvFile(envFile);
    storedIn = `${kc.where} (plaintext copies scrubbed${scrubbed ? "" : " — none found"})`;
  } else {
    warn(`OS keychain unavailable (${kc.reason}) — falling back to locked file.`);
    writeEnvFile(envFile, { AI_API_KEY: key });
    storedIn = `${envFile} (mode 600, gitignored)`;
  }

  console.log(`
  \x1b[32m✓ saved\x1b[0m — never commit it or paste it in chat
    base url   ${baseUrl}
    model      ${model || "(pick in Settings → Connections → Discover)"}
    key        ${maskKey(key)}
    stored in  ${storedIn}
  Next:
    1. Restart the server:  ducky --web   (local popup only, key stays on this machine)
    2. Verify masked:       ducky setup --check
    3. Users add their OWN key + model in Settings → Connections — or share this one via server env.
`);
  process.exit(0);
}

if (has("--help") || has("-h")) {
  printHelp();
  process.exit(0);
}
if (has("--version") || has("-v")) {
  console.log(PKG.version);
  process.exit(0);
}

if (ARGS[0] === "setup") {
  runSetup().catch((e) => fail(e instanceof Error ? e.message : String(e)));
  return;
}

if (ARGS[0] === "bridge") {
  // Local PC bridge: exposes THIS computer over loopback only, guarded by a
  // one-time token. The browser can never touch your PC otherwise — this
  // command IS the explicit consent. Keep this terminal open; Ctrl+C stops
  // everything. Add --input to ALSO unlock real mouse/keyboard control
  // (screenshot is read-only and always available when the OS allows it).
  runBridge();
  return;
}

async function runBridge() {
  const port = parseInt(valueOf("--port", "3791"), 10) || 3791;
  const root = path.resolve(valueOf("--root", process.cwd()));
  const crypto = require("crypto");
  let token = valueOf("--token", process.env.DUCKY_BRIDGE_TOKEN || "");
  const fresh = !token;
  if (fresh) token = crypto.randomBytes(24).toString("hex");

  const MAX_OUT = 64 * 1024;
  const MAX_READ = 512 * 1024;
  const MAX_WRITE = 2 * 1024 * 1024;
  const MAX_SHOT = 2 * 1024 * 1024;
  // Real input control is OFF unless explicitly unlocked: --input means "the
  // agent may move my mouse and type". Screenshot stays read-only.
  const inputUnlocked = has("--input");

  /* ---------- OS input/screen helpers (best available per platform) ------- */
  const hasBin = (name) => {
    try {
      const r = spawnSync(process.platform === "win32" ? "where" : "which", [name], { stdio: "ignore" });
      return !r.error && r.status === 0;
    } catch {
      return false;
    }
  };
  const shotHelper =
    process.platform === "darwin"
      ? "screencapture"
      : process.platform === "win32"
        ? null
        : hasBin("grim")
          ? "grim"
          : hasBin("scrot")
            ? "scrot"
            : hasBin("import")
              ? "import"
              : null;
  const inputHelper =
    process.platform === "darwin"
      ? "osascript"
      : process.platform === "win32"
        ? null
        : hasBin("xdotool")
          ? "xdotool"
          : null;

  const runHelper = (cmd, args, timeoutMs = 15000) =>
    new Promise((resolve) => {
      const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
      const out = [];
      let size = 0;
      let done = false;
      const finish = (code, err) => {
        if (done) return;
        done = true;
        resolve({ code: code ?? -1, out: Buffer.concat(out), err: String(err || "") });
      };
      const timer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {}
        finish(-1, "helper timed out");
      }, timeoutMs);
      child.stdout.on("data", (c) => {
        if (size < MAX_SHOT * 2) {
          out.push(c);
          size += c.length;
        }
      });
      child.stderr.on("data", () => {});
      child.on("error", (e) => {
        clearTimeout(timer);
        finish(-1, e.message);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        finish(code, "");
      });
    });

  const takeScreenshot = async () => {
    if (!shotHelper) return { ok: false, error: "No screenshot helper on this machine (macOS: built-in · Linux: install grim or scrot)." };
    const tmp = path.join(os.tmpdir(), `ducky-shot-${Date.now()}.png`);
    let r;
    if (shotHelper === "screencapture") r = await runHelper("screencapture", ["-x", "-t", "png", tmp]);
    else if (shotHelper === "grim") r = await runHelper("grim", [tmp]);
    else if (shotHelper === "scrot") r = await runHelper("scrot", ["-z", tmp]);
    else r = await runHelper("import", ["-window", "root", tmp]);
    try {
      if (r.code !== 0) return { ok: false, error: `Screenshot failed (${shotHelper}, exit ${r.code}).` };
      const buf = fs.readFileSync(tmp);
      if (!buf.length) return { ok: false, error: "Screenshot came back empty (no display?)." };
      if (buf.length > MAX_SHOT) {
        return { ok: false, error: `Screenshot is ${(buf.length / 1024 / 1024).toFixed(1)} MB (cap 2 MB) — lower the display resolution and retry.` };
      }
      return { ok: true, image: buf.toString("base64"), bytes: buf.length };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {}
    }
  };

  const KEY_RE = /^(ctrl\+|alt\+|shift\+|super\+|meta\+)*(enter|tab|escape|esc|space|backspace|delete|home|end|page_up|page_down|up|down|left|right|f[1-9]|f1[0-2]|[a-z0-9])$/i;

  const runInput = async (kind, arg) => {
    if (!inputUnlocked) {
      return { ok: false, error: "Input control is locked — restart the bridge with `ducky bridge --input` to unlock mouse/keyboard." };
    }
    if (!inputHelper) {
      return {
        ok: false,
        error: "No input helper on this machine (macOS: built-in osascript · Linux: `sudo apt install xdotool` on X11).",
      };
    }
    try {
      if (inputHelper === "osascript") {
        const apple = (script) => runHelper("osascript", ["-e", script]);
        if (kind === "move" || kind === "click") {
          const { x, y, button } = arg;
          await apple(`tell application "System Events" to set mouseLoc to {${x}, ${y}}`);
          // Note: System Events has no direct click-at; key code 36 fallback is unreliable —
          // report honestly: macOS needs cliclick for clicks (brew install cliclick).
          if (kind === "click") {
            if (hasBin("cliclick")) {
              const btn = button === "right" ? "rc" : button === "middle" ? "mc" : "c";
              const r = await runHelper("cliclick", [`${btn}:${x},${y}`]);
              if (r.code !== 0) return { ok: false, error: `cliclick failed (exit ${r.code}).` };
              return { ok: true, message: `Clicked ${button} at ${x},${y}.` };
            }
            return { ok: false, error: "macOS moved the pointer, but clicking needs `brew install cliclick`." };
          }
          return { ok: true, message: `Pointer moved to ${x},${y}.` };
        }
        if (kind === "type") {
          const safe = String(arg.text).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
          const r = await apple(`tell application "System Events" to keystroke "${safe}"`);
          if (r.code !== 0) return { ok: false, error: `Typing failed (exit ${r.code}) — grant accessibility permission?` };
          return { ok: true, message: `Typed ${String(arg.text).length} chars.` };
        }
        if (kind === "key") {
          const map = { enter: "36", tab: "48", escape: "53", esc: "53", space: "49", backspace: "51", delete: "117" };
          const k = String(arg.key).toLowerCase();
          const code = map[k];
          if (!code) return { ok: false, error: `Key "${arg.key}" not mapped on macOS (Enter/Tab/Escape/Space/Backspace/Delete supported).` };
          const r = await apple(`tell application "System Events" to key code ${code}`);
          if (r.code !== 0) return { ok: false, error: `Key press failed (exit ${r.code}).` };
          return { ok: true, message: `Pressed ${k}.` };
        }
      }
      // xdotool (Linux/X11)
      if (kind === "move") {
        const r = await runHelper("xdotool", ["mousemove", String(arg.x), String(arg.y)]);
        if (r.code !== 0) return { ok: false, error: `mousemove failed (exit ${r.code}) — is an X session running?` };
        return { ok: true, message: `Pointer moved to ${arg.x},${arg.y}.` };
      }
      if (kind === "click") {
        const btn = arg.button === "right" ? "3" : arg.button === "middle" ? "2" : "1";
        const r = await runHelper("xdotool", ["mousemove", String(arg.x), String(arg.y), "click", btn]);
        if (r.code !== 0) return { ok: false, error: `click failed (exit ${r.code}).` };
        return { ok: true, message: `Clicked ${arg.button} at ${arg.x},${arg.y}.` };
      }
      if (kind === "type") {
        const text = String(arg.text);
        if (!text) return { ok: false, error: "Nothing to type." };
        if (text.length > 2000) return { ok: false, error: "Type at most 2000 chars per call." };
        const r = await runHelper("xdotool", ["type", "--clearmodifiers", "--delay", "10", "--", text], 60000);
        if (r.code !== 0) return { ok: false, error: `Typing failed (exit ${r.code}).` };
        return { ok: true, message: `Typed ${text.length} chars.` };
      }
      if (kind === "key") {
        const k = String(arg.key);
        if (!KEY_RE.test(k)) return { ok: false, error: `Key "${k}" not allowed (Enter/Tab/Escape/arrows/F-keys/single chars + ctrl/alt/shift/super).` };
        const seq = k.toLowerCase().replace(/\+/g, "+");
        const r = await runHelper("xdotool", ["key", "--clearmodifiers", seq]);
        if (r.code !== 0) return { ok: false, error: `Key press failed (exit ${r.code}).` };
        return { ok: true, message: `Pressed ${k}.` };
      }
      return { ok: false, error: `Unknown input action "${kind}".` };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  };

  const inside = (p) => {
    const abs = path.resolve(root, p || ".");
    return abs === root || abs.startsWith(root + path.sep) ? abs : null;
  };

  const send = (res, code, obj) => {
    const body = JSON.stringify(obj);
    res.writeHead(code, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end(body);
  };

  const authed = (obj) =>
    obj && typeof obj.token === "string" && obj.token.length > 0 && obj.token === token;

  const server = require("http").createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      return res.end();
    }
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/status") {
      return send(res, 200, { ok: true, bridge: "ducky-pc-bridge", version: PKG.version, root, platform: process.platform, time: Date.now() });
    }
    if (req.method !== "POST") return send(res, 405, { ok: false, error: "POST only" });
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > MAX_WRITE + 1024) req.destroy();
    });
    req.on("end", async () => {
      let body = null;
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        return send(res, 400, { ok: false, error: "Invalid JSON body." });
      }
      if (!authed(body)) return send(res, 401, { ok: false, error: "Bad or missing token." });

      if (url.pathname === "/exec") {
        const command = String(body.command || "").trim();
        if (!command) return send(res, 400, { ok: false, error: "Missing command." });
        const cwd = inside(String(body.cwd || ".")) || root;
        const timeoutMs = Math.min(120000, Math.max(1000, Number(body.timeoutMs) || 30000));
        const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
        const args = process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-c", command];
        const child = spawn(shell, args, { cwd });
        let out = "";
        let err = "";
        const push = (buf, isErr) => {
          const s = String(buf).slice(0, Math.max(0, MAX_OUT - (isErr ? err : out).length));
          if (isErr) err += s;
          else out += s;
        };
        child.stdout.on("data", (c) => push(c, false));
        child.stderr.on("data", (c) => push(c, true));
        let done = false;
        const finish = (code) => {
          if (done) return;
          done = true;
          send(res, 200, { ok: true, exitCode: code ?? -1, stdout: out, stderr: err });
        };
        const timer = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {}
          finish(124);
        }, timeoutMs);
        child.on("error", (e) => {
          clearTimeout(timer);
          send(res, 200, { ok: true, exitCode: 127, stdout: "", stderr: String((e && e.message) || e) });
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          finish(code);
        });
        return;
      }

      if (url.pathname === "/ls") {
        const abs = inside(String(body.path || "."));
        if (!abs) return send(res, 400, { ok: false, error: "Path escapes the bridge root." });
        const recursive = body.recursive === true;
        const out = [];
        try {
          const walk = (dir, depth) => {
            for (const name of fs.readdirSync(dir)) {
              if (out.length >= 2000) return;
              const full = path.join(dir, name);
              let st = null;
              try {
                st = fs.statSync(full);
              } catch {
                continue;
              }
              const rel = path.relative(root, full) || ".";
              out.push({ path: rel, dir: st.isDirectory(), size: st.isDirectory() ? 0 : st.size });
              if (recursive && st.isDirectory() && depth < 6) walk(full, depth + 1);
            }
          };
          const st = fs.statSync(abs);
          if (!st.isDirectory()) return send(res, 400, { ok: false, error: "Not a directory." });
          walk(abs, 0);
        } catch (e) {
          return send(res, 400, { ok: false, error: String((e && e.message) || e) });
        }
        return send(res, 200, { ok: true, entries: out });
      }

      if (url.pathname === "/read") {
        const abs = inside(String(body.path || ""));
        if (!abs) return send(res, 400, { ok: false, error: "Path escapes the bridge root." });
        try {
          const st = fs.statSync(abs);
          if (!st.isDirectory()) {
            const buf = fs.readFileSync(abs);
            const truncated = buf.length > MAX_READ;
            return send(res, 200, {
              ok: true,
              content: buf.slice(0, MAX_READ).toString("utf8"),
              bytes: buf.length,
              truncated,
            });
          }
          return send(res, 400, { ok: false, error: "Is a directory (use /ls)." });
        } catch (e) {
          return send(res, 400, { ok: false, error: String((e && e.message) || e) });
        }
      }

      if (url.pathname === "/write") {
        const abs = inside(String(body.path || ""));
        if (!abs) return send(res, 400, { ok: false, error: "Path escapes the bridge root." });
        const content = typeof body.content === "string" ? body.content : "";
        if (Buffer.byteLength(content) > MAX_WRITE) {
          return send(res, 400, { ok: false, error: "Content exceeds 2 MB." });
        }
        try {
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, content);
          return send(res, 200, { ok: true, bytes: Buffer.byteLength(content) });
        } catch (e) {
          return send(res, 400, { ok: false, error: String((e && e.message) || e) });
        }
      }

      if (url.pathname === "/caps") {
        return send(res, 200, {
          ok: true,
          platform: process.platform,
          display: process.env.DISPLAY || null,
          screenshot: shotHelper,
          input: inputHelper,
          inputUnlocked,
        });
      }

      if (url.pathname === "/screen") {
        const shot = await takeScreenshot();
        if (!shot.ok) return send(res, 400, { ok: false, error: shot.error });
        return send(res, 200, { ok: true, image: shot.image, bytes: shot.bytes });
      }

      const intArg = (v, lo, hi, name) => {
        const n = typeof v === "number" ? v : parseInt(v, 10);
        if (!Number.isFinite(n) || n < lo || n > hi) return { error: `${name} must be an integer ${lo}–${hi}.` };
        return { value: Math.round(n) };
      };

      if (url.pathname === "/move" || url.pathname === "/click") {
        const x = intArg(body.x, 0, 10000, "x");
        if (x.error) return send(res, 400, { ok: false, error: x.error });
        const y = intArg(body.y, 0, 10000, "y");
        if (y.error) return send(res, 400, { ok: false, error: y.error });
        const button = String(body.button || "left").toLowerCase();
        if (!["left", "right", "middle"].includes(button)) {
          return send(res, 400, { ok: false, error: 'button must be left | right | middle.' });
        }
        const r =
          url.pathname === "/move"
            ? await runInput("move", { x: x.value, y: y.value })
            : await runInput("click", { x: x.value, y: y.value, button });
        return send(res, r.ok ? 200 : 400, r);
      }

      if (url.pathname === "/wiggle") {
        // Visible "AI is HERE" marker: quick circle around the point, then
        // back exactly where it started. Needs --input + xdotool (Linux/X11).
        const x = intArg(body.x, 0, 10000, "x");
        if (x.error) return send(res, 400, { ok: false, error: x.error });
        const y = intArg(body.y, 0, 10000, "y");
        if (y.error) return send(res, 400, { ok: false, error: y.error });
        if (!inputUnlocked) {
          return send(res, 400, { ok: false, error: "Input control is locked — restart the bridge with `ducky bridge --input`." });
        }
        if (inputHelper !== "xdotool") {
          return send(res, 400, { ok: false, error: "Wiggle needs xdotool (Linux/X11)." });
        }
        const R = 34;
        const pts = [];
        for (let i = 0; i <= 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          pts.push("mousemove", String(Math.round(x.value + R * Math.cos(a))), String(Math.round(y.value + R * Math.sin(a))));
        }
        pts.push("mousemove", String(x.value), String(y.value));
        const r = await runHelper("xdotool", pts, 10000);
        if (r.code !== 0) return send(res, 400, { ok: false, error: `Wiggle failed (exit ${r.code}).` });
        return send(res, 200, { ok: true, message: `Announced at ${x.value},${y.value}.` });
      }

      if (url.pathname === "/type") {
        const r = await runInput("type", { text: body.text });
        return send(res, r.ok ? 200 : 400, r);
      }

      if (url.pathname === "/key") {
        const r = await runInput("key", { key: body.key });
        return send(res, r.ok ? 200 : 400, r);
      }

      return send(res, 404, { ok: false, error: "Unknown route. Try /status /caps /screen /exec /ls /read /write /move /click /type /key /wiggle." });
    });
  });

  server.on("error", (e) => fail(`Bridge failed to bind 127.0.0.1:${port} — ${e.message}`));
  server.listen(port, "127.0.0.1", () => {
    console.log(`
  \x1b[33m▲ ducky bridge\x1b[0m — THIS PC is now connected (loopback only)
  ─────────────────────────────────────────────
   url      http://127.0.0.1:${port}  (this machine only — never the web)
   root     ${root}  (nothing above this folder is reachable)
   token    ${fresh ? "(fresh, shown ONCE below)" : "(from --token / DUCKY_BRIDGE_TOKEN)"}
  ─────────────────────────────────────────────
`);
    if (fresh) {
      console.log(`  paste this token into Settings → Connections → This PC:\n\n  ${token}\n`);
    }
    console.log(`  In the UI: status bar shows pc: connected · terminal gets a PC mode.\n  Keep this terminal open. Ctrl+C stops the bridge instantly.\n`);
  });
  const shutdown = (sig) => {
    log(`Bridge received ${sig} — disconnecting this PC…`);
    try {
      server.close();
    } catch {}
    setTimeout(() => process.exit(0), 300).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

if (ARGS[0] === "update") {
  // One-command updater: fast-forward the checkout, reinstall, rebuild.
  // Works on git checkouts (curl installs: re-run the installer instead).
  const hasGit = (() => {
    try {
      const r = spawnSync("git", ["rev-parse", "--git-dir"], { cwd: APP_DIR, stdio: "ignore" });
      return !r.error && r.status === 0;
    } catch {
      return false;
    }
  })();
  if (!hasGit) {
    fail(`Not a git checkout (${APP_DIR}). Re-run the installer instead:\n  curl -fsSL https://ducky-install.vercel.app | bash`);
  }
  console.log(`\n  \x1b[33m▲ ducky update\x1b[0m — pulling latest release…\n`);
  const pull = spawnSync("git", ["pull", "--ff-only"], { cwd: APP_DIR, stdio: "inherit" });
  if (pull.status !== 0) fail("git pull failed (local changes? stash or reset, then retry). Nothing else ran.");
  const pm = (() => {
    try {
      const r = spawnSync("bun", ["--version"], { stdio: "ignore" });
      return !r.error && r.status === 0 ? "bun" : "npm";
    } catch {
      return "npm";
    }
  })();
  log("Reinstalling dependencies…");
  const inst = spawnSync(pm, ["install", ...(pm === "npm" ? ["--no-audit", "--no-fund"] : [])], {
    cwd: APP_DIR,
    stdio: "inherit",
  });
  if (inst.status !== 0) fail("Dependency install failed — see errors above.");
  log("Rebuilding…");
  const build = spawnSync(pm, ["run", "build"], { cwd: APP_DIR, stdio: "inherit" });
  if (build.status !== 0) fail("Build failed — see errors above.");
  console.log(`\n  \x1b[32m✓ updated\x1b[0m → restart with: ducky --web\n`);
  process.exit(0);
}

const wantsWeb = has("--web") || ARGS.length === 0 || ARGS[0].startsWith("-");
if (!wantsWeb) {
  console.error(`Unknown command: ${ARGS[0]}\nTry: ducky --web / ducky setup / ducky --help`);
  process.exit(1);
}

const DEV = has("--dev");
const NO_OPEN = has("--no-open");
const NO_BUILD = has("--no-build");
let port = parseInt(valueOf("--port", valueOf("-p", "3000")), 10);
if (!Number.isFinite(port) || port < 1 || port > 65535) port = 3000;
// Default is explicit IPv4 loopback (not "localhost"): on some machines
// "localhost" binds ::1 while the browser dials 127.0.0.1 (or vice versa),
// leaving an empty popup. 127.0.0.1 is always this machine, never the web.
const host = valueOf("--host", "127.0.0.1");

function log(...m) {
  console.log("\x1b[33m[ducky]\x1b[0m", ...m);
}
function warn(...m) {
  console.warn("\x1b[33m[ducky]\x1b[0m", ...m);
}
function fail(msg, code = 1) {
  console.error("\x1b[31m[ducky:error]\x1b[0m", msg);
  process.exit(code);
}

if (!fs.existsSync(PKG_PATH)) fail(`package.json not found at ${PKG_PATH}`);
if (!fs.existsSync(path.join(APP_DIR, "node_modules"))) {
  fail(
    `Dependencies missing in ${APP_DIR}.\n  Run first:  cd ${APP_DIR} && npm install  (or: bun install)`
  );
}

const localNextBin = path.join(APP_DIR, "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");
const hasLocalNext = fs.existsSync(localNextBin);
const nextCmd = hasLocalNext ? localNextBin : "npx";
const nextPrefixArgs = hasLocalNext ? [] : ["--yes", "next@^16.1.1"];

function runNextBuild() {
  log("Production build missing (.next) — running `next build` once…");
  const res = spawnSync(hasLocalNext ? localNextBin : "npx", [...nextPrefixArgs, "build"], {
    cwd: APP_DIR,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) fail("`next build` failed. Fix errors above and retry (or use --dev).");
}

if (!DEV && !NO_BUILD && !fs.existsSync(path.join(APP_DIR, ".next"))) {
  // Allow CI-style isolated dist dir too
  if (process.env.NEXT_DIST_DIR && fs.existsSync(path.join(APP_DIR, process.env.NEXT_DIST_DIR))) {
    // ok
  } else {
    runNextBuild();
  }
}

function isPortFree(p, h) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    // bind on requested host; fall back to all interfaces check
    try {
      s.listen(p, h === "localhost" ? "127.0.0.1" : h);
    } catch {
      resolve(false);
    }
  });
}

async function pickPort(p, h) {
  for (let i = 0; i < 20; i++) {
    const candidate = p + i;
    if (await isPortFree(candidate, h)) {
      if (i > 0) warn(`Port ${p} busy — using ${candidate} instead.`);
      return candidate;
    }
  }
  fail(`No free port found near ${p}. Pass --port <n>.`);
  return p;
}

function openBrowser(url) {
  if (NO_OPEN) return;
  const plat = process.platform;
  try {
    if (plat === "darwin") execSync(`open ${JSON.stringify(url)}`, { stdio: "ignore" });
    else if (plat === "win32") execSync(`start "" ${JSON.stringify(url)}`, { stdio: "ignore", shell: true });
    else {
      // linux / wsl / chromebooks
      try {
        execSync(`xdg-open ${JSON.stringify(url)}`, { stdio: "ignore" });
      } catch {
        try {
          execSync(`sensible-browser ${JSON.stringify(url)}`, { stdio: "ignore" });
        } catch {
          warn(`Please open manually: ${url}`);
        }
      }
    }
  } catch {
    warn(`Please open manually: ${url}`);
  }
}

function waitForReady(url, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = (url.startsWith("https") ? require("https") : require("http")).get(
        url,
        (res) => {
          res.resume();
          if (res.statusCode && res.statusCode < 500) return resolve(true);
          retry();
        }
      );
      req.on("error", retry);
      req.setTimeout(2500, () => {
        req.destroy();
        retry();
      });
      function retry() {
        if (Date.now() - start > timeoutMs) return reject(new Error("Timed out waiting for server"));
        setTimeout(tick, 400);
      }
    };
    tick();
  });
}

(async () => {
  const freePort = await pickPort(port, host);
  const mode = DEV ? "dev" : "start";
  const args = [...nextPrefixArgs, mode, "-p", String(freePort), "-H", host];
  const displayHost = host === "0.0.0.0" ? "localhost" : host;
  const url = `http://${displayHost}:${freePort}`;

  // Local-only guard: loopback (localhost/127.0.0.1) keeps the key-spending
  // proxy on THIS machine. Binding 0.0.0.0/LAN would let anyone with network
  // access spend your provider credits through the local proxy.
  const loopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!loopback) {
    warn(`--host ${host} exposes the UI beyond this machine. Anyone reaching it can use YOUR server key via the proxy. Prefer the default (localhost).`);
  }

  // Key resolution for the child server (in-memory only, never printed):
  // shell env → OS keychain → .env.local (loaded by Next itself).
  const childEnv = { ...process.env, PORT: String(freePort) };
  let keySource = "";
  if ((childEnv.AI_API_KEY || "").trim()) {
    keySource = "shell env";
  } else {
    const kc = keychainGet();
    if (kc.key) {
      childEnv.AI_API_KEY = kc.key;
      keySource = kc.where + " (injected in-memory, never written to disk)";
    } else {
      keySource = "file env (.env.local) or not configured";
    }
  }

  // Key-source label only — key value is never read or printed here.
  // Server env and keychain both count as "server key"; per-user browser
  // keys are reported by the UI itself.
  const hasServerKey = Boolean((childEnv.AI_API_KEY || "").trim());
  const keyLabel = hasServerKey ? `server key (${keySource})` : "not configured — run: ducky setup";

  console.log(`
  \x1b[33m▲ ducky ai | coder\x1b[0m  v${PKG.version}  ·  ${DEV ? "dev" : "web"}  ·  LOCAL ONLY${loopback ? "" : " (EXPOSED — see warning above)"}
  ─────────────────────────────────────────────
   app      ${APP_DIR}
   url      \x1b[36m${url}\x1b[0m  ← local popup on this machine, NOT a website
   mode     ${DEV ? "next dev (hot reload)" : "next start (production)"}
   model    ${keyLabel}
   browser  ${NO_OPEN ? "manual (--no-open)" : "auto-open"}
  ─────────────────────────────────────────────
`);

  log(`Starting \`next ${mode}\` on ${host}:${freePort}…`);
  const child = spawn(nextCmd, args, {
    cwd: APP_DIR,
    stdio: "inherit",
    env: childEnv,
    shell: process.platform === "win32",
  });

  let opened = false;
  const openOnce = () => {
    if (opened || NO_OPEN) return;
    opened = true;
    log(`Opening ${url} …`);
    openBrowser(url);
  };

  // Open fast: try as soon as server responds, with a 2.5s fallback.
  waitForReady(url).then(openOnce).catch(() => openOnce());
  setTimeout(openOnce, 3500);

  const shutdown = (sig) => {
    log(`Received ${sig} — stopping…`);
    try {
      child.kill(sig);
    } catch {}
    setTimeout(() => process.exit(0), 800).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  child.on("exit", (code) => {
    log(`Server exited (code ${code ?? "?"}). Bye! ${os.EOL}  Tip: ducky --web --port ${freePort + 1} to run a second copy.`);
    process.exit(code ?? 0);
  });
})();
