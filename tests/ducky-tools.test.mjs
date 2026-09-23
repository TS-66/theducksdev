#!/usr/bin/env node
/**
 * Ducky AI | Coder — tool executor test harness.
 *
 * Executes EVERY registered tool against an in-memory fake context and asserts
 * real behavior (writes, edits, diffs, searches, memory, notes, browser tabs,
 * codecs, skills). Environment-dependent tools (screen/clipboard/download)
 * must fail GRACEFULLY with a clear message — that counts as SKIP, not FAIL.
 *
 * Run:  node tests/ducky-tools.test.mjs
 * Needs Node ≥ 22.6 (TypeScript type-stripping for the ../src imports).
 */

const results = [];
const ok = (name, detail = "") => results.push({ status: "ok", name, detail });
const skip = (name, reason) => results.push({ status: "skip", name, detail: reason });
const fail = (name, err) => results.push({ status: "fail", name, detail: String((err && err.message) || err) });

async function expectThrow(fn, label) {
  try {
    await fn();
  } catch {
    return true;
  }
  throw new Error(`${label}: expected a throw, got success`);
}

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

/* ------------------------------- fake ctx -------------------------------- */

const SEED = {
  "src/app.ts": "const x = 1;\nconsole.log(x);\n",
  "src/util.ts": "export const y = 2;\n",
  "README.md": "# Hi\n\nSome text here.\n",
  "data/config.json": '{"a":{"b":[1,2,3]},"name":"ducky"}',
};

function makeCtx() {
  const files = new Map(Object.entries(SEED));
  const mems = [];
  const notes = new Map();
  let todos = [];
  let n = 0;
  const settings = {
    policy: "ask",
    temperature: 1,
    maxTokens: 8192,
    maxToolIterations: 25,
    showReasoning: true,
  };
  const created = [];
  const renamed = [];
  return {
    ctx: {
      sessionId: "test-session",
      readFile: (p) => (files.has(p) ? files.get(p) : null),
      writeFile: (p, c) => void files.set(p, c),
      deleteFileEntry: (p) => files.delete(p),
      listWorkspaceFiles: () => [...files.keys()].sort(),
      readWorkspaceSnapshot: () => Object.fromEntries(files),
      getCwd: () => "",
      setCwd: () => {},
      syncWorkspace: (next) => {
        files.clear();
        for (const [k, v] of Object.entries(next)) files.set(k, v);
      },
      setTodos: (t) => void (todos = t),
      webSearch: async () => "WEBSEARCH-STUB",
      webFetch: async (url) => `FETCHED-TEXT-FOR:${url}`,
      visionDescribe: async () => "VISION-STUB-DESCRIPTION",
      saveMemoryText: (t) => {
        const m = { id: `mem_${n++}_${Math.random().toString(36).slice(2)}`, text: t, createdAt: Date.now() };
        mems.push(m);
        return m.id;
      },
      listMemoryEntries: () => mems.map((m) => ({ ...m })),
      forgetMemoryEntry: (prefix) => {
        const i = mems.findIndex((m) => m.id.startsWith(prefix));
        if (i === -1) return false;
        mems.splice(i, 1);
        return true;
      },
      writeSessionNote: (name, content) => {
        notes.set(name, content);
        return { name, chars: content.length };
      },
      readSessionNote: (name) => (notes.has(name) ? notes.get(name) : null),
      listSessionNotes: () => [...notes.entries()].map(([name, c]) => ({ name, chars: c.length, updatedAt: 1 })),
      getSessionStats: () => ({
        title: "test",
        promptTokens: 10,
        completionTokens: 20,
        toolCalls: 3,
        messages: 4,
        files: files.size,
      }),
      getTranscript: () => [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello", tools: ["calc"] },
      ],
      getPublicSettings: () => ({
        policy: "ask",
        temperature: 1,
        maxTokens: 8192,
        maxToolIterations: 25,
        showReasoning: true,
        model: "ducky-3.5-coder",
      }),
      updatePublicSettings: (patch) => {
        Object.assign(settings, patch);
        return Object.keys(patch);
      },
      listSessionsBrief: () => [
        { id: "sess_aaa111", title: "first", messages: 2, files: 3, updatedAt: 5 },
        { id: "test-session", title: "test", messages: 4, files: files.size, updatedAt: 9 },
      ],
      createSessionNamed: (title) => {
        created.push(title);
        return `sess_new${created.length}`;
      },
      renameSessionById: (prefix, title) => {
        if (!"sess_aaa111".startsWith(prefix) && prefix !== "sess_aaa111") return false;
        renamed.push(title);
        return true;
      },
      switchSessionById: (prefix) => "sess_aaa111".startsWith(prefix),
    },
    files,
  };
}

/* --------------------------------- runner --------------------------------- */

