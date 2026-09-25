#!/usr/bin/env node
// Ducky Coder launcher (surface brand over Ducky internals).
// Usage:
//   ducky web [--dev] [--port 3030] [--host localhost] [--workspace PATH] [--no-open] [--build|--skip-build]
//   ducky install [--bin-dir ~/.local/bin]
//   ducky --help | version
//
// `ducky web` (prod, default): ensure packages/web + packages/server are built,
// then run node packages/server/dist/entry-http.js with DUCKY_WEB_STATIC_ROOT
// pointing at packages/web/dist, and open the browser.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, symlink, unlink, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { platform, totalmem } from "node:os";

const repoRoot = resolve(import.meta.dirname, "..");
const webDist = join(repoRoot, "packages", "web", "dist");
const serverEntry = join(repoRoot, "packages", "server", "dist", "entry-http.js");

function usage() {
  console.log(`Ducky Coder

Usage:
  ducky web [--dev] [--port 3030] [--host localhost] [--workspace PATH] [--no-open] [--build|--skip-build]
  ducky install [--bin-dir DIR]
  ducky --help | version

Options for "web":
  --dev            Dev mode: vite + hot-reload server, no production bundle.
                   Much lighter on small machines (skips the 7000-module build).
                   Fixed wiring: UI http://localhost:5173, backend localhost:3030.
                   --workspace is honored; --port/--host/--build/--skip-build do not apply.
  --port <n>       Server port. Default 3030 (or $PORT).
  --host <name>    Bind host. Default localhost.
  --workspace <p>  Workspace folder served by the server. Default: current directory.
  --no-open        Do not open a browser, just start the server.
  --build          Force rebuild web + server before serving.
  --skip-build     Serve existing dist without building (fails if dist missing).

"web" is the prod launcher: it serves the built Web UI (packages/web/dist)
through the server HTTP entry with SPA fallback, then opens your browser.
Internals (@ducky/*, DUCKY_* env) are unchanged.
`);
}

function parseArgs(argv) {
  const opts = {
    port: process.env["PORT"] ? Number(process.env["PORT"]) : 3030,
    host: "localhost",
    workspace: process.cwd(),
    open: true,
    build: false,
    skipBuild: false,
    dev: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port" || a.startsWith("--port=")) {
      const v = a.includes("=") ? a.slice(a.indexOf("=") + 1) : argv[++i];
      opts.port = Number(v);
    } else if (a === "--host" || a.startsWith("--host=")) {
      opts.host = a.includes("=") ? a.slice(a.indexOf("=") + 1) : argv[++i];
    } else if (a === "--workspace" || a.startsWith("--workspace=")) {
      opts.workspace = a.includes("=") ? a.slice(a.indexOf("=") + 1) : argv[++i];
    } else if (a === "--no-open") {
      opts.open = false;
    } else if (a === "--build") {
      opts.build = true;
    } else if (a === "--skip-build") {
      opts.skipBuild = true;
    } else if (a === "--dev") {
      opts.dev = true;
    } else {
      throw new Error(`Unknown option "${a}". Run "ducky --help".`);
    }
  }
  if (!Number.isFinite(opts.port) || opts.port <= 0) throw new Error("Invalid --port");
  return opts;
}

