"use client";

import { motion } from "framer-motion";
import {
  BookOpenText,
  ClipboardList,
  FilePenLine,
  Globe,
  ListTodo,
  MessageCircleQuestion,
  PlugZap,
  ServerCog,
  ShieldCheck,
  SquareTerminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Suggestion {
  icon: React.ReactNode;
  title: string;
  desc: string;
  prompt: string;
  /** toggles session plan mode before sending (for the exit_plan_mode flow) */
  planMode?: boolean;
  /** spans the full grid row (for headline capabilities) */
  fullWidth?: boolean;
}

const SUGGESTIONS: Suggestion[] = [
  {
    icon: <BookOpenText className="size-4 text-[#FDC00A]" aria-hidden />,
    title: "Explore the repo",
    desc: "Summarize this repository and identify its main packages",
    prompt: "Summarize this repository and identify its main packages",
  },
  {
    icon: <FilePenLine className="size-4 text-amber-400" aria-hidden />,
    title: "Live edit + diff",
    desc: "Change the default greeting to Howdy",
    prompt: "Change the default greeting to Howdy",
  },
  {
    icon: <ClipboardList className="size-4 text-violet-400" aria-hidden />,
    title: "Plan mode + approval",
    desc: "Drafts a plan, then exit_plan_mode asks for your sign-off",
    prompt: "Refactor the greeting module to support i18n templates",
    planMode: true,
  },
  {
    icon: <MessageCircleQuestion className="size-4 text-orange-400" aria-hidden />,
    title: "Interview me",
    desc: "ask_user_question collects your greeting preferences",
    prompt: "Interview me about the greeting style",
  },
  {
    icon: <ListTodo className="size-4 text-teal-400" aria-hidden />,
    title: "Plan with todos",
    desc: "Write a checklist for the refactor",
    prompt: "Write a checklist for the refactor",
  },
  {
    icon: <SquareTerminal className="size-4 text-emerald-400" aria-hidden />,
    title: "Try the shell",
    desc: "bash tree && head -n 12 README.md",
    prompt: "bash tree && head -n 12 README.md",
  },
  {
    icon: <Globe className="size-4 text-cyan-400" aria-hidden />,
    title: "Search the web — real results",
    desc: "web_search runs server-side via the plugin, no API key needed",
    prompt: "Search the web for the latest AI model releases",
    fullWidth: true,
  },
];

interface HeroProps {
  /** no session exists yet — swap CTA emphasis */
  variant?: "welcome" | "empty-session";
  onPick: (prompt: string, opts?: { planMode?: boolean }) => void;
  onNewTask: () => void;
}

export function Hero({ variant = "welcome", onPick, onNewTask }: HeroProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex min-h-full flex-col items-center justify-center py-6 text-center"
    >
      {/* The exact Ducky AI pixel-duck logo */}
      <motion.img
        src="/ducky-mark.png"
        alt="Ducky AI logo"
        initial={{ opacity: 0, scale: 0.9, rotate: -2 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="mb-4 size-24 rounded-2xl border border-[#FDC00A]/30 bg-black shadow-[0_0_40px_-8px_rgba(253,192,10,0.35)] md:size-28"
      />

      <h1 className="flex items-baseline justify-center gap-2 font-mono text-4xl font-bold tracking-tight md:text-5xl">
        <span className="bg-gradient-to-r from-[#FDC00A] to-[#F97316] bg-clip-text text-transparent">
          Ducky AI
        </span>
        <span aria-hidden className="text-2xl text-muted-foreground/50 md:text-3xl">
          |
        </span>
        <span className="text-foreground/90">Coder</span>
      </h1>
      <p className="mt-3 text-sm italic text-muted-foreground md:text-base">
        Everything is a plugin. Quack.
      </p>
      <p className="mt-2 max-w-md px-4 text-xs leading-relaxed text-muted-foreground md:text-[13px]">
        A browser-native coding agent console — streaming the <span className="font-semibold text-foreground/80">Ducky 3.5 Coder</span> model,
        a virtual workspace filesystem and permission gates, with your API key stored
        locally only.
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        <BadgeMini icon={<ShieldCheck className="size-3" />} label="Key stays local" />
        <BadgeMini icon={<PlugZap className="size-3" />} label="9 plugins" />
        <BadgeMini icon={<ServerCog className="size-3" />} label="AIHUBMIX-powered" />
      </div>

      {/* boot log strip — pure decoration */}
      <div
        aria-hidden
        className="mt-4 w-full max-w-md overflow-hidden rounded-md border bg-[#0d0d06] px-3 py-2 text-left font-mono text-[10px] leading-relaxed text-muted-foreground"
      >
        <p className="ducky-boot-line" style={{ animationDelay: "0.05s" }}>
          <span className="text-emerald-400">✓</span> ducky runtime ready
        </p>
        <p className="ducky-boot-line" style={{ animationDelay: "0.25s" }}>
          <span className="text-emerald-400">✓</span> 9 plugins loaded · tools registered
        </p>
        <p className="ducky-boot-line" style={{ animationDelay: "0.45s" }}>
          <span className="text-emerald-400">✓</span> virtual workspace mounted (/greeting-service)
        </p>
        <p className="ducky-boot-line" style={{ animationDelay: "0.55s" }}>
          <span className="text-emerald-400">✓</span> model: ducky-3.5-coder · neutron-3-ultra-550b @ aihubmix
        </p>
        <p className="ducky-boot-line text-[#FDC00A]" style={{ animationDelay: "0.75s" }}>
          ▸ awaiting your first task… quack
        </p>
      </div>

      {variant === "empty-session" && (
        <Button onClick={onNewTask} className="mt-4">
          Start a new task
        </Button>
      )}

      <div className="mt-5 w-full max-w-xl px-4">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground/70">
          Try:
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.title}
              type="button"
              onClick={() => onPick(s.prompt, s.planMode ? { planMode: true } : undefined)}
              className={cn(
                "group flex items-start gap-2.5 rounded-lg border bg-card/50 p-3 text-left shadow-sm transition-all hover:border-ring hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                s.planMode && "border-violet-500/30 hover:border-violet-400/60",
                s.fullWidth &&
                  "border-cyan-500/30 bg-cyan-500/[0.04] hover:border-cyan-400/60 hover:bg-cyan-500/[0.08] sm:col-span-2",
              )}
            >
              <span className="mt-0.5 shrink-0">{s.icon}</span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium group-hover:text-foreground">
                  {s.title}
                </span>
                <span className="block text-xs leading-snug text-muted-foreground">{s.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function BadgeMini({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
      {icon}
      {label}
    </span>
  );
}