// DUCKY_TEST_LIB points at compiled JS (see `npm run test:tools`): extensionless
// TS imports don't resolve under plain Node, so we compile the pure lib chain
// with tsc first. Default falls back to source for runtimes that strip types.
const LIB = process.env.DUCKY_TEST_LIB || "../src/lib/ducky";
const EXT = process.env.DUCKY_TEST_LIB ? "js" : "ts";
const { buildToolDefinitions, TOOL_EXECUTOR_BUILDERS, PLUGINS } = await import(
  `${LIB}/plugins.${EXT}`
);
const extra = await import(`${LIB}/tools-extra.${EXT}`);
const memory = await import(`${LIB}/memory.${EXT}`);
const skills = await import(`${LIB}/skills.${EXT}`);
const btabs = await import(`${LIB}/browser-tabs.${EXT}`);

const run = async (name, fn) => {
  try {
    await fn();
    ok(name);
  } catch (e) {
    fail(name, e);
  }
};

const runEnv = async (name, fn) => {
  try {
    await fn();
    fail(name, new Error("expected environment-graceful throw, got success"));
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/needs a real browser|unavailable|secure context|permission|denied|getDisplayMedia|screen sharing/i.test(msg)) {
      skip(name, msg.slice(0, 90));
    } else {
      fail(name, e);
    }
  }
};

/* ------------------------------ registry checks --------------------------- */

await run("registry: counts (84 tools, 28 plugins)", async () => {
  const defs = buildToolDefinitions();
  assert(defs.length >= 84, `only ${defs.length} tools`);
  assert(PLUGINS.length >= 28, `only ${PLUGINS.length} plugins`);
});

await run("registry: every tool has an executor (except loop special-cases)", async () => {
  const special = new Set(["ask_user_question", "exit_plan_mode", "subagent"]);
  const missing = buildToolDefinitions()
    .map((d) => d.name)
    .filter((n) => !TOOL_EXECUTOR_BUILDERS[n] && !special.has(n));
  assert(missing.length === 0, `missing executors: ${missing.join(",")}`);
});

await run("registry: every executor has a schema", async () => {
  const names = new Set(buildToolDefinitions().map((d) => d.name));
  const orphan = Object.keys(TOOL_EXECUTOR_BUILDERS).filter((n) => !names.has(n));
  assert(orphan.length === 0, `orphan executors: ${orphan.join(",")}`);
});

/* --------------------------------- fs core -------------------------------- */

{
  const { ctx } = makeCtx();
  const ex = (n) => TOOL_EXECUTOR_BUILDERS[n](ctx);

  await run("read_file + window", async () => {
    const out = await ex("read_file")({ path: "src/app.ts", offset: 2, limit: 1 });
    assert(out.includes("console.log"), `unexpected: ${out}`);
    await expectThrow(() => ex("read_file")({ path: "nope.ts" }), "missing file");
  });
  await run("write_file + edit_file", async () => {
    await ex("write_file")({ path: "a.txt", content: "hello world" });
    await ex("edit_file")({ path: "a.txt", old_str: "world", new_str: "ducky" });
    assert(ctx.readFile("a.txt") === "hello ducky", "edit not applied");
    await expectThrow(() => ex("edit_file")({ path: "a.txt", old_str: "zzz", new_str: "q" }), "bad old_str");
  });
  await run("glob + grep", async () => {
    const g = await ex("glob")({ pattern: "**/*.ts" });
    assert(g.includes("src/app.ts"), `glob: ${g}`);
    const r = await ex("grep")({ pattern: "console", max_results: 10 });
    assert(r.includes("src/app.ts"), `grep: ${r}`);
  });
  await run("bash chain + redirect", async () => {
    const out = await ex("bash")({ command: "echo hello > out.txt && cat out.txt" });
    assert(out.includes("hello"), `bash: ${out}`);
    assert(ctx.readFile("out.txt").trim() === "hello", "redirect not persisted");
  });
  await run("todo_write validation", async () => {
    const out = await ex("todo_write")({ todos: [{ content: "do it", status: "in_progress" }] });
    assert(out.includes("1 items"), out);
    await expectThrow(() => ex("todo_write")({ todos: [{ content: "x", status: "bogus" }] }), "bad status");
  });
}

/* --------------------------------- fs-plus -------------------------------- */

{
  const { ctx } = makeCtx();
  const ex = (n) => TOOL_EXECUTOR_BUILDERS[n](ctx);

  await run("list_files root + subdir", async () => {
    const root = await ex("list_files")({});
    assert(root.includes("src/") && root.includes("README.md"), root);
    const sub = await ex("list_files")({ path: "src" });
    assert(sub.includes("app.ts") && !sub.includes("README"), sub);
  });
  await run("file_info", async () => {
    const out = await ex("file_info")({ path: "src/app.ts" });
    assert(out.includes("3 lines") && out.includes("bytes"), out);
    await expectThrow(() => ex("file_info")({ path: "nope" }), "missing");
  });
  await run("copy/move/delete/append", async () => {
    await ex("copy_file")({ from: "README.md", to: "README.bak.md" });
    assert(ctx.readFile("README.bak.md") === ctx.readFile("README.md"), "copy mismatch");
    await ex("append_file")({ path: "README.bak.md", content: "\n tail" });
    assert(ctx.readFile("README.bak.md").endsWith(" tail"), "append mismatch");
    await ex("move_file")({ from: "README.bak.md", to: "docs/moved.md" });
    assert(ctx.readFile("README.bak.md") === null && ctx.readFile("docs/moved.md") !== null, "move broken");
    await ex("delete_file")({ path: "docs/moved.md" });
    assert(ctx.readFile("docs/moved.md") === null, "delete broken");
    await expectThrow(() => ex("delete_file")({ path: "docs/moved.md" }), "double delete");
    await expectThrow(() => ex("move_file")({ from: "README.md", to: "src/app.ts" }), "clobber guard");
  });
  await runEnv("download_file (needs DOM)", async () => {
    await ex("download_file")({ path: "README.md" });
  });
}

