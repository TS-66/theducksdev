"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  FolderPlus,
  HardDrive,
  History,
  MessageCircleQuestion,
  Megaphone,
  Presentation,
  ScrollText,
  SquareTerminal,
  FilePenLine,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface HeroProps {
  onPick: (prompt: string, opts?: { planMode?: boolean }) => void;
  /** centered zcode-style composer slot (rendered by the page) */
  children?: React.ReactNode;
  /** active project, when one exists (drives the adaptive suggestions) */
  projectName?: string | null;
  projectFileCount?: number;
  /** open the create-project dialog */
  onNewProject?: () => void;
  /** one-click sample repo project */
  onUseSample?: () => void;
  /** connect a real local folder (File System Access API picker) */
  onConnectDisk?: () => void;
}

/* bottom feature cards — the first card adapts to the project state */
interface HeroCard {
  icon: React.ReactNode;
  title: string;
  desc: string;
  prompt?: string;
  action?: "new-project" | "use-sample";
  planMode?: boolean;
  violetTint?: boolean;
}

const CARDS_WITH_FILES: HeroCard[] = [
  {
    icon: <FilePenLine className="size-3.5 text-[#FDC00A]" aria-hidden />,
    title: "Live edit + diff",
    desc: "Ask for a change and watch the diff land.",
    prompt: "Change the default greeting to Howdy",
  },
  {
    icon: <History className="size-3.5 text-violet-400" aria-hidden />,
    title: "Plan mode + approval",
    desc: "Research first — exit_plan_mode asks for your sign-off.",
    prompt: "Plan a refactor of this project with clear phases",
    planMode: true,
    violetTint: true,
  },
  {
    icon: <History className="size-3.5 text-teal-400" aria-hidden />,
    title: "Plan with todos",
    desc: "Write a checklist for the refactor and follow the live cards.",
    prompt: "Write a checklist for the refactor",
  },
];

const CARDS_EMPTY: HeroCard[] = [
  {
    icon: <FolderPlus className="size-3.5 text-[#FDC00A]" aria-hidden />,
    title: "Bring your own project",
    desc: "Import a folder from disk — your files, your structure, sandboxed.",
    action: "new-project",
  },
  {
    icon: <FilePenLine className="size-3.5 text-[#FDC00A]" aria-hidden />,
    title: "Start from the sample repo",
    desc: "greeting-service: 7 TypeScript files with tests, ready to edit.",
    action: "use-sample",
  },
  {
    icon: <History className="size-3.5 text-teal-400" aria-hidden />,
    title: "Plan with todos",
    desc: "Write a checklist for a refactor and follow the live cards.",
    prompt: "Write a checklist for a refactor",
  },
];

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
  onUseSample,
  onConnectDisk,
}: HeroProps) {
  // hydration-safe: deterministic server render, localized after mount
  const [greeting, setGreeting] = React.useState("Hello there");
  React.useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  const hasFiles = projectFileCount > 0;

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
          icon: <FolderPlus className="size-4 text-[#FDC00A]" aria-hidden />,
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
      {/* giant faint pixel-duck watermark — zcode-style backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-6 size-72 -translate-x-1/2 rounded-full bg-[#FDC00A]/10 blur-[100px] md:size-96" />
        <div className="absolute left-1/4 top-40 size-48 rounded-full bg-violet-500/10 blur-[80px]" />
        <div className="absolute right-1/4 top-32 size-48 rounded-full bg-cyan-500/10 blur-[80px]" />
      </div>
      <img
        src="/ducky-mark.png"
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none absolute -top-10 left-1/2 size-72 -translate-x-1/2 select-none opacity-[0.05] md:size-96"
      />

      {/* greeting */}
      <h1 className="relative mt-14 bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-3xl font-bold tracking-tight text-transparent md:mt-20 md:text-5xl">
        {greeting}
      </h1>
      <p className="relative mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-[#FDC00A]/80">
        ducky ai · coder ide
      </p>

      {/* project context line — quiet, honest about the empty slate */}
      <p className="relative z-10 mt-2 text-xs text-muted-foreground">
        {projectName ? (
          hasFiles ? (
            <>
              working in{" "}
              <span className="font-mono text-[#FDC00A]">{projectName}</span> · {projectFileCount}{" "}
              {projectFileCount === 1 ? "file" : "files"} seeded into new tasks
            </>
          ) : (
            <>
              working in{" "}
              <span className="font-mono text-[#FDC00A]">{projectName}</span> · empty workspace —
              new tasks start blank
            </>
          )
        ) : (
          <>no project selected — new tasks start in an empty sandbox</>
        )}
      </p>

      {/* centered composer slot */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.08, ease: "easeOut" }}
        className="relative z-10 mt-9 w-full max-w-2xl px-4"
      >
        {children}
      </motion.div>

      {/* dim suggestion list */}
      <div className="relative z-10 mt-4 w-full max-w-2xl px-4">
        <ul className="space-y-0.5 text-left">
          {dimList.map((s) => (
            <li key={s.text}>
              <button
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
                className="group flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <span className="shrink-0 opacity-80">{s.icon}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground transition-colors group-hover:text-foreground">
                  {s.text}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* announcement line */}
      <div className="relative z-10 mt-6 flex max-w-xl items-start gap-2 px-6 text-left">
        <Megaphone className="mt-0.5 size-3.5 shrink-0 text-[#FDC00A]" aria-hidden />
        <p className="text-xs leading-relaxed text-muted-foreground">
          New for explorers: paste an image straight into chat and ask
          &ldquo;describe the image&rdquo; — vision analysis runs free while in beta.
        </p>
      </div>

      {/* bottom feature cards */}
      <div className="relative z-10 mt-3 grid w-full max-w-3xl grid-cols-1 gap-2 px-4 sm:grid-cols-3">
        {(hasFiles ? CARDS_WITH_FILES : CARDS_EMPTY).map((c) => (
          <button
            key={c.title}
            type="button"
            onClick={() => {
              if (c.action === "new-project") {
                onNewProject?.();
                return;
              }
              if (c.action === "use-sample") {
                onUseSample?.();
                return;
              }
              if (c.prompt) onPick(c.prompt, c.planMode ? { planMode: true } : undefined);
            }}
            className={cn(
              "group rounded-xl border bg-card/70 p-3.5 text-left shadow-sm backdrop-blur transition-all duration-200",
              "hover:-translate-y-0.5 hover:border-[#FDC00A]/40 hover:bg-accent hover:shadow-[0_12px_32px_-12px_rgba(253,192,10,0.35)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              c.violetTint && "border-violet-500/25 hover:border-violet-400/50",
            )}
          >
            <span className="flex items-center gap-1.5">
              {c.icon}
              <span className="truncate text-[13px] font-medium group-hover:text-foreground">
                {c.title}
              </span>
            </span>
            <span className="mt-1 block text-xs leading-snug text-muted-foreground">
              {c.desc}
            </span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