function run(cmd, args, options = {}) {
  console.log(`[ducky] ${[cmd, ...args].join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: repoRoot, stdio: "inherit", ...options });
  if (r.error) throw new Error(`${cmd} failed: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed`);
}

// The web bundle (7000+ modules) can exceed the default Node heap on small
// machines and get OOM-killed (exit 137). Size the heap to ~75% of total RAM
// (2GB min, 8GB max); explicit NODE_OPTIONS always wins.
function buildEnv() {
  if (process.env["NODE_OPTIONS"]) return process.env;
  const totalMb = Math.floor(totalmem() / 1048576);
  const heapMb = Math.max(2048, Math.min(8192, Math.floor(totalMb * 0.75)));
  return { ...process.env, NODE_OPTIONS: `--max-old-space-size=${heapMb}` };
}

function ensureBuilt(force) {
  const webOk = existsSync(join(webDist, "index.html"));
  const serverOk = existsSync(serverEntry);
  if (!force && webOk && serverOk) return;
  console.log("[ducky] building web + server (prod)...");
  const env = buildEnv();
  console.log(`[ducky] build heap: ${env["NODE_OPTIONS"] ?? "(default)"}`);
  run("pnpm", ["--filter", "@ducky/server", "build"], { env });
  run("pnpm", ["--filter", "@ducky/web", "build"], { env });
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function openBrowser(url) {
  const p = platform();
  try {
    if (p === "darwin") spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    else if (p === "win32") spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
    else spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
    console.log(`[ducky] opened browser: ${url}`);
  } catch (error) {
    console.log(`[ducky] could not open browser automatically: ${url} (${error})`);
  }
}

async function cmdWeb(rest) {
  const opts = parseArgs(rest);
  // Small machines (<4.5GB RAM) cannot survive the 7000-module production
  // bundle: the build thrashes the whole PC at "modules transformed" and
  // then gets OOM-killed. Auto-pick the light dev stack unless the user
  // explicitly forces a bundle (--build) or prod mode. DUCKY_WEB_MODE=prod
  // forces prod, =dev forces dev.
  const modeEnv = (process.env["DUCKY_WEB_MODE"] ?? "").trim().toLowerCase();
  const lowRam = totalmem() < 4.5 * 1024 ** 3;
  const wantDev =
    opts.dev || modeEnv === "dev" || (modeEnv !== "prod" && !opts.build && lowRam);
  if (wantDev && !opts.dev) {
    console.log(
      "[ducky] small machine detected (<4.5GB RAM): using the light dev stack " +
        "instead of the production bundle (pass --build to force it, " +
        "DUCKY_WEB_MODE=prod to always build).",
    );
  }
  if (wantDev) {
    await cmdWebDev(opts);
    return;
  }
  if (opts.build && opts.skipBuild) throw new Error("Use only one of --build / --skip-build");
  if (opts.skipBuild) {
    if (!existsSync(join(webDist, "index.html"))) throw new Error(`Missing web dist: ${webDist}. Run "ducky web --build".`);
    if (!existsSync(serverEntry)) throw new Error(`Missing server entry: ${serverEntry}. Run "ducky web --build".`);
  } else if (opts.build || !existsSync(join(webDist, "index.html")) || !existsSync(serverEntry)) {
    ensureBuilt(opts.build);
  }
  const url = `http://${opts.host === "0.0.0.0" ? "localhost" : opts.host}:${opts.port}`;
  console.log(`[ducky] Ducky Coder web UI -> ${url}`);
  console.log(`[ducky] workspace: ${resolve(opts.workspace)}`);
  const child = spawn(
    "node",
    [serverEntry],
    {
      cwd: repoRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        PORT: String(opts.port),
        DUCKY_SERVER_HOST: opts.host,
        DUCKY_WEB_STATIC_ROOT: webDist,
        DUCKY_SERVER_WORKSPACE: resolve(opts.workspace),
      },
    },
  );
  const shutdown = () => {
    if (!child.killed) child.kill("SIGTERM");
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  child.on("exit", (code, signal) => {
    process.removeListener("SIGINT", shutdown);
    process.removeListener("SIGTERM", shutdown);
    if (signal) console.log(`[ducky] server stopped (${signal})`);
    else if (code !== 0 && code !== null) process.exitCode = code;
  });
  if (opts.open) {
    const ready = await waitForServer(`${url}/api/server-info`);
    if (ready) openBrowser(url);
    else console.log(`[ducky] server did not answer yet, open manually: ${url}`);
  }
  await new Promise(() => {});
}

async function cmdWebDev(opts) {
  // Dev mode skips the production bundle entirely: vite serves the Web UI
  // from source (http://localhost:5173, proxies /ws + /api to :3030) while
  // the server runs with hot reload. Peak RAM is a fraction of `vite build`,
  // which matters on 2-3GB machines where the prod bundle OOMs or thrashes.
  if (opts.build || opts.skipBuild) {
    console.log("[ducky] --dev ignores --build/--skip-build (no bundle is produced).");
  }
  // Fixed wiring: packages/web/vite.config.ts proxies /ws + /api to
  // localhost:3030, so a custom --port/--host would move the backend without
  // moving the proxy target and break the app. Say so instead of silently
  // ignoring the flags. (Same reason a stray $PORT in the environment must
  // not leak through to the backend — it is pinned below.)
  if (opts.port !== 3030) {
    console.log(
      `[ducky] --dev pins the backend to localhost:3030 (vite proxy target); ignoring port ${opts.port}. Use prod "ducky web" for custom ports.`,
    );
  }
  if (opts.host !== "localhost") {
    console.log(
      `[ducky] --dev pins the backend to localhost:3030 (vite proxy target); ignoring host "${opts.host}". Use prod "ducky web" for custom hosts.`,
    );
  }
  // The child runs with cwd=repoRoot, so without this the backend would serve
  // the repo checkout instead of the launch directory. --workspace is honored
  // via the same DUCKY_SERVER_WORKSPACE env the prod entry reads.
  const workspace = resolve(opts.workspace);
  console.log("[ducky] Ducky Coder dev UI -> http://localhost:5173");
  console.log("[ducky] backend (hot reload) -> http://localhost:3030");
  console.log(`[ducky] workspace: ${workspace}`);
  console.log("[ducky] logs below are prefixed server| (backend) and web| (vite).");
  const child = spawn("pnpm", ["dev:web"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, PORT: "3030", DUCKY_SERVER_WORKSPACE: workspace },
  });
  // Forward each signal as itself (not always SIGTERM): concurrently/vite
  // shut down cleanly on SIGINT, and in a terminal the whole foreground group
  // already gets SIGINT — this covers kill(1) and non-tty parents.
  // concurrently (-k, see root package.json dev:web) then tears down the
  // vite + tsup/server tree.
  const onSigint = () => {
    if (!child.killed) child.kill("SIGINT");
  };
  const onSigterm = () => {
    if (!child.killed) child.kill("SIGTERM");
  };
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);
  // spawn() does not throw when the binary is missing — it emits "error",
  // which without a listener crashes with an unhandled-event traceback.
  child.on("error", (error) => {
    console.error(`[ducky] could not start "pnpm dev:web": ${error.message}`);
    console.error("[ducky] need pnpm + installed deps: install pnpm 10.33.2 (see mise.toml), then run: pnpm install");
    process.exit(1);
  });
  child.on("exit", (code, signal) => {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
    if (signal) {
      console.log(`[ducky] dev stack stopped (${signal})`);
      return;
    }
    // The stack never exits on its own (vite + tsup --watch run forever), so
    // a plain exit means something failed (e.g. missing `concurrently`).
    // Exit instead of hanging on the promise below so the failure surfaces.
    if (code !== 0 && code !== null) {
      console.error(`[ducky] dev stack exited (code ${code}). If "concurrently" is missing, run: pnpm install`);
      process.exit(code);
    }
  });
  if (opts.open) {
    const viteReady = await waitForServer("http://localhost:5173/", 60000);
    if (!viteReady) {
      console.log('[ducky] vite is taking a while; open http://localhost:5173/ manually once the web| output shows "ready".');
    } else {
      // Vite being up says nothing about the backend: probe it too, so a dead
      // :3030 prints a pointer at the server| log instead of a bare error page.
      const apiReady = await waitForServer("http://localhost:3030/api/server-info", 15000);
      if (!apiReady) {
        console.log("[ducky] backend http://localhost:3030/api/server-info is not answering yet — the page may show an error until it does. Watch the server| output above.");
      }
      openBrowser("http://localhost:5173/");
    }
  }
  await new Promise(() => {});
}