/* ---------------------------------- patch --------------------------------- */

{
  const { ctx } = makeCtx();
  const ex = (n) => TOOL_EXECUTOR_BUILDERS[n](ctx);

  await run("multi_edit ordered", async () => {
    await ex("write_file")({ path: "m.txt", content: "aaa bbb ccc" });
    const out = await ex("multi_edit")({
      path: "m.txt",
      edits: [
        { old_str: "aaa", new_str: "111" },
        { old_str: "ccc", new_str: "333" },
      ],
    });
    assert(ctx.readFile("m.txt") === "111 bbb 333", ctx.readFile("m.txt"));
    assert(out.includes("2 item"), out);
    await expectThrow(
      () => ex("multi_edit")({ path: "m.txt", edits: [{ old_str: "zzz", new_str: "q" }] }),
      "bad edit",
    );
  });
  await run("create_files batch", async () => {
    const out = await ex("create_files")({
      files: [
        { path: "n1.txt", content: "one" },
        { path: " deep/n2.txt ", content: "two" },
      ],
    });
    assert(ctx.readFile("n1.txt") === "one" && ctx.readFile("deep/n2.txt") === "two", "batch broken");
    assert(out.includes("2 file"), out);
  });
  await run("diff_files", async () => {
    await ex("write_file")({ path: "d1.txt", content: "a\nb\nc\n" });
    await ex("write_file")({ path: "d2.txt", content: "a\nB\nc\nd\n" });
    const same = await ex("diff_files")({ a: "d1.txt", b: "d1.txt" });
    assert(same.includes("identical"), same);
    const diff = await ex("diff_files")({ a: "d1.txt", b: "d2.txt" });
    assert(diff.includes("- b") && diff.includes("+ B") && diff.includes("+ d"), diff);
  });
}

/* ------------------------------- computer use ----------------------------- */

{
  const { ctx } = makeCtx();
  await runEnv("screen_capture (needs share picker)", async () => {
    await TOOL_EXECUTOR_BUILDERS.screen_capture(ctx)({});
  });
}

/* -------------------------------- browser use ----------------------------- */

{
  const { ctx } = makeCtx();
  const ex = (n) => TOOL_EXECUTOR_BUILDERS[n](ctx);
  btabs.__resetTabs();

  await run("browser open/tabs/snapshot/close", async () => {
    const opened = await ex("browser_open")({ url: "https://example.com/docs" });
    assert(opened.includes("example.com"), opened);
    const tabs = await ex("browser_tabs")({});
    assert(tabs.includes("example.com") && tabs.includes("●"), tabs);
    const snap = await ex("browser_snapshot")({});
    assert(snap.includes("FETCHED-TEXT-FOR:https://example.com/docs"), snap.slice(0, 120));
    const closed = await ex("browser_close")({ tab_id: tabs.match(/^● (\S+)/)?.[1] ?? "xxx" });
    assert(closed.includes("closed"), closed);
    const empty = await ex("browser_tabs")({});
    assert(empty.includes("No browser tabs"), empty);
  });
  await run("browser validation errors", async () => {
    await expectThrow(() => ex("browser_open")({ url: "ftp://x" }), "bad scheme");
    await expectThrow(() => ex("browser_snapshot")({}), "no tabs");
    await expectThrow(() => ex("browser_close")({ tab_id: "zzz" }), "unknown tab");
  });
  await run("browser_open outside modes", async () => {
    // real-browser mode without a DOM fails gracefully
    await expectThrow(() => ex("browser_open")({ url: "https://example.com", outside: true }), "no DOM");
  });
  // real-browser mode with a stubbed window
  {
    const hadWindow = typeof globalThis.window !== "undefined";
    const prev = globalThis.window;
    let opened = null;
    let blocked = false;
    globalThis.window = {
      open: (url) => {
        opened = String(url);
        return blocked ? null : {};
      },
    };
    try {
      const okMsg = await ex("browser_open")({ url: "https://example.com/real", outside: true });
      assert(opened === "https://example.com/real" && okMsg.includes("REAL browser"), okMsg);
      blocked = true;
      const blockedMsg = await ex("browser_open")({ url: "https://example.com/blocked", outside: true });
      assert(blockedMsg.includes("BLOCKED"), blockedMsg);
    } finally {
      if (hadWindow) globalThis.window = prev;
      else delete globalThis.window;
    }
  }
  btabs.__resetTabs();
}

