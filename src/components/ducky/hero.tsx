"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useDuckyStore } from "@/lib/ducky/store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  FolderGit2,
  FolderPlus,
  FolderTree,
  HardDrive,
  History,
  House,
  MessageCircleQuestion,
  Presentation,
  ScrollText,
  SquareTerminal,
  X,
} from "lucide-react";

interface HeroProps {
  onPick: (prompt: string, opts?: { planMode?: boolean }) => void;
  children?: React.ReactNode;
  projectName?: string | null;
  projectFileCount?: number;
  onNewProject?: () => void;
  onConnectDisk?: () => void;
}

/** ZCode-style time-aware greeting (boundaries 5/9/12/14/18/23h). */
function greetingForHour(h: number): string {
  if (h >= 5 && h < 9) return "Good morning";
  if (h >= 9 && h < 12) return "Mid-morning flow";
  if (h >= 12 && h < 14) return "Good midday";
  if (h >= 14 && h < 18) return "Good afternoon";
  if (h >= 18 && h < 23) return "Good evening";
  return "Night shift";
}

/**
 * ZCode empty-state workspace pill (Apache-2.0, adapted): centered
 * rounded-full trigger with icon + title + chevron and hover-reveal detach;
 * dropdown with search, 5 recent projects, New / Connect / Work-outside rows.
 */
function WorkspacePill({
  onNewProject,
  onConnectDisk,
}: {
  onNewProject?: () => void;
  onConnectDisk?: () => void;
}) {
  const projects = useDuckyStore((s) => s.projects);
  const activeProjectId = useDuckyStore((s) => s.activeProjectId);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const active = projects.find((p) => p.id === activeProjectId) ?? null;

  const recent = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects
      .filter((p) => (!q || p.name.toLowerCase().includes(q)))
      .slice(0, 5);
  }, [projects, query]);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery(""); }}>
      <div className="group/pill relative inline-flex">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Select workspace"
            className="flex max-w-72 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-1.5 pl-3 pr-8 backdrop-blur transition-colors hover:border-[#FF7A1A]/40 hover:bg-[#FF7A1A]/[0.06]"
          >
            {active ? (
              <FolderGit2 className="size-3.5 shrink-0 text-[#FF7A1A]" aria-hidden />
            ) : (
              <House className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span className={cn("truncate text-xs", active ? "text-foreground" : "italic text-muted-foreground")}>
              {active ? active.name : "No project — sandbox"}
            </span>
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </PopoverTrigger>
        {active && (
          <button
            type="button"
            aria-label="Work outside project"
            title="Detach — new tasks start blank"
            onClick={() => {
              useDuckyStore.getState().selectProject(null);
              toast.info("Detached", { description: "New tasks start in an empty sandbox." });
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/pill:opacity-100 focus-visible:opacity-100"
          >
            <X className="size-3" aria-hidden />
          </button>
        )}
      </div>
      <PopoverContent align="center" className="w-72 p-1.5">
        <div className="px-1 pb-1.5">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects…"
            aria-label="Search projects"
            className="h-8 text-xs"
          />
        </div>
        {recent.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            {query ? `No projects match “${query}”.` : "No projects yet — create one below."}
          </p>
        ) : (
          <ul className="custom-scrollbar max-h-56 overflow-y-auto">
            {recent.map((p) => {
              const isActive = p.id === activeProjectId;
              const n = Object.keys(p.files).length;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      useDuckyStore.getState().selectProject(p.id);
                      toast.success(`Project → ${p.name}`);
                      setOpen(false);
                    }}
                    aria-pressed={isActive}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent",
                      isActive && "bg-accent/70",
                    )}
                  >
                    <FolderTree className={cn("size-3.5 shrink-0", isActive ? "text-[#FF7A1A]" : "text-muted-foreground")} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{p.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">{n}</span>
                    {isActive && <Check className="size-3.5 shrink-0 text-[#FF7A1A]" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-1 border-t pt-1">
          <button
            type="button"
            onClick={() => { setOpen(false); onNewProject?.(); }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-accent"
          >
            <FolderPlus className="size-3.5 text-[#FF7A1A]" aria-hidden /> New project…
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); onConnectDisk?.(); }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-accent"
          >
            <HardDrive className="size-3.5 text-cyan-400" aria-hidden /> Connect a local folder
          </button>
          {active && (
            <button
              type="button"
              onClick={() => {
                useDuckyStore.getState().selectProject(null);
                toast.info("Detached", { description: "New tasks start in an empty sandbox." });
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <House className="size-3.5" aria-hidden /> Work outside project
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
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
      {/* workspace pill — ZCode empty-state chrome, drives the composer below */}
      <div className="relative z-10 mt-4 flex justify-center">
        <WorkspacePill onNewProject={onNewProject} onConnectDisk={onConnectDisk} />
      </div>

      {/* composer */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.12, ease: "easeOut" }}
        className="mt-4 w-full"
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
