"use client";

import * as React from "react";
import { Monitor, SquareTerminal, X } from "lucide-react";
import { runShellCommand } from "@/lib/ducky/tools-bash";
import { useDuckyStore } from "@/lib/ducky/store";
import { getPcConfig, pcExec } from "@/lib/ducky/pc";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Line {
  kind: "cmd" | "out" | "sys";
  text: string;
}

/**
 * ZCode-style bottom terminal: a real interactive prompt over the session's
 * virtual workspace (same mini-bash the agent uses). History, cwd tracking,
 * `clear` builtin. Remount per session via key={sessionId} from the parent.
 */
export function TerminalPanel({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const [lines, setLines] = React.useState<Line[]>([
    { kind: "sys", text: "ducky shell — virtual workspace. Try: ls, tree, cat README.md, echo hi > note.txt" },
  ]);
  const [cwd, setCwd] = React.useState("");
  const [mode, setMode] = React.useState<"workspace" | "pc">("workspace");
  const [pcCwd, setPcCwd] = React.useState(".");
  const [value, setValue] = React.useState("");
  const historyRef = React.useRef<string[]>([]);
  const histIdxRef = React.useRef(-1);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /** resolve a `cd` target against a root-relative cwd (tiny, no escapes past root) */
  const resolvePc = (cur: string, target: string): string => {
    const t = target.trim();
    if (!t || t === "/" || t === "~") return ".";
    const parts = (t.startsWith("/") ? t.slice(1) : `${cur === "." ? "" : `${cur}/`}${t}`).split("/");
    const stack: string[] = [];
    for (const p of parts) {
      if (!p || p === ".") continue;
      if (p === "..") stack.pop();
      else stack.push(p);
    }
    return stack.length ? stack.join("/") : ".";
  };

  const run = (raw: string) => {
    const cmd = raw.trim();
    if (!cmd) return;
    if (cmd === "clear") {
      setLines([]);
      return;
    }
    historyRef.current.push(cmd);
    histIdxRef.current = -1;

    /* ------- REAL PC via the bridge ------- */
    if (mode === "pc") {
      if (!getPcConfig()) {
        setLines((l) => [
          ...l.slice(-200),
          { kind: "cmd", text: `pc ❯ ${cmd}` },
          { kind: "out", text: "PC not connected — run `ducky bridge` on your machine, then paste its token in Settings → Connections → This PC." },
        ]);
        return;
      }
      const cdMatch = cmd.match(/^cd\s*(.*)$/);
      if (cdMatch) {
        const next = resolvePc(pcCwd, cdMatch[1] ?? "");
        setPcCwd(next);
        setLines((l) => [...l.slice(-200), { kind: "cmd", text: `pc:${pcCwd} ❯ ${cmd}` }]);
        return;
      }
      const shownCwd = pcCwd;
      setLines((l) => [...l.slice(-200), { kind: "cmd", text: `pc:${shownCwd} ❯ ${cmd}` }]);
      void pcExec(cmd, shownCwd)
        .then((r) => {
          const body = [r.stdout, r.stderr ? `\n[stderr]\n${r.stderr}` : ""].join("");
          setLines((l) => [
            ...l.slice(-200),
            { kind: "out", text: `[exit ${r.exitCode}]\n${body || "(no output)"}` },
          ]);
        })
        .catch((e: Error) => {
          setLines((l) => [...l.slice(-200), { kind: "out", text: `pc: ${e.message}` }]);
        });
      return;
    }

    /* ------- virtual workspace (default) ------- */
    const st = useDuckyStore.getState();
    const snapshot = st.readWorkspaceSnapshot(sessionId);
    let res;
    try {
      res = runShellCommand(cmd, snapshot, cwd);
    } catch (e) {
      setLines((l) => [...l.slice(-200), { kind: "cmd", text: `${cwd || "~"} ❯ ${cmd}` }, { kind: "out", text: `ducky: ${(e as Error).message}` }]);
      return;
    }
    st.replaceWorkspace(sessionId, snapshot);
    setCwd(res.cwd);
    setLines((l) => [
      ...l.slice(-200),
      { kind: "cmd", text: `${cwd || "~"} ❯ ${cmd}` },
      ...(res.stdout ? [{ kind: "out" as const, text: res.stdout }] : []),
    ]);
  };

  return (
    <div className="ducky-terminal flex h-60 shrink-0 flex-col border-t bg-[#0a0a0b]">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-white/5 px-3">
        <SquareTerminal className="size-3.5 text-emerald-400" aria-hidden />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          terminal
        </span>
        <div role="tablist" aria-label="Terminal target" className="flex items-center gap-0.5 rounded-md bg-white/[0.04] p-0.5">
          {(["workspace", "pc"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              title={m === "pc" ? "REAL machine via `ducky bridge`" : "Virtual workspace (safe sandbox)"}
              className={cn(
                "flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px]",
                mode === m ? "bg-white/[0.09] text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "pc" && <Monitor className="size-3" aria-hidden />}
              {m === "pc" ? "PC" : "sandbox"}
            </button>
          ))}
        </div>
        <span className="truncate font-mono text-[10px] text-muted-foreground/60">
          {mode === "pc" ? `${pcCwd} · REAL pc` : `${cwd || "~"} · virtual workspace`}
        </span>
        <button
          type="button"
          aria-label="Close terminal"
          onClick={onClose}
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div
        ref={bodyRef}
        role="log"
        aria-label="Terminal output"
        onClick={() => inputRef.current?.focus()}
        className="custom-scrollbar min-h-0 flex-1 cursor-text overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed"
      >
        {lines.map((l, i) => (
          <div
            key={i}
            className={cn(
              "whitespace-pre-wrap break-words",
              l.kind === "cmd" && "font-semibold text-[#FF7A1A]",
              l.kind === "sys" && "text-muted-foreground/70",
              l.kind === "out" && "text-foreground/85",
            )}
          >
            {l.text}
          </div>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-white/5 px-3 py-1.5">
        <span aria-hidden className="shrink-0 select-none font-mono text-xs text-emerald-400">
          {mode === "pc" ? `pc:${pcCwd}` : cwd || "~"} ❯
        </span>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              run(value);
              setValue("");
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              const h = historyRef.current;
              if (!h.length) return;
              histIdxRef.current =
                histIdxRef.current === -1 ? h.length - 1 : Math.max(0, histIdxRef.current - 1);
              setValue(h[histIdxRef.current] ?? "");
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              const h = historyRef.current;
              if (histIdxRef.current === -1) return;
              const nextIdx = histIdxRef.current + 1;
              if (nextIdx >= h.length) {
                histIdxRef.current = -1;
                setValue("");
              } else {
                histIdxRef.current = nextIdx;
                setValue(h[nextIdx] ?? "");
              }
            }
          }}
          aria-label="Terminal input"
          placeholder="ls · tree · cat · grep · echo … (clear wipes)"
          spellCheck={false}
          autoComplete="off"
          className="h-7 border-0 bg-transparent px-0 font-mono text-xs focus-visible:ring-0"
        />
      </div>
    </div>
  );
}