/* ------------------------------- memory/notes ----------------------------- */

{
  const { ctx } = makeCtx();
  const ex = (n) => TOOL_EXECUTOR_BUILDERS[n](ctx);

  await run("memory save/list/forget", async () => {
    const saved = await ex("memory_save")({ text: "user prefers tabs" });
    assert(saved.includes("Remembered"), saved);
    const listed = await ex("memory_list")({});
    assert(listed.includes("user prefers tabs"), listed);
    const id = listed.split(" ")[0];
    const f = await ex("memory_forget")({ id });
    assert(f.includes("Forgotten"), f);
    await expectThrow(() => ex("memory_forget")({ id: "nope1234" }), "unknown id");
  });
  await run("notes write/read/list", async () => {
    // names are slugified by the real backend — the fake ctx stores raw, so
    // write with an already-slug name like production callers do
    await ex("note_write")({ name: "findings", content: "it works" });
    const r = await ex("note_read")({ name: "findings" });
    assert(r === "it works", r);
    const l = await ex("note_list")({});
    assert(l.includes("findings"), l);
    await expectThrow(() => ex("note_read")({ name: "missing" }), "unknown note");
  });
  await run("memory module direct (fallback store)", async () => {
    const e = memory.saveMemory("direct fact");
    assert(memory.listMemories().some((m) => m.id === e.id), "not listed");
    assert(memory.forgetMemory(e.id.slice(0, 8)) === true, "not forgotten");
    assert(memory.renderMemoriesForPrompt(5) === "", "not empty after forget... (other tests may add)");
  });
}

/* ------------------------------ session/meta ------------------------------ */

