"use client";

import * as React from "react";
import { SquareTerminal, X } from "lucide-react";
import { runShellCommand } from "@/lib/ducky/tools-bash";
import { useDuckyStore } from "@/lib/ducky/store";
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

  const run = (raw: string) => {
    const cmd = raw.trim();
    if (!cmd) return;
    if (cmd === "clear") {
      setLines([]);
      return;
    }
    historyRef.current.push(cmd);
    histIdxRef.current = -1;
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
        <span className="truncate font-mono text-[10px] text-muted-foreground/60">
          {cwd || "~"} · virtual workspace
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
              l.kind === "cmd" && "font-semibold text-[#FDC00A]",
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
          {cwd || "~"} ❯
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
