"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useDuckyStore } from "@/lib/ducky/store";
import {
  ArrowUpRight,
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
  children?: React.ReactNode;
  projectName?: string | null;
  projectFileCount?: number;
  onNewProject?: () => void;
  onConnectDisk?: () => void;
}

function greetingForHour(h: number): string {
  if (h >= 5 && h < 11) return "Good morning";
  if (h >= 11 && h < 14) return "Good midday";
  if (h >= 14 && h < 18) return "Good afternoon";
  if (h >= 18 && h < 23) return "Good evening";
  return "Night shift";
}

export function Hero({
  onPick,
  children,
  projectName = null,
  projectFileCount = 0,
  onNewProject,
  onConnectDisk,
}: HeroProps) {
  const [greeting] = React.useState(() =>
    typeof window === "undefined" ? "Hello there" : greetingForHour(new Date().getHours()),
  );

  const hasFiles = projectFileCount > 0;
  const sessions = useDuckyStore((s) => s.sessions);
  const recent = React.useMemo(
    () =>
      sessions
        .filter((x) => x.messages.length > 0)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 3),
    [sessions],
  );

  const actions = hasFiles
    ? ([
        {
          icon: <ScrollText className="size-4 text-emerald-400" aria-hidden />,
          title: "Summarize repo",
          text: "Packages, entry points, risks",
          prompt: "Summarize this repository and identify its main packages",
        },
        {
          icon: <SquareTerminal className="size-4 text-red-400" aria-hidden />,
          title: "Inspect workspace",
          text: "bash tree + README scan",
          prompt: "bash tree && head -n 12 README.md",
        },
        {
          icon: <Presentation className="size-4 text-orange-400" aria-hidden />,
          title: "Ship something",
          text: "LICENSE + deploy script",
          prompt: "Add a LICENSE file and a deploy script",
        },
        {
          icon: <MessageCircleQuestion className="size-4 text-sky-400" aria-hidden />,
          title: "Style interview",
          text: `Tune ${projectName ?? "this project"} with me`,
          prompt: "Interview me about the style of this project",
        },
      ] as const)
    : ([
        {
          icon: <FolderPlus className="size-4 text-[#FF7A1A]" aria-hidden />,
          title: "New project",
          text: "Empty, sample, or import",
          action: "new-project" as const,
        },
        {
          icon: <HardDrive className="size-4 text-cyan-400" aria-hidden />,
          title: "Connect folder",
          text: "Edit real files on disk",
          action: "connect-disk" as const,
        },
        {
          icon: <MessageCircleQuestion className="size-4 text-sky-400" aria-hidden />,
          title: "Brainstorm",
          text: "Interview me before code",
          prompt: "Interview me about an idea before writing any code",
        },
        {
          icon: <ScrollText className="size-4 text-emerald-400" aria-hidden />,
          title: "Research",
          text: "Latest AI coding agents",
          prompt: "search the web for the latest ai coding agents",
        },
      ] as const);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center px-4 py-10 text-center"
    >
      {/* logo */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative"
      >
        <img
          src="/ducky-mark.png"
          alt="Ducky"
          draggable={false}
          className="ducky-v3-logo-ring size-20 rounded-[22px] bg-black"
        />
        <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#FF7A1A]/40 bg-[#0d1117] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#FF7A1A]">
          Pond OS · v3
        </span>
      </motion.div>

      <p className="font-pixel mt-6 text-[10px] uppercase text-[#FF7A1A]">
        {greeting} · ducky ai
      </p>
      <h1 className="ducky-v3-headline mt-2 text-balance text-4xl font-extrabold leading-[1.04] md:text-5xl">
        What are we building today?
      </h1>
      <p className="mt-3 text-[13px] text-muted-foreground">
        {projectName ? (
          <>
            working in <span className="font-mono text-[#FF7A1A]">{projectName}</span> ·{" "}
            {projectFileCount} {projectFileCount === 1 ? "file" : "files"}
          </>
        ) : (
          <>sandbox ready — new chats start blank, tools armed</>
        )}
      </p>

      {/* composer */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.12, ease: "easeOut" }}
        className="mt-6 w-full"
      >
        {children}
      </motion.div>

      {/* action grid — the new style: 2x2 cards */}
      <div className="mt-4 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {actions.map((s) => (
          <button
            key={s.title}
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
            className="ducky-v3-action-card group flex items-center gap-3 rounded-2xl p-3 text-left"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-white/10">
              {s.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">{s.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{s.text}</span>
            </span>
            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/50 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#FF7A1A]" />
          </button>
        ))}
      </div>

      {/* recent */}
      {recent.length > 0 && (
        <div className="mt-6 w-full">
          <p className="mb-2 flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
            <History className="size-3" aria-hidden /> Jump back in
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {recent.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => useDuckyStore.getState().selectSession(s.id)}
                className="ducky-v3-action-card rounded-2xl p-3 text-left"
              >
                <span className="block truncate text-[13px] font-medium">{s.title}</span>
                <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                  {s.messages.filter((m) => m.role === "user" || m.role === "assistant").length} msgs
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