{
  const { ctx } = makeCtx();
  const ex = (n) => TOOL_EXECUTOR_BUILDERS[n](ctx);

  await run("session_stats + session_export", async () => {
    const s = await ex("session_stats")({});
    assert(s.includes("tool calls: 3") && s.includes("tokens"), s);
    const t = await ex("session_export")({});
    assert(t.includes("## user") && t.includes("## ducky"), t.slice(0, 80));
  });
  await run("calc exactness", async () => {
    assert((await ex("calc")({ expression: "2+3*4" })).endsWith("= 14"), "precedence");
    assert((await ex("calc")({ expression: "(12.5*8 - 3^2) / sqrt(16)" })).endsWith("= 22.75"), "combo");
    await expectThrow(() => ex("calc")({ expression: "1/0" }), "div0");
    await expectThrow(() => ex("calc")({ expression: "frobnicate(2)" }), "unknown fn");
  });
  await run("base64/sha256/json", async () => {
    const enc = await ex("base64_encode")({ text: "héllo wörld ✓" });
    const dec = await ex("base64_decode")({ text: enc });
    assert(dec === "héllo wörld ✓", "unicode roundtrip");
    await expectThrow(() => ex("base64_decode")({ text: "!!!not-b64!!!" }), "bad b64");
    const h = await ex("sha256")({ text: "abc" });
    assert(h === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", `sha: ${h}`);
    const p = await ex("json_parse")({ text: '{"x":1}' });
    assert(p.includes("Valid JSON"), p);
    await expectThrow(() => ex("json_parse")({ text: "{oops" }), "bad json");
    const q = await ex("json_query")({ text: '{"a":{"b":[1,2,3]}}', path: "a.b[1]" });
    assert(q.trim() === "2", `query: ${q}`);
    await expectThrow(() => ex("json_query")({ text: '{"a":1}', path: "a.b.c" }), "path miss");
  });
  await run("now/uuid/token", async () => {
    const n = await ex("now")({});
    assert(n.includes("UTC:") && n.includes("unix:"), n);
    const u = await ex("uuid")({ count: 3 });
    const lines = u.split("\n");
    assert(lines.length === 3 && lines.every((l) => /^[0-9a-f-]{36}$/.test(l)), u);
    const tok = await ex("random_token")({ bytes: 16 });
    assert(tok.length === 22 && /^[A-Za-z0-9_-]+$/.test(tok), `token: ${tok}`);
  });
  await run("web stubs + notify fallback", async () => {
    assert((await ex("web_search")({ query: "x" })) === "WEBSEARCH-STUB", "search stub");
    assert((await ex("web_fetch")({ url: "https://x" })).includes("FETCHED"), "fetch stub");
    assert((await ex("vision_describe")({ path: "README.md" })) === "VISION-STUB-DESCRIPTION", "vision stub");
    const note = await ex("notify_user")({ title: "done", body: "all good" });
    assert(typeof note === "string" && note.length > 0, "notify empty");
  });
  await run("skills list/show", async () => {
    const l = await ex("skill_list")({});
    assert(l.includes("code-review") && l.split("\n").length >= 8, l.slice(0, 60));
    const s = await ex("skill_show")({ name: "debug" });
    assert(s.includes("# Skill: debug"), s.slice(0, 60));
    await expectThrow(() => ex("skill_show")({ name: "nope" }), "unknown skill");
  });
}

/* --------------------------- config + sessions -------------------------- */

{
  const { ctx } = makeCtx();
  const ex = (n) => TOOL_EXECUTOR_BUILDERS[n](ctx);

  await run("get_config hides secrets", async () => {
    const out = await ex("get_config")({});
    assert(out.includes("policy: ask") && out.includes("temperature: 1"), out);
    assert(!/sk-|nvapi|AIza|gsk_/i.test(out), "secret leaked?");
  });
  await run("set_config validation + apply", async () => {
    const out = await ex("set_config")({ temperature: 0.2, policy: "auto" });
    assert(out.includes("temperature") && out.includes("policy"), out);
    await expectThrow(() => ex("set_config")({ policy: "yolo" }), "bad policy");
    await expectThrow(() => ex("set_config")({ temperature: 9 }), "temp range");
    await expectThrow(() => ex("set_config")({}), "empty patch");
  });
  await run("sessions list/new/rename/switch", async () => {
    const l = await ex("session_list")({});
    assert(l.includes("sess_aaa") && l.includes("test-ses") && l.includes("●current"), l);
    const nw = await ex("session_new")({ title: "parallel" });
    assert(nw.includes("sess_new") && nw.includes("parallel"), nw);
    const rn = await ex("session_rename")({ id: "sess_aaa1", title: "renamed!" });
    assert(rn.includes("renamed!"), rn);
    await expectThrow(() => ex("session_rename")({ id: "zzz", title: "x" }), "unknown rename");
    const sw = await ex("session_switch")({ id: "sess_aaa1" });
    assert(sw.includes("switched"), sw);
    await expectThrow(() => ex("session_switch")({ id: "zzz" }), "unknown switch");
  });
}

/* ------------------------- transforms + csv/stats ------------------------- */

{
  const { ctx } = makeCtx();
  const ex = (n) => TOOL_EXECUTOR_BUILDERS[n](ctx);

  await run("sort/dedupe/count", async () => {
    assert((await ex("sort_lines")({ text: "b\na\nc" })) === "a\nb\nc", "lexical");
    assert((await ex("sort_lines")({ text: "10\n2\n30", numeric: true })) === "2\n10\n30", "numeric");
    assert((await ex("sort_lines")({ text: "a\nb", reverse: true })) === "b\na", "reverse");
    const d = await ex("dedupe_lines")({ text: "a\nB\na\nb", ignore_case: true });
    assert(d.startsWith("a\nB\n") && d.includes("removed 2"), d);
    const c = await ex("count_words")({ text: "hi there\nsecond line" });
    assert(c.includes("words: 4") && c.includes("lines: 2"), c);
  });
  await run("regex_edit groups + flags", async () => {
    await ex("write_file")({ path: "r.txt", content: "foo 123 bar 456" });
    const out = await ex("regex_edit")({ path: "r.txt", pattern: "\\d+", replacement: "#", flags: "g" });
    assert(ctx.readFile("r.txt") === "foo # bar #", ctx.readFile("r.txt"));
    assert(out.includes("2 replacement"), out);
    await ex("write_file")({ path: "r2.txt", content: "2026-09-22" });
    await ex("regex_edit")({ path: "r2.txt", pattern: "(\\d+)-(\\d+)-(\\d+)", replacement: "$3/$2/$1" });
    assert(ctx.readFile("r2.txt") === "22/09/2026", ctx.readFile("r2.txt"));
    await expectThrow(() => ex("regex_edit")({ path: "r2.txt", pattern: "([", replacement: "x" }), "bad regex");
    await expectThrow(
      () => ex("regex_edit")({ path: "r2.txt", pattern: "zzz", replacement: "x" }),
      "zero matches",
    );
  });
  await run("workspace_stats + preview_csv", async () => {
    await ex("write_file")({ path: "big.txt", content: "x".repeat(5000) });
    const s = await ex("workspace_stats")({});
    assert(s.includes("files") && s.includes("big.txt") && s.includes(".txt×"), s);
    await ex("write_file")({ path: "t.csv", content: 'name,age\n"doe, jane",30\nbob,25\nshort\n' });
    const p = await ex("preview_csv")({ path: "t.csv", rows: 10 });
    assert(p.includes("doe, jane") && p.includes("ragged"), p);
    await expectThrow(() => ex("preview_csv")({ path: "nope.csv" }), "missing csv");
  });
}

/* --------------------------- mcp + connection --------------------------- */

{
  const { ctx } = makeCtx();
  const ex = (n) => TOOL_EXECUTOR_BUILDERS[n](ctx);

  await run("mcp_servers empty guidance", async () => {
    const out = await ex("mcp_servers")({});
    assert(out.includes("No MCP servers"), out);
  });
  await run("mcp_list empty guidance", async () => {
    const out = await ex("mcp_list")({});
    assert(out.includes("No MCP servers"), out);
  });
  await run("mcp_call validation", async () => {
    await expectThrow(() => ex("mcp_call")({ server: "", tool: "x" }), "missing fields");
    await expectThrow(() => ex("mcp_call")({ server: "ghost", tool: "x", args: {} }), "unknown server");
    await expectThrow(() => ex("mcp_call")({ server: "s", tool: "t", args: [1] }), "args shape");
  });

  // stub fetch: one fake MCP bridge over Streamable HTTP
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert(String(url).includes("fake-bridge"), `unexpected url ${url}`);
    const body = JSON.parse(String(init?.body ?? "{}"));
    const payload =
      body.method === "tools/list"
        ? { jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "ping", description: "pong tool" }] } }
        : { jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "pong!" }] } };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const mcp = await import(`${LIB}/mcp.${EXT}`);
    mcp.addMcpServer("fake", "http://fake-bridge/mcp");
    await run("mcp bridge list/call over stubbed HTTP", async () => {
      const servers = await ex("mcp_servers")({});
      assert(servers.includes("fake"), servers);
      const list = await ex("mcp_list")({});
      assert(list.includes("fake / ping"), list);
      const out = await ex("mcp_call")({ server: "FAKE", tool: "ping", args: {} });
      assert(out.includes("pong!"), out);
    });
    await run("mcp module: registry + SSE parse", async () => {
      assert(mcp.listMcpServers().some((s) => s.name === "fake"), "registry");
      const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}\n\ndata: [DONE]\n';
      assert(Array.isArray(mcp.parseRpcPayload(sse).result.tools), "sse parse");
      let threw = false;
      try {
        mcp.addMcpServer("bad", "not-a-url");
      } catch {
        threw = true;
      }
      assert(threw, "bad url accepted");
      assert(mcp.removeMcpServer("zzz") === false, "bad remove");
      assert(mcp.removeMcpServer(mcp.listMcpServers()[0].id.slice(0, 6)) === true, "remove");
    });
  } finally {
    globalThis.fetch = realFetch;
  }

  // connection.ts over stubbed /api/models proxy
  const realFetch2 = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ models: [{ id: "a" }, { id: "b" }] }), { status: 200 });
  try {
    const conn = await import(`${LIB}/connection.${EXT}`);
    await run("connection: discover + test report", async () => {
      const models = await conn.discoverModels("https://x/v1", "k");
      assert(models.length === 2 && models[0].id === "a", "discover");
      const rep = await conn.testConnection("https://x/v1", "k");
      assert(rep.ok && rep.models === 2 && rep.latencyMs >= 0, JSON.stringify(rep));
      const bad = await conn.testConnection("", "");
      assert(!bad.ok, "empty should fail");
    });
  } finally {
    globalThis.fetch = realFetch2;
  }
}

