"use client";

import * as React from "react";
import { Command, Eye, GitBranch, Hand, HardDrive, Monitor, Plug, TriangleAlert, Wrench, Zap } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PLUGINS } from "@/lib/ducky/plugins";
import { modelDisplayName } from "@/lib/ducky/models";
import { useDuckyStore } from "@/lib/ducky/store";
import {
  disconnectDisk,
  reconnectDisk,
  useDiskStore,
} from "@/lib/ducky/disk";
import { getPcConfig, pcStatus } from "@/lib/ducky/pc";
import { type PermissionPolicy } from "@/lib/ducky/types";
import { clockHM, fmtK, shortId } from "./format";

const POLICY_ORDER: PermissionPolicy[] = ["readonly", "ask", "auto"];

/**
 * Real local-folder chip: emerald when connected (popover with unplug),
 * amber & click-to-reconnect when the browser wants a re-grant. Renders
 * nothing when no folder was ever connected or the API is unsupported.
 */
function DiskChip() {
  const status = useDiskStore((s) => s.status);
  const rootName = useDiskStore((s) => s.rootName);
  const [open, setOpen] = React.useState(false);

  if (status === "none" || status === "unsupported") return null;

  if (status === "needs-permission") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => {
              void reconnectDisk().then((ok) => {
                if (ok) {
                  toast.success(`Folder reconnected: ${useDiskStore.getState().rootName}`);
                } else {
                  toast.error("Permission not granted", {
                    description: "Try again and choose “Allow” when the browser asks.",
                  });
                }
              });
            }}
            className="flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-400 transition-colors hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Reconnect local folder — permission re-grant needed"
          >
            <HardDrive className="size-3" aria-hidden /> disk: reconnect
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64">
          “{rootName}” was connected before — click to re-grant access (the browser keeps folder
          permissions per session).
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-400 transition-colors hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={`Local folder connected: ${rootName} — open details`}
        >
          <HardDrive className="size-3" aria-hidden />
          <span className="max-w-28 truncate normal-case">disk: {rootName}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3 text-xs">
        <p className="font-medium">Real folder connected</p>
        <p className="mt-1 font-mono text-[11px] text-emerald-400">{rootName}</p>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          disk_ls / disk_read / disk_write / disk_edit / disk_delete / disk_mkdir operate on your
          actual files inside this folder. Writes still pass the permission policy and plan-mode
          gate.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2.5 w-full gap-1.5"
          onClick={() => {
            setOpen(false);
            void disconnectDisk().then(() => {
              toast.info("Local folder disconnected", {
                description: "The agent can no longer touch it. You can reconnect any time.",
              });
            });
          }}
        >
          <Plug className="size-3.5 rotate-180" aria-hidden /> Disconnect folder
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/**
 * This-PC bridge chip: renders only when a bridge is paired. Click probes
 * liveness (green pulse = answering). The bridge itself is started/stopped
 * by the human (`ducky bridge`) — this chip never touches the machine.
 */
function PcChip() {
  const [live, setLive] = React.useState<boolean | null>(null);
  const cfg = getPcConfig();
  if (!cfg) return null;

  const probe = () => {
    setLive(null);
    pcStatus().then(
      (s) => {
        setLive(true);
        toast.success("PC bridge live", { description: `${s.root} · ${s.platform}` });
      },
      (e) => {
        setLive(false);
        toast.error("PC bridge unreachable", { description: (e as Error).message });
      },
    );
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={probe}
          className="flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-400 transition-colors hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Probe the This-PC bridge (click to test)"
        >
          <Monitor className="size-3" aria-hidden />
          <span
            aria-hidden
            className={cn(
              "inline-block size-1.5 rounded-full",
              live === false ? "bg-red-400" : live ? "bg-emerald-400" : "ducky-pulse-dot bg-emerald-400/70",
            )}
          />
          pc
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64">
        This PC is paired (port {cfg.port}). Click to probe — green means the
        bridge answers. Stop it any time with Ctrl+C in its terminal.
      </TooltipContent>
    </Tooltip>
  );
}

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
  const sessions = useDuckyStore((s) => s.sessions);
  const activeSessionId = useDuckyStore((s) => s.activeSessionId);
  const isRunning = useDuckyStore((s) => s.isRunning);
  const settings = useDuckyStore((s) => s.settings);
  const disabledPlugins = useDuckyStore((s) => s.disabledPlugins);
  const serverLive = useDuckyStore((s) => s.serverLive);
  const modelIdSet = useDuckyStore((s) => s.modelIdSet);
  const hasOwnKey = useDuckyStore((s) => s.settings.apiKey.trim() !== "" && s.settings.baseUrl.trim() !== "");

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
    useDuckyStore.getState().updateSettings({ policy: next });
    toast.success(`Permission policy → ${POLICY_META[next].label}`, {
      description: `Next: ${POLICY_META[next].nextHint}`,
    });
  };

  return (
    <footer
      className="ducky-v3-topbar z-20 flex h-7 shrink-0 items-center justify-between gap-4 px-3 font-mono text-[10px] text-muted-foreground"
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
              isRunning ? "ducky-pulse-dot bg-amber-400" : "bg-emerald-400",
            )}
          />
          {isRunning
            ? `Running… ${modelDisplayName(settings.model)}`
            : "Ready"}
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
        {!hasOwnKey && !serverLive && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                <TriangleAlert className="size-3" aria-hidden /> no connection
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              No model connection. Open Settings → Connections and add your
              base URL + API key + model — or set AI_BASE_URL / AI_API_KEY on
              the server once for everyone.
            </TooltipContent>
          </Tooltip>
        )}
        {(hasOwnKey || serverLive) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                <span aria-hidden className="inline-block size-1.5 rounded-full bg-emerald-400" />
                {hasOwnKey ? "your key" : "server key"}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              {hasOwnKey
                ? "Chatting with your own key (Settings → Connections, this browser only)."
                : "Chatting with the shared server key (AI_* env — never reaches the browser)."}
            </TooltipContent>
          </Tooltip>
        )}
        {serverLive && !modelIdSet && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                <TriangleAlert className="size-3" aria-hidden /> no model id
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              Neither your Settings → Connections nor the server names a model.
              Add one (Discover lists what your endpoint serves) or set
              AI_MODEL_ID on the server.
            </TooltipContent>
          </Tooltip>
        )}
        <DiskChip />
        <PcChip />
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
        <span
          aria-hidden
          className="select-none font-mono text-[10px] font-bold tracking-tight text-[#FF7A1A]/80"
          title="Ducky AI | Coder"
        >
          ▲ ducky
        </span>
      </div>
    </footer>
  );
}
