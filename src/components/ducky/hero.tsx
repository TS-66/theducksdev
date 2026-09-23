"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useDuckyStore } from "@/lib/ducky/store";
import {
  FolderPlus,
  HardDrive,
  History,
  MessageCircleQuestion,
  Presentation,
  ScrollText,
  SquareTerminal,
} from "lucide-react";

interface HeroProps {
  onPick: (prompt: string, opts?: { planMode?: boolean }) => void;
  /** centered zcode-style composer slot (rendered by the page) */
  children?: React.ReactNode;
  /** active project, when one exists (drives the adaptive suggestions) */
  projectName?: string | null;
  projectFileCount?: number;
  /** open the create-project dialog */
  onNewProject?: () => void;
  /** connect a real local folder (File System Access API picker) */
  onConnectDisk?: () => void;
}

function greetingForHour(h: number): string {
  if (h >= 5 && h < 11) return "Morning, fresh start";
  if (h >= 11 && h < 14) return "Midday, keep it flowing";
  if (h >= 14 && h < 18) return "Afternoon, nice progress";
  if (h >= 18 && h < 23) return "Evening, nice work today";
  return "Night shift, quiet hours";
}

export function Hero({
  onPick,
  children,
  projectName = null,
  projectFileCount = 0,
  onNewProject,
  onConnectDisk,
}: HeroProps) {
  // client-only greeting: computed lazily on mount state (no render-phase effect)
  const [greeting] = React.useState(() =>
    typeof window === "undefined" ? "Hello there" : greetingForHour(new Date().getHours()),
  );

  const hasFiles = projectFileCount > 0;

  /** recent non-empty tasks to jump back into */
  const sessions = useDuckyStore((s) => s.sessions);
  const recent = React.useMemo(
    () =>
      sessions
        .filter((x) => x.messages.length > 0)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 3),
    [sessions],
  );

  /* dim one-line suggestions — adapt to whether the project has files */
  const dimList = hasFiles
    ? ([
        {
          icon: <ScrollText className="size-4 text-emerald-400" aria-hidden />,
          text: "Summarize this repository and identify its main packages",
          prompt: "Summarize this repository and identify its main packages",
        },
        {
          icon: <SquareTerminal className="size-4 text-red-400" aria-hidden />,
          text: "bash tree && head -n 12 README.md",
          prompt: "bash tree && head -n 12 README.md",
        },
        {
          icon: <Presentation className="size-4 text-orange-400" aria-hidden />,
          text: "Add a LICENSE file and a deploy script",
          prompt: "Add a LICENSE file and a deploy script",
        },
        {
          icon: <MessageCircleQuestion className="size-4 text-sky-400" aria-hidden />,
          text: `Interview me about the style of ${projectName ?? "this project"}`,
          prompt: "Interview me about the style of this project",
        },
      ] as const)
    : ([
        {
          icon: <FolderPlus className="size-4 text-[#FF7A1A]" aria-hidden />,
          text: "Create a project — empty, sample repo, or import your own folder",
          action: "new-project" as const,
        },
        {
          icon: <HardDrive className="size-4 text-cyan-400" aria-hidden />,
          text: "Connect a folder on your computer — read & edit real files",
          action: "connect-disk" as const,
        },
        {
          icon: <Presentation className="size-4 text-orange-400" aria-hidden />,
          text: "Write a checklist for a refactor I have in mind",
          prompt: "Write a checklist for a refactor I have in mind",
        },
        {
          icon: <MessageCircleQuestion className="size-4 text-sky-400" aria-hidden />,
          text: "Interview me about an idea before writing any code",
          prompt: "Interview me about an idea before writing any code",
        },
        {
          icon: <ScrollText className="size-4 text-emerald-400" aria-hidden />,
          text: "search the web for the latest ai coding agents",
          prompt: "search the web for the latest ai coding agents",
        },
      ] as const);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative flex min-h-full min-w-0 flex-col items-center justify-center overflow-hidden py-8 text-center"
    >
      {/* ambient orbs + faint mark */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="ducky-orb absolute left-1/2 top-2 size-72 -translate-x-1/2 rounded-full bg-[#FF7A1A]/[0.13] blur-[110px] md:size-[28rem]" />
        <div className="ducky-orb absolute left-[12%] top-44 size-56 rounded-full bg-violet-500/[0.13] blur-[90px] [animation-delay:-3s]" />
        <div className="ducky-orb absolute right-[10%] top-36 size-56 rounded-full bg-cyan-500/[0.12] blur-[90px] [animation-delay:-6s]" />
      </div>
      <img
        src="/ducky-mark.png"
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none absolute -top-8 left-1/2 size-60 -translate-x-1/2 select-none opacity-[0.06] md:size-80"
      />

      {/* eyebrow + headline */}
      <p className="ducky-fade-up relative mt-12 font-mono text-[11px] uppercase tracking-[0.28em] text-[#FF7A1A]/90 md:mt-16">
        {greeting} · ducky ai
      </p>
      <h1 className="ducky-headline ducky-fade-up t-display relative mt-3 max-w-3xl [animation-delay:80ms]">
        What are we building today?
      </h1>

      {/* project context line — quiet, honest about the empty slate */}
      <p className="ducky-fade-up relative z-10 mt-3 text-xs text-muted-foreground [animation-delay:140ms]">
        {projectName ? (
          hasFiles ? (
            <>
              working in{" "}
              <span className="font-mono text-[#FF7A1A]">{projectName}</span> · {projectFileCount}{" "}
              {projectFileCount === 1 ? "file" : "files"} seeded into new tasks
            </>
          ) : (
            <>
              working in{" "}
              <span className="font-mono text-[#FF7A1A]">{projectName}</span> · empty workspace —
              new tasks start blank
            </>
          )
        ) : (
          <>no project selected — new tasks start in an empty sandbox</>
        )}
      </p>

      {/* centered composer slot */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.16, ease: "easeOut" }}
        className="relative z-10 mt-7 w-full max-w-3xl px-4"
      >
        {children}
      </motion.div>

      {/* suggestion chips */}
      <div className="relative z-10 mt-4 flex w-full max-w-3xl flex-wrap items-center justify-center gap-2 px-4">
        {dimList.map((s) => (
          <button
            key={s.text}
            type="button"
            onClick={() => {
              if ("action" in s && s.action === "new-project") {
                onNewProject?.();
                return;
              }
              if ("action" in s && s.action === "connect-disk") {
                onConnectDisk?.();
                return;
              }
              if ("prompt" in s && s.prompt) onPick(s.prompt);
            }}
            title={s.text}
            className="group flex max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] py-1.5 pl-2.5 pr-3 backdrop-blur transition-all hover:-translate-y-px hover:border-[#FF7A1A]/50 hover:bg-[#FF7A1A]/[0.07] hover:shadow-[0_8px_24px_-12px_rgba(253,192,10,0.5)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span className="shrink-0 opacity-80">{s.icon}</span>
            <span className="truncate text-xs text-muted-foreground transition-colors group-hover:text-foreground">
              {s.text}
            </span>
          </button>
        ))}
      </div>

      {/* jump back in */}
      {recent.length > 0 && (
        <div className="relative z-10 mt-6 w-full max-w-3xl px-4">
          <p className="mb-2 flex items-center gap-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
            <History className="size-3" aria-hidden /> Jump back in
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {recent.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => useDuckyStore.getState().selectSession(s.id)}
                className="group rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-left transition-all hover:-translate-y-px hover:border-white/[0.15] hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <span className="block truncate text-[13px] font-medium group-hover:text-foreground">
                  {s.title}
                </span>
                <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                  {s.messages.filter((m) => m.role === "user" || m.role === "assistant").length} messages
                  {s.projectName ? ` · ${s.projectName}` : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

    </motion.div>
  );
}