async function cmdInstall(rest) {
  let binDir = join(process.env["HOME"] ?? "~", ".local", "bin");
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--bin-dir") binDir = resolve(rest[++i] ?? "");
    else if (rest[i].startsWith("--bin-dir=")) binDir = resolve(rest[i].slice("--bin-dir=".length));
    else throw new Error(`Unknown option "${rest[i]}"`);
  }
  const src = join(repoRoot, "bin", "ducky");
  const dest = join(binDir, "ducky");
  await mkdir(binDir, { recursive: true });
  try {
    // Unconditional remove: a dangling symlink reports existsSync() === false
    // yet still makes symlink() fail with EEXIST.
    await unlink(dest).catch(() => {});
    await symlink(src, dest);
  } catch (error) {
    throw new Error(`install failed: ${error}`);
  }
  console.log(`[ducky] installed ${dest} -> ${src}`);
  console.log(`Make sure ${binDir} is on PATH, then run: ducky web`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    usage();
    return;
  }
  if (cmd === "version" || cmd === "--version" || cmd === "-v") {
    const pkg = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
    console.log(`ducky (Ducky Coder) ${pkg.version ?? "unknown"}`);
    return;
  }
  if (cmd === "web") {
    await cmdWeb(rest);
    return;
  }
  if (cmd === "install") {
    await cmdInstall(rest);
    return;
  }
  throw new Error(`Unknown command "${cmd}". Run "ducky --help".`);
}

await main().catch((error) => {
  console.error(`[ducky] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