/* ------------------------------ app updates ----------------------------- */

{
  const ver = await import(`${LIB}/app-version.${EXT}`);
  await run("updates: semver compare", async () => {
    assert(ver.isNewerTag("0.3.0", "v0.4.0") === true, "minor bump");
    assert(ver.isNewerTag("0.3.0", "0.3.0") === false, "equal");
    assert(ver.isNewerTag("0.4.0", "v0.3.9") === false, "older");
    assert(ver.isNewerTag("0.3.9", "v0.4.0") === true, "cross");
    assert(ver.isNewerTag("1.0.0", "v0.9.9") === false, "major guard");
    assert(ver.APP_VERSION === "0.3.0", `version drift: ${ver.APP_VERSION}`);
  });
  await run("updates: release check + dismissal", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ tag_name: "v9.9.9", name: "Future", html_url: "https://x", body: "notes", published_at: "2026-01-01" }),
        { status: 200 },
      );
    try {
      const rel = await ver.checkForUpdate("0.3.0");
      assert(rel && rel.tag === "v9.9.9" && rel.notes === "notes", "should flag");
      ver.dismissUpdate("v9.9.9");
      assert((await ver.checkForUpdate("0.3.0")) === null, "dismissal ignored");
      assert((await ver.checkForUpdate("v9.9.9")) === null, "same version quiet");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
  await run("updates: offline silence", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("offline");
    };
    try {
      assert((await ver.checkForUpdate("0.0.1")) === null, "should stay quiet offline");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
}

/* ------------------------------- this-pc -------------------------------- */

{
  const { ctx } = makeCtx();
  const ex = (n) => TOOL_EXECUTOR_BUILDERS[n](ctx);
  const pc = await import(`${LIB}/pc.${EXT}`);

  await run("pc_status without bridge", async () => {
    pc.clearPcConfig();
    let msg = "";
    try {
      await ex("pc_status")({});
    } catch (e) {
      msg = e.message;
    }
    assert(msg.includes("ducky bridge"), msg);
  });
  await run("pc_exec refuses destruction", async () => {
    pc.setPcConfig(3791, "t");
    let msg = "";
    try {
      await ex("pc_exec")({ command: "sudo rm -rf /" });
    } catch (e) {
      msg = e.message;
    }
    assert(msg.includes("refused"), msg);
  });
  await run("pc client over stubbed bridge", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (String(url).endsWith("/status")) {
        return new Response(JSON.stringify({ ok: true, root: "/home/u", platform: "linux", version: "0.3.0" }), { status: 200 });
      }
      if (String(url).endsWith("/exec")) {
        assert(body.token === "t", "token forwarded");
        return new Response(JSON.stringify({ ok: true, exitCode: 0, stdout: "hi-pc", stderr: "" }), { status: 200 });
      }
      if (String(url).endsWith("/ls")) {
        return new Response(JSON.stringify({ ok: true, entries: [{ path: "a.txt", dir: false, size: 3 }] }), { status: 200 });
      }
      if (String(url).endsWith("/read")) {
        return new Response(JSON.stringify({ ok: true, content: "data", bytes: 4, truncated: false }), { status: 200 });
      }
      if (String(url).endsWith("/write")) {
        return new Response(JSON.stringify({ ok: true, bytes: 4 }), { status: 200 });
      }
      return new Response("nope", { status: 404 });
    };
    try {
      pc.setPcConfig(3791, "t");
      const s = await ex("pc_status")({});
      assert(s.includes("/home/u"), s);
      const e = await ex("pc_exec")({ command: "echo hi" });
      assert(e.includes("hi-pc"), e);
      const l = await ex("pc_ls")({});
      assert(l.includes("a.txt"), l);
      const r = await ex("pc_read")({ path: "a.txt" });
      assert(r.includes("data"), r);
      const w = await ex("pc_write")({ path: "b.txt", content: "data" });
      assert(w.includes("4 bytes"), w);
      // registry + validation
      assert(pc.getPcConfig()?.port === 3791, "config roundtrip");
      pc.clearPcConfig();
      assert(pc.getPcConfig() === null, "unpair");
    } finally {
      globalThis.fetch = realFetch;
      pc.clearPcConfig();
    }
  });
  await run("pc real control over stubbed bridge", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (String(url).endsWith("/caps")) {
        return new Response(
          JSON.stringify({ ok: true, platform: "linux", display: ":0", screenshot: "scrot", input: "xdotool", inputUnlocked: true }),
          { status: 200 },
        );
      }
      if (String(url).endsWith("/screen")) {
        return new Response(JSON.stringify({ ok: true, image: "aVBORw0KGgo=", bytes: 8 }), { status: 200 });
      }
      const actions = ["/move", "/click", "/type", "/key"];
      if (actions.some((a) => String(url).endsWith(a))) {
        if (body.token !== "t") return new Response(JSON.stringify({ ok: false, error: "Bad token" }), { status: 401 });
        return new Response(JSON.stringify({ ok: true, message: "did it" }), { status: 200 });
      }
      return new Response("nope", { status: 404 });
    };
    try {
      pc.setPcConfig(3791, "t");
      const caps = await ex("pc_caps")({});
      assert(caps.includes("UNLOCKED"), caps);
      const shot = await ex("pc_screen")({});
      const imgPath = shot.match(/images\/[A-Za-z0-9_.-]+\.png/)?.[0] ?? "";
      assert(shot.includes("images/pc-screen-") && imgPath !== "" && ctx.readFile(imgPath) !== null, shot);
      assert((await ex("pc_move")({ x: 10, y: 20 })).includes("did it"), "move");
      assert((await ex("pc_click")({ x: 10, y: 20, button: "right" })).includes("did it"), "click");
      assert((await ex("pc_type")({ text: "hi" })).includes("did it"), "type");
      assert((await ex("pc_key")({ key: "Enter" })).includes("did it"), "key");
      await expectThrow(() => ex("pc_move")({ x: -5, y: 0 }), "coord guard");
      await expectThrow(() => ex("pc_click")({ x: 0, y: 0, button: "nuke" }), "button guard");
      await expectThrow(() => ex("pc_type")({ text: "" }), "empty type");
      await expectThrow(() => ex("pc_key")({ key: "" }), "empty key");
    } finally {
      globalThis.fetch = realFetch;
      pc.clearPcConfig();
    }
  });
  await run("pc announce + pointer registry", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (String(url).endsWith("/wiggle")) {
        return new Response(JSON.stringify({ ok: true, message: "Announced at 5,6." }), { status: 200 });
      }
      if (String(url).endsWith("/move") || String(url).endsWith("/click")) {
        return new Response(JSON.stringify({ ok: true, message: "did it" }), { status: 200 });
      }
      return new Response("nope", { status: 404 });
    };
    try {
      const pc = await import(`${LIB}/pc.${EXT}`);
      pc.__resetAiPointer();
      pc.setPcConfig(3791, "t");
      const a = await ex("pc_announce")({ x: 5, y: 6 });
      assert(a.includes("Announced"), a);
      const ptr = pc.getAiPointer();
      assert(ptr && ptr.action === "announce" && ptr.x === 5 && ptr.y === 6, JSON.stringify(ptr));
      const m = await ex("pc_move")({ x: 7, y: 8, announce: true });
      assert(m.includes("visible marker"), m);
      assert(pc.getAiPointer()?.action === "announce", "announce should be last");
      const m2 = await ex("pc_move")({ x: 1, y: 2 });
      assert(pc.getAiPointer()?.action === "move", "plain move records move");
      await expectThrow(() => ex("pc_announce")({ x: -1, y: 0 }), "coord guard");
    } finally {
      globalThis.fetch = realFetch;
      const pc = await import(`${LIB}/pc.${EXT}`);
      pc.clearPcConfig();
      pc.__resetAiPointer();
    }
  });
  await run("pc client: unreachable + bad token", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("down");
    };
    try {
      pc.setPcConfig(3791, "t");
      let msg = "";
      try {
        await ex("pc_status")({});
      } catch (e) {
        msg = e.message;
      }
      assert(msg.includes("unreachable") || msg.includes("badly"), msg);
    } finally {
      globalThis.fetch = realFetch;
      pc.clearPcConfig();
    }
  });
}

