"use client";

import { motion } from "framer-motion";
import {
  BookOpenText,
  CloudUpload,
  PlugZap,
  Scale,
  ShieldCheck,
  SquareTerminal,
  TestTube2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Suggestion {
  icon: React.ReactNode;
  title: string;
  desc: string;
  prompt: string;
}

const SUGGESTIONS: Suggestion[] = [
  {
    icon: <BookOpenText className="size-4 text-[#4D6BFE]" aria-hidden />,
    title: "Explore the repo",
    desc: "Summarize this repository and identify its main packages",
    prompt: "Summarize this repository and identify its main packages",
  },
  {
    icon: <Scale className="size-4 text-[#4D6BFE]" aria-hidden />,
    title: "Add licensing & deploy",
    desc: "Add a LICENSE file and a deploy script",
    prompt: "Add a LICENSE file and a deploy script",
  },
  {
    icon: <TestTube2 className="size-4 text-[#4D6BFE]" aria-hidden />,
    title: "Write unit tests",
    desc: "Write unit tests for src/greet.ts, run them conceptually",
    prompt: "Write unit tests for src/greet.ts, run them conceptually",
  },
  {
    icon: <SquareTerminal className="size-4 text-[#4D6BFE]" aria-hidden />,
    title: "Try the shell",
    desc: "What does bash 'ls -la && cat README.md | head -n 20' return?",
    prompt: "What does bash 'ls -la && cat README.md | head -n 20' return?",
  },
];

interface HeroProps {
  /** no session exists yet — swap CTA emphasis */
  variant?: "welcome" | "empty-session";
  onPick: (prompt: string) => void;
  onNewTask: () => void;
}

export function Hero({ variant = "welcome", onPick, onNewTask }: HeroProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex min-h-full flex-col items-center justify-center py-10 text-center"
    >
      <h1 className="bg-gradient-to-r from-[#4D6BFE] to-purple-500 bg-clip-text font-mono text-5xl font-bold tracking-tight text-transparent md:text-6xl">
        ▚ dsh
      </h1>
      <p className="mt-3 text-sm italic text-muted-foreground md:text-base">
        Everything is a plugin.
      </p>
      <p className="mt-3 max-w-md px-4 text-xs leading-relaxed text-muted-foreground md:text-[13px]">
        A browser-native recreation of the deepseek-harness console — streaming DeepSeek models,
        a virtual workspace filesystem and permission gates, with your API key stored locally
        only.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
        <BadgeMini icon={<ShieldCheck className="size-3" />} label="Key stays local" />
        <BadgeMini icon={<PlugZap className="size-3" />} label="8 plugins" />
        <BadgeMini icon={<CloudUpload className="size-3" />} label="Vercel-ready" />
      </div>

      {variant === "empty-session" && (
        <Button onClick={onNewTask} className="mt-5">
          Start a new task
        </Button>
      )}

      <div className="mt-8 w-full max-w-xl px-4">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground/70">
          Try:
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.title}
              type="button"
              onClick={() => onPick(s.prompt)}
              className="group flex items-start gap-2.5 rounded-lg border bg-card/50 p-3 text-left shadow-sm transition-all hover:border-ring hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
