"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
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
}

/* dim one-line suggestions under the composer */
const DIM_LIST = [
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
    text: "Interview me about the greeting style",
    prompt: "Interview me about the greeting style",
  },
] as const;

/* bottom feature cards */
interface HeroCard {
  icon: React.ReactNode;
  title: string;
  desc: string;
  prompt: string;
  planMode?: boolean;
}

const CARDS: HeroCard[] = [
  {
    icon: <FilePenLine className="size-3.5 text-[#FDC00A]" aria-hidden />,
    title: "Live edit + diff",
    desc: "Change the default greeting to Howdy and watch the diff land.",
    prompt: "Change the default greeting to Howdy",
  },
  {
    icon: <History className="size-3.5 text-violet-400" aria-hidden />,
    title: "Plan mode + approval",
    desc: "Research first — exit_plan_mode asks for your sign-off.",
    prompt: "Refactor the greeting module to support i18n templates",
    planMode: true,
  },
  {
    icon: <History className="size-3.5 text-teal-400" aria-hidden />,
    title: "Plan with todos",
    desc: "Write a checklist for the refactor and follow the live cards.",
    prompt: "Write a checklist for the refactor",
  },
];

function greetingForHour(h: number): string {
  if (h >= 5 && h < 11) return "Morning, fresh start";
  if (h >= 11 && h < 14) return "Midday, keep it flowing";
  if (h >= 14 && h < 18) return "Afternoon, nice progress";
  if (h >= 18 && h < 23) return "Evening, nice work today";
  return "Night shift, quiet hours";
}

export function Hero({ onPick, children }: HeroProps) {
  // hydration-safe: deterministic server render, localized after mount
  const [greeting, setGreeting] = React.useState("Hello there");
  React.useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative flex min-h-full min-w-0 flex-col items-center justify-center overflow-hidden py-8 text-center"
    >
      {/* giant faint pixel-duck watermark — zcode-style backdrop */}
      <img
        src="/ducky-mark.png"
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none absolute -top-10 left-1/2 size-72 -translate-x-1/2 select-none opacity-[0.05] md:size-96"
      />

      {/* greeting */}
      <h1 className="relative mt-14 text-3xl font-bold tracking-tight text-foreground md:mt-20 md:text-4xl">
        {greeting}
      </h1>

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
          {DIM_LIST.map((s) => (
            <li key={s.prompt}>
              <button
                type="button"
                onClick={() => onPick(s.prompt)}
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
        {CARDS.map((c) => (
          <button
            key={c.title}
            type="button"
            onClick={() => onPick(c.prompt, c.planMode ? { planMode: true } : undefined)}
            className={cn(
              "group rounded-xl border bg-card/60 p-3.5 text-left shadow-sm transition-all",
              "hover:border-ring hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              c.planMode && "border-violet-500/25 hover:border-violet-400/50",
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