/* --------------------------- clipboard (stubbed) -------------------------- */

{
  const { ctx } = makeCtx();
  const ex = (n) => TOOL_EXECUTOR_BUILDERS[n](ctx);

  await runEnv("clipboard without API (graceful)", async () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      throw new Error("MARK-AVAILABLE");
    }
    await ex("clipboard_copy")({ text: "hi" });
  });

  // Node ≥21 ships a global navigator (userAgent only, no clipboard).
  // Try to attach a stub clipboard; skip cleanly when the object is sealed.
  let held = "";
  let stubbed = false;
  try {
    const nav = globalThis.navigator;
    if (nav && !nav.clipboard) {
      Object.defineProperty(nav, "clipboard", {
        value: {
          writeText: async (t) => void (held = String(t)),
          readText: async () => held,
        },
        configurable: true,
      });
      stubbed = typeof nav.clipboard?.writeText === "function";
    }
  } catch {
    stubbed = false;
  }
  if (stubbed) {
    await run("clipboard with stubbed API", async () => {
      const c = await ex("clipboard_copy")({ text: "paste me" });
      assert(c.includes("Copied 8 chars"), c);
      const r = await ex("clipboard_read")({});
      assert(r === "paste me", r);
    });
    try {
      delete globalThis.navigator.clipboard;
    } catch {
      // leave the harmless stub in place
    }
  } else {
    skip("clipboard with stubbed API", "navigator.clipboard not attachable here");
  }
}

