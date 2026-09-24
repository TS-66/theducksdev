#!/usr/bin/env node
// Ducky Coder launcher (surface brand over Ducky internals).
// Usage:
//   ducky web [--port 3030] [--host localhost] [--workspace PATH] [--no-open] [--build|--skip-build]
//   ducky install [--bin-dir ~/.local/bin]
//   ducky --help | version
//
// `ducky web` (prod, default): ensure packages/web + packages/server are built,
// then run node packages/server/dist/entry-http.js with DUCKY_WEB_STATIC_ROOT
// pointing at packages/web/dist, and open the browser.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, symlink, readlink, unlink, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { platform } from "node:os";

const repoRoot = resolve(import.meta.dirname, "..");
const webDist = join(repoRoot, "packages", "web", "dist");
const serverEntry = join(repoRoot, "packages", "server", "dist", "entry-http.js");

function usage() {
  console.log(`Ducky Coder

Usage:
  ducky web [--port 3030] [--host localhost] [--workspace PATH] [--no-open] [--build|--skip-build]
  ducky install [--bin-dir DIR]
  ducky --help | version

Options for "web":
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
    } else {
      throw new Error(`Unknown option "${a}". Run "ducky --help".`);
    }
  }
  if (!Number.isFinite(opts.port) || opts.port <= 0) throw new Error("Invalid --port");
  return opts;
}

function run(cmd, args) {
  console.log(`[ducky] ${[cmd, ...args].join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: repoRoot, stdio: "inherit" });
  if (r.error) throw new Error(`${cmd} failed: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed`);
}

function ensureBuilt(force) {
  const webOk = existsSync(join(webDist, "index.html"));
  const serverOk = existsSync(serverEntry);
  if (!force && webOk && serverOk) return;
  console.log("[ducky] building web + server (prod)...");
  run("pnpm", ["--filter", "@ducky/server", "build"]);
  run("pnpm", ["--filter", "@ducky/web", "build"]);
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
    if (existsSync(dest)) {
      const cur = await readlink(dest).catch(() => null);
      if (cur !== src) await unlink(dest);
    }
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
