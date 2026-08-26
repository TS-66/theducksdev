"use client";

import * as React from "react";
import { Command, Eye, FlaskConical, GitBranch, Hand, Plug, Wrench, Zap } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { PLUGINS } from "@/lib/dsh/plugins";
import { useDshStore } from "@/lib/dsh/store";
import { isDemoMode, type PermissionPolicy } from "@/lib/dsh/types";
import { clockHM, fmtK, shortId } from "./format";

const POLICY_ORDER: PermissionPolicy[] = ["readonly", "ask", "auto"];

const POLICY_META: Record<
  PermissionPolicy,
  { label: string; icon: React.ReactNode; nextHint: string }
> = {
  readonly: {
    label: "readOnly",
    icon: <Eye className="size-3" aria-hidden />,
    nextHint: "ask (approve side effects before they run)",
  },
  ask: {
    label: "ask",
    icon: <Hand className="size-3" aria-hidden />,
    nextHint: "auto (run everything without asking)",
  },
  auto: {
    label: "auto",
    icon: <Zap className="size-3" aria-hidden />,
    nextHint: "readonly (no writes at all)",
  },
};

export function StatusBar({
  onOpenPlugins,
  onOpenActivity,
  onOpenPalette,
}: {
  onOpenPlugins: () => void;
  onOpenActivity?: () => void;
  /** open the ⌘P command palette (status-bar affordance) */
  onOpenPalette?: () => void;
}) {
  const sessions = useDshStore((s) => s.sessions);
  const activeSessionId = useDshStore((s) => s.activeSessionId);
  const isRunning = useDshStore((s) => s.isRunning);
  const settings = useDshStore((s) => s.settings);
  const disabledPlugins = useDshStore((s) => s.disabledPlugins);

  const [now, setNow] = React.useState<string>("");
  React.useEffect(() => {
    const tick = () => setNow(clockHM());
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  // aggregate usage across all sessions
  const totals = sessions.reduce(
    (acc, s) => ({
      toolCalls: acc.toolCalls + s.stats.toolCalls,
      tokens: acc.tokens + s.stats.promptTokens + s.stats.completionTokens,
    }),
    { toolCalls: 0, tokens: 0 },
  );

  const enabledCount = PLUGINS.length - disabledPlugins.length;
  const policy = settings.policy;

  /** top 3 sessions by token usage, for the usage tooltip */
  const topSessions = React.useMemo(
    () =>
      [...sessions]
        .sort(
          (a, b) =>
            b.stats.promptTokens +
            b.stats.completionTokens -
            (a.stats.promptTokens + a.stats.completionTokens),
        )
        .slice(0, 3)
        .filter((s) => s.stats.promptTokens + s.stats.completionTokens > 0),
    [sessions],
  );

  const cyclePolicy = () => {
    const idx = POLICY_ORDER.indexOf(policy);
    const next = POLICY_ORDER[(idx + 1) % POLICY_ORDER.length];
    useDshStore.getState().updateSettings({ policy: next });
    toast.success(`Permission policy → ${POLICY_META[next].label}`, {
      description: `Next: ${POLICY_META[next].nextHint}`,
    });
  };

  return (
    <footer
      className="z-20 flex h-7 shrink-0 items-center justify-between gap-4 border-t bg-muted/40 px-3 font-mono text-[11px] text-muted-foreground"
      role="status"
      aria-label="Status bar"
    >
      {/* left */}
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span
            aria-hidden
            className={cn(
              "inline-block size-1.5 rounded-full",
              isRunning ? "dsh-pulse-dot bg-amber-400" : "bg-emerald-400",
            )}
          />
          {isRunning ? `Running… ${isDemoMode(settings) ? "demo-script" : settings.model}` : "Ready"}
        </span>
        <span className="truncate text-muted-foreground/60">
          #{shortId(activeSessionId)}
        </span>
        {onOpenActivity && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onOpenActivity}
                className="flex items-center gap-1 rounded border border-border/70 bg-background px-1.5 py-px transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="Open activity timeline (⌘E)"
              >
                <GitBranch className="size-3 rotate-90" aria-hidden /> main
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              Activity timeline — ledger of every prompt, tool call and file change (⌘E)
            </TooltipContent>
          </Tooltip>
        )}
        {onOpenPalette && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onOpenPalette}
                className="hidden items-center gap-1 rounded border border-border/70 bg-background px-1.5 py-px transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:flex"
                aria-label="Open command palette (⌘P)"
              >
                <Command className="size-3" aria-hidden /> ⌘P
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              Command palette — jump between sessions, files and commands
            </TooltipContent>
          </Tooltip>
        )}
        {isDemoMode(settings) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                <FlaskConical className="size-3" aria-hidden /> demo
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              No API key — scripted engine with real tool execution. Add a key in Settings for the full agent.
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* center */}
      <div className="hidden items-center gap-3 md:flex">
        <span className="flex items-center gap-1" title="Tool calls executed">
          <Wrench className="size-3" aria-hidden /> {totals.toolCalls}
        </span>
        <button
          type="button"
          onClick={onOpenPlugins}
          className="flex items-center gap-1 rounded px-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={`Plugins: ${enabledCount} of ${PLUGINS.length} enabled — open manager`}
        >
          <Plug className="size-3" aria-hidden /> {enabledCount}/{PLUGINS.length}
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="flex cursor-help items-center gap-1 rounded px-1 transition-colors hover:text-foreground"
              aria-label={`Token usage: ${totals.tokens} across ${sessions.length} sessions`}
            >
              <Zap className="size-3" aria-hidden /> {fmtK(totals.tokens)}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-64">
            <p className="mb-1 font-semibold">Token usage (all sessions)</p>
            {topSessions.length === 0 ? (
              <p className="text-muted-foreground">No usage yet — send a message with a live key.</p>
            ) : (
              <ul className="space-y-0.5">
                {topSessions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3">
                    <span className="max-w-40 truncate">{s.title}</span>
                    <span className="font-mono text-[10px]">
                      {fmtK(s.stats.promptTokens + s.stats.completionTokens)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* right */}
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={cyclePolicy}
              className="flex items-center gap-1 rounded border border-border/70 bg-background px-1.5 py-px transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label={`Permission policy ${POLICY_META[policy].label}. Click to cycle.`}
            >
              {POLICY_META[policy].icon}
              {POLICY_META[policy].label}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Cycle permission policy</TooltipContent>
        </Tooltip>
        <span aria-label="Current time">{now || "--:--"}</span>
        <span aria-hidden className="select-none text-muted-foreground/50">
          vercel ▲
        </span>
      </div>
    </footer>
  );
}