/* ------------------------------ pure modules ------------------------------ */

await run("tools-extra direct: calc/parser edges", async () => {
  assert(extra.evaluateExpression("-2^2") === -4, "unary pow");
  assert(Math.abs(extra.evaluateExpression("sin(pi/2)") - 1) < 1e-9, "sin");
  assert(extra.evaluateExpression("max(3,7,2)") === 7, "max");
  let threw = false;
  try {
    extra.evaluateExpression("2+");
  } catch {
    threw = true;
  }
  assert(threw, "trailing op should throw");
});

await run("tools-extra direct: json path + diff", async () => {
  assert(extra.getJsonPath({ a: [{ b: 1 }] }, "$.a[0].b") === 1, "$-path");
  const d = extra.lineDiff("a\nb\n", "a\nc\n");
  assert(d.includes("- b") && d.includes("+ c"), d);
  assert(extra.lineDiff("same\n", "same\n").includes("identical"), "identical");
});

await run("skills module: 17 playbooks", async () => {
  assert(skills.SKILLS.length === 17, `got ${skills.SKILLS.length}`);
  assert(skills.getSkill("PLAN")?.name === "plan", "case-insensitive lookup");
  assert(skills.getSkill("mcp-integration")?.name === "mcp-integration", "mcp skill");
  assert(skills.getSkill("local-pc")?.name === "local-pc", "pc skill");
});

await run("browser-tabs module: registry", async () => {
  btabs.__resetTabs();
  const t = btabs.openTab("https://example.com/a");
  assert(btabs.listTabs().length === 1 && btabs.getActiveTab()?.id === t.id, "open/active");
  assert(btabs.setActiveTab(t.id.slice(0, 6))?.id === t.id, "prefix activate");
  assert(btabs.closeTab(t.id.slice(0, 6)) === true, "prefix close");
  assert(btabs.listTabs().length === 0, "not empty");
  let threw = false;
  try {
    btabs.openTab("not-a-url");
  } catch {
    threw = true;
  }
  assert(threw, "bad url should throw");
  btabs.__resetTabs();
});

/* --------------------------------- summary --------------------------------- */

const passed = results.filter((r) => r.status === "ok");
const skipped = results.filter((r) => r.status === "skip");
const failed = results.filter((r) => r.status === "fail");

console.log("\n── tool results ──");
for (const r of results) {
  const mark = r.status === "ok" ? "ok  " : r.status === "skip" ? "SKIP" : "FAIL";
  console.log(`${mark} ${r.name}${r.detail ? ` — ${r.detail.slice(0, 110)}` : ""}`);
}
console.log(
  `\n${passed.length} passed · ${skipped.length} skipped (env-gated) · ${failed.length} failed · ${buildToolDefinitions().length} tools / ${PLUGINS.length} plugins registered`,
);
process.exit(failed.length ? 1 : 0);
