"use client";

import * as React from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  CornerDownLeft,
  Cpu,
  Eye,
  FolderGit2,
  Hand,
  ImagePlus,
  Map,
  Plus,
  SendHorizontal,
  SlashSquare,
  Square,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { modelDisplayName } from "@/lib/ducky/models";
import { listProfiles, maskKeyHint, type ModelProfile } from "@/lib/ducky/profiles";
import { useDuckyStore } from "@/lib/ducky/store";
import { fileToPastedImage } from "@/lib/ducky/images";
import type { PermissionPolicy } from "@/lib/ducky/types";

export const SLASH_COMMANDS = [
  { cmd: "/help", desc: "Open the cheat sheet (shortcuts + commands)", group: "help" },
  { cmd: "/new", desc: "Start a fresh session", group: "session" },
  { cmd: "/goal <text>", desc: "Set this session's goal (also its title)", group: "session" },
  { cmd: "/retry", desc: "Resend the last message", group: "session" },
  { cmd: "/undo", desc: "Remove the last exchange", group: "session" },
  { cmd: "/compact <n>", desc: "Keep only the last n exchanges (default 20)", group: "session" },
  { cmd: "/clear", desc: "Clear messages of this session", group: "session" },
  { cmd: "/plan", desc: "Toggle plan mode", group: "mode" },
  { cmd: "/model <m>", desc: "Switch model — any id your endpoint serves", group: "model" },
  { cmd: "/models", desc: "Discover models your endpoint serves", group: "model" },
  { cmd: "/endpoint <url>", desc: "Set the API base URL", group: "model" },
  { cmd: "/key <key>", desc: "Save your API key (this browser only, never echoed)", group: "model" },
  { cmd: "/conn", desc: "Open Settings → Connections (keys, models, MCP)", group: "model" },
  { cmd: "/policy <p>", desc: "Permission policy — readonly | ask | auto", group: "mode" },
  { cmd: "/temp <n>", desc: "Sampling temperature 0–2", group: "tune" },
  { cmd: "/tokens <n>", desc: "Max response tokens 512–32768", group: "tune" },
  { cmd: "/iters <n>", desc: "Max tool rounds per turn 1–30", group: "tune" },
  { cmd: "/remember <fact>", desc: "Save to cross-session memory", group: "memory" },
  { cmd: "/forget <id>", desc: "Forget a memory by id prefix", group: "memory" },
  { cmd: "/stats", desc: "Show session counters", group: "session" },
  { cmd: "/files", desc: "List workspace files", group: "workspace" },
  { cmd: "/reset", desc: "Reset workspace to starting files", group: "workspace" },
  { cmd: "/rename <t>", desc: "Rename this session", group: "session" },
  { cmd: "/star", desc: "Star this session", group: "session" },
  { cmd: "/duplicate", desc: "Clone this session", group: "session" },
  { cmd: "/browser <url>", desc: "Open a page in the browser tab", group: "tools" },
  { cmd: "/term", desc: "Toggle the terminal drawer", group: "tools" },
  { cmd: "/screen", desc: "Capture the screen into images/", group: "tools" },
  { cmd: "/tools", desc: "Browse the 70+ agent tools", group: "tools" },
  { cmd: "/plugins", desc: "Open the plugin manager", group: "tools" },
  { cmd: "/market", desc: "Browse the plugin marketplace", group: "tools" },
  { cmd: "/mcp", desc: "Manage MCP servers (Blender, Roblox…)", group: "tools" },
  { cmd: "/activity", desc: "Open the activity timeline (⌘E)", group: "tools" },
  { cmd: "/export", desc: "Download the session as a Markdown transcript", group: "tools" },
  { cmd: "/zip", desc: "Download this session's workspace as a .zip", group: "tools" },
  { cmd: "/backup", desc: "Download all sessions as a JSON backup", group: "tools" },
] as const satisfies ReadonlyArray<{ cmd: string; desc: string; group: string }>;

/**
 * ZCode-style row BELOW the prompt box: model pill on the left, permission
 * mode on the right. One control for the four ways the agent may act:
 * ask-before-changes, edit-automatically, plan-mode, read-only.
 */
export type AgentMode = "ask" | "auto" | "plan" | "readonly";

const MODE_META: Record<AgentMode, { label: string; hint: string }> = {
  ask: { label: "Ask before changes", hint: "Approve each edit before it runs" },
  auto: { label: "Edit automatically", hint: "Files change without asking" },
  plan: { label: "Plan mode", hint: "Research + propose, no writes until approved" },
  readonly: { label: "Read-only", hint: "The agent can look, never touch" },
};

function ComposerMetaRow({ sessionId }: { sessionId: string | null }) {
  const policy = useDuckyStore((s) => s.settings.policy);
  const model = useDuckyStore((s) => s.settings.model);
  const planMode = useDuckyStore(
    (s) => s.sessions.find((x) => x.id === sessionId)?.planMode ?? false,
  );
  const mode: AgentMode = planMode
    ? "plan"
    : policy === "auto"
      ? "auto"
      : policy === "readonly"
        ? "readonly"
        : "ask";

  const setMode = (m: AgentMode) => {
    const st = useDuckyStore.getState();
    let sid = sessionId;
    if (m === "plan" && (!sid || !st.sessions.some((s) => s.id === sid))) {
      sid = st.newSession();
    }
    if (sid) st.setPlanMode(sid, m === "plan");
    if (m !== "plan") {
      st.updateSettings({ policy: m === "auto" ? "auto" : m === "readonly" ? "readonly" : "ask" });
    }
    toast.success(MODE_META[m].label, { description: MODE_META[m].hint });
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-1 pt-2">
      <span
        aria-label={`Active model: ${modelDisplayName(model)}`}
        title="Your model (Settings → Connections)"
        className="flex min-w-0 items-center gap-1.5 truncate rounded-full border border-[#FF7A1A]/20 bg-[#FF7A1A]/5 px-2.5 py-1 font-mono text-[11px] text-foreground/80"
      >
        <Cpu className="size-3 shrink-0 text-[#FF7A1A]" aria-hidden />
        <span className="truncate">{modelDisplayName(model)}</span>
      </span>
      <label className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
        <Map className="size-3 text-[#FF7A1A]" aria-hidden />
        <span className="sr-only">Permission mode</span>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as AgentMode)}
          aria-label={`Permission mode: ${MODE_META[mode].label}`}
          title={MODE_META[mode].hint}
          className="cursor-pointer rounded-full border bg-card px-2 py-1 font-mono text-[11px] text-foreground hover:border-[#FF7A1A]/40 focus-visible:outline-none"
        >
          {(Object.keys(MODE_META) as AgentMode[]).map((m) => (
            <option key={m} value={m}>
              {MODE_META[m].label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  running: boolean;
  /** awaiting permission gate — send disabled */
  locked: boolean;
  hasSession: boolean;
  /** "docked" = bottom bar surface · "hero" = centered zcode-style surface */
  variant?: "docked" | "hero";
}

const POLICY_META: Record<
  PermissionPolicy,
  { label: string; icon: React.ReactNode; className: string }
> = {
  auto: {
    label: "Full access",
    icon: <Zap className="size-3.5" aria-hidden />,
    className: "text-orange-400",
  },
  ask: {
    label: "Ask before edits",
    icon: <Hand className="size-3.5" aria-hidden />,
    className: "text-amber-300",
  },
  readonly: {
    label: "Read-only",
    icon: <Eye className="size-3.5" aria-hidden />,
    className: "text-muted-foreground",
  },
};

/**
 * ZCode ModelConfigSelect pattern (Apache-2.0, adapted): provider-grouped
 * submenu — active connection first, then saved profiles grouped by endpoint
 * provider with status dots, key hints, and a settings footer.
 */
function providerOf(baseUrl: string): string {
  const h = (() => {
    try {
      return new URL(baseUrl).hostname.toLowerCase();
    } catch {
      return baseUrl.trim().toLowerCase();
    }
  })();
  if (h.includes("openai")) return "OpenAI";
  if (h.includes("anthropic")) return "Anthropic";
  if (h.includes("nvidia")) return "NVIDIA";
  if (h.includes("groq")) return "Groq";
  if (h.includes("together")) return "Together";
  if (h.includes("openrouter")) return "OpenRouter";
  if (h.includes("deepseek")) return "DeepSeek";
  if (h.includes("mistral")) return "Mistral";
  if (h.includes("cohere")) return "Cohere";
  if (h.includes("azure")) return "Azure";
  if (h.includes("localhost") || h.includes("127.0.0.1") || h === "") return h === "" ? "Custom" : "Local";
  return h || "Custom";
}

function ModelMenu({ onDone }: { onDone: () => void }) {
  const baseUrl = useDuckyStore((s) => s.settings.baseUrl);
  const apiKey = useDuckyStore((s) => s.settings.apiKey);
  const model = useDuckyStore((s) => s.settings.model);
  const [profiles] = React.useState<ModelProfile[]>(() => listProfiles());

  const groups = React.useMemo(() => {
    const buckets: Record<string, ModelProfile[]> = {};
    for (const p of profiles) {
      const g = providerOf(p.baseUrl);
      (buckets[g] ??= []).push(p);
    }
    return Object.entries(buckets).sort((a, b) => a[0].localeCompare(b[0]));
  }, [profiles]);

  const isActive = (b: string, k: string, m: string) =>
    b.trim() === baseUrl.trim() && k.trim() === apiKey.trim() && m.trim() === model.trim();

  const switchTo = (b: string, k: string, m: string, label: string) => {
    useDuckyStore.getState().updateSettings({ baseUrl: b, apiKey: k, model: m });
    toast.success(`Model → ${modelDisplayName(m)}`, { description: label });
    onDone();
  };

  return (
    <div>
      <p className="px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
        active connection
      </p>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Cpu className="size-3.5 shrink-0 text-[#FF7A1A]" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-xs font-semibold">{modelDisplayName(model)}</span>
          <span className="block truncate text-[10px] text-muted-foreground">
            {providerOf(baseUrl)} · key {maskKeyHint(apiKey)}
          </span>
        </span>
        <Check className="size-3.5 shrink-0 text-[#FF7A1A]" aria-hidden />
      </button>
      {groups.map(([provider, items]) => (
        <div key={provider}>
          <p className="px-2 pb-0.5 pt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
            {provider}
          </p>
          {items.map((p) => {
            const active = isActive(p.baseUrl, p.apiKey, p.model);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => switchTo(p.baseUrl, p.apiKey, p.model, `${p.name} · ${providerOf(p.baseUrl)}`)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <span
                  aria-hidden
                  title={p.lastTest ? (p.lastTest.ok ? `last test ok: ${p.lastTest.message}` : `last test failed: ${p.lastTest.message}`) : "never tested"}
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    !p.lastTest ? "bg-muted-foreground/40" : p.lastTest.ok ? "bg-emerald-400" : "bg-red-400",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{p.name}</span>
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">
                    {modelDisplayName(p.model)} · {maskKeyHint(p.apiKey)}
                  </span>
                </span>
                {active && <Check className="size-3.5 shrink-0 text-[#FF7A1A]" aria-hidden />}
              </button>
            );
          })}
        </div>
      ))}
      <p className="px-2 pb-1 pt-2 text-[10px] leading-relaxed text-muted-foreground">
        Full keys, discovery &amp; tests live in Settings → Connections.
      </p>
    </div>
  );
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  running,
  locked,
  hasSession,
  variant = "docked",
}: ComposerProps) {
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [modelOpen, setModelOpen] = React.useState(false);
  const activeSessionId = useDuckyStore((s) => s.activeSessionId);
  const policy = useDuckyStore((s) => s.settings.policy);
  const model = useDuckyStore((s) => s.settings.model);
  const disabledSurface = !hasSession;
  const hero = variant === "hero";

  /** hero surface may run with no session yet — create one on demand */
  const ensureSession = React.useCallback((): string | null => {
    const st = useDuckyStore.getState();
    if (activeSessionId && st.sessions.some((s) => s.id === activeSessionId)) {
      return activeSessionId;
    }
    return st.newSession();
  }, [activeSessionId]);

  /** shared pipeline for pasted & picked images → vFS data-URL entries */
  const ingestImages = React.useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const sid = hero ? ensureSession() : activeSessionId;
      if (!sid) return;
      let stored = 0;
      for (let i = 0; i < files.length; i++) {
        try {
          const img = await fileToPastedImage(files[i], i);
          useDuckyStore.getState().writeFile(sid, img.suggestedName, img.dataUrl);
          toast.success("Image saved to workspace", {
            description: `${img.suggestedName} · ${(img.bytes / 1024).toFixed(0)} KB — open it from the sidebar tree.`,
          });
          stored++;
        } catch (e) {
          toast.error("Image skipped", { description: (e as Error).message });
        }
      }
      if (stored > 0) taRef.current?.focus();
    },
    [activeSessionId, ensureSession, hero],
  );

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length === 0) return; // let text paste flow normally
    e.preventDefault();
    void ingestImages(files);
  };

  // autogrow between 52px (hero: 72px) and 200px (hero: 240px)
  const minH = hero ? 72 : 52;
  const maxH = hero ? 240 : 200;
  const grow = React.useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(Math.max(el.scrollHeight, minH), maxH);
    el.style.height = `${next}px`;
  }, [minH, maxH]);
  React.useEffect(grow, [value, grow]);

  const canSend = Boolean(value.trim()) && !running && !locked && (!disabledSurface || hero);

  const trySend = () => {
    if (!canSend) return;
    if (hero && !hasSession) ensureSession();
    onSend(value);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      trySend();
    }
  };

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      multiple
      className="hidden"
      aria-hidden
      tabIndex={-1}
      onChange={(e) => {
        void ingestImages(Array.from(e.target.files ?? []));
        e.target.value = ""; // allow re-picking the same file
      }}
    />
  );

  /* ───────────────────────────── hero surface ───────────────────────────── */
  if (hero) {
    return (
      <div className="w-full">
        <div
          className={cn(
            "ducky-v3-composer group/composer relative rounded-[20px] transition-all duration-200",
          )}
        >
          {/* focus glow hairline (top edge) */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#FF7A1A]/70 to-transparent opacity-0 transition-opacity duration-300 group-focus-within/composer:opacity-100"
          />

          {/* textarea (workspace lives in the hero pill above — ZCode chrome) */}
          <Textarea
            ref={taRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder="Ask Ducky anything, @ to add context, / for commands"
            aria-label="Ask Ducky"
            className="t-input-safe min-h-[72px] max-h-[240px] resize-none border-0 bg-transparent px-5 pb-2 pt-4 placeholder:text-muted-foreground/60 focus-visible:ring-0"
          />

          {fileInput}

          {/* bottom action row */}
          <div className="flex min-w-0 items-center gap-1 px-3 pb-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Attach image to workspace"
                  onClick={() => fileInputRef.current?.click()}
                  className="size-8 rounded-full text-muted-foreground hover:text-foreground"
                >
                  <Plus className="size-4.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Attach an image — saved into the workspace</TooltipContent>
            </Tooltip>

            {/* permission policy dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Permission policy: ${POLICY_META[policy].label}`}
                  className="h-8 gap-1.5 rounded-full px-2 font-mono text-xs sm:px-2.5"
                >
                  <span className={POLICY_META[policy].className}>{POLICY_META[policy].icon}</span>
                  <span className={cn("hidden sm:inline", POLICY_META[policy].className)}>
                    {POLICY_META[policy].label}
                  </span>
                  <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  permission policy
                </DropdownMenuLabel>
                {(Object.keys(POLICY_META) as PermissionPolicy[]).map((p) => (
                  <DropdownMenuItem
                    key={p}
                    onClick={() => {
                      useDuckyStore.getState().updateSettings({ policy: p });
                      toast.success(`Permission policy → ${POLICY_META[p].label}`);
                    }}
                    className="gap-2"
                  >
                    <span className={POLICY_META[p].className}>{POLICY_META[p].icon}</span>
                    <span className="flex-1">{POLICY_META[p].label}</span>
                    {policy === p && <Check className="size-3.5 text-[#FF7A1A]" aria-hidden />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="ml-auto flex items-center gap-1.5">
              {/* provider-grouped model selector (ZCode ModelConfigSelect pattern) */}
              <Popover open={modelOpen} onOpenChange={setModelOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Active model: ${modelDisplayName(model)}`}
                    className="h-8 gap-1 rounded-full px-2.5 font-mono text-xs text-muted-foreground hover:text-foreground"
                  >
                    <span className="max-w-28 truncate sm:max-w-40">{modelDisplayName(model)}</span>
                    <ChevronDown className="size-3" aria-hidden />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="custom-scrollbar max-h-80 w-72 overflow-y-auto p-1.5">
                  <ModelMenu onDone={() => setModelOpen(false)} />
                </PopoverContent>
              </Popover>

              {/* send / stop */}
              {running ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="Stop generation"
                      onClick={onStop}
                      className="size-9 rounded-full border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Square className="size-4 fill-current" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Stop</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={canSend ? -1 : 0}>
                      <Button
                        size="icon"
                        aria-label="Send message"
                        disabled={!canSend}
                        onClick={trySend}
                        className={cn(
                          "size-10 rounded-full",
                          canSend ? "ducky-send" : "bg-muted text-muted-foreground",
                          locked && "cursor-not-allowed",
                        )}
                      >
                        <ArrowUp className="size-4.5" strokeWidth={2.5} />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {locked && <TooltipContent side="bottom">Waiting for permission approval…</TooltipContent>}
                </Tooltip>
              )}
            </div>
          </div>
        </div>
        <ComposerMetaRow sessionId={activeSessionId} />
      </div>
    );
  }

  /* ──────────────────────────── docked surface ──────────────────────────── */
  const surface = (
    <div
      className={cn(
        "ducky-v3-composer group/composer relative mx-auto w-full max-w-3xl rounded-[20px] transition-all duration-200",
        disabledSurface && "opacity-70",
      )}
    >
      {/* focus glow hairline (top edge) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[#FF7A1A]/70 to-transparent opacity-0 transition-opacity duration-300 group-focus-within/composer:opacity-100"
      />
      {/* top chip row */}
      <div className="flex items-center gap-1 px-2 pt-1.5">
        {/* model chip — your configured model */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              aria-label={`Active model: ${modelDisplayName(model)}`}
              className="flex h-7 cursor-default items-center gap-1.5 rounded-md bg-muted/50 px-2 font-mono text-[11px] text-foreground/80"
            >
              <Cpu className="size-3.5 text-[#FF7A1A]" aria-hidden /> {modelDisplayName(model)}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            {modelDisplayName(model)} — set it in Settings → Connections
          </TooltipContent>
        </Tooltip>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Slash commands"
              className="h-7 gap-1 px-2 font-mono text-[11px] text-muted-foreground"
            >
              <SlashSquare className="size-3.5" aria-hidden /> slash
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-1.5">
            <p className="px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground/70">
              commands
            </p>
            {SLASH_COMMANDS.map((c) => (
              <button
                key={c.cmd}
                type="button"
                onClick={() => {
                  onChange(`${c.cmd.split(" ")[0]} `);
                  toast.info("Command staged", {
                    description: `${c.cmd} — press Enter to run${c.cmd.includes("<") ? " (add an argument)" : ""}.`,
                  });
                  taRef.current?.focus();
                }}
                className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <span className="font-mono text-xs font-semibold">{c.cmd}</span>
                <span className="text-[11px] text-muted-foreground">{c.desc}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {!hasSession ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => useDuckyStore.getState().newSession()}
            className="ml-auto mr-14 flex items-center gap-1 pr-1 text-[11px] italic text-muted-foreground hover:text-foreground focus-visible:outline-none"
          >
            <Plus className="size-3" aria-hidden /> select or create a session…
          </button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Attach image to workspace"
                disabled={disabledSurface}
                onClick={() => fileInputRef.current?.click()}
                className="ml-auto mr-auto h-7 gap-1 px-2 font-mono text-[11px] text-muted-foreground"
              >
                <ImagePlus className="size-3.5" aria-hidden /> image
              </Button>
            </TooltipTrigger>
            <TooltipContent>Paste an image or pick one — saved into the virtual workspace</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* textarea */}
      <Textarea
        ref={taRef}
        value={disabledSurface ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder={
          disabledSurface
            ? "Select or create a session…"
            : `Message Ducky… ('/' commands · paste images straight in)`
        }
        disabled={disabledSurface}
        aria-label="Message Ducky"
        className="t-input-safe min-h-[52px] max-h-[200px] resize-none border-0 bg-transparent px-3 pb-11 pt-1.5 pr-24 focus-visible:ring-0"
      />

      {fileInput}

      {/* action buttons */}
      <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
        {running ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                aria-label="Stop generation"
                onClick={onStop}
                className="size-9 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Square className="size-4 fill-current" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Stop</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={canSend ? -1 : 0}>
                <Button
                  size="icon"
                  aria-label="Send message"
                  disabled={!canSend}
                  onClick={trySend}
                  className={cn(
                    "size-9 rounded-full",
                    canSend ? "ducky-send" : "bg-muted text-muted-foreground",
                    locked && "cursor-not-allowed",
                  )}
                >
                  <SendHorizontal className="size-4" />
                </Button>
              </span>
            </TooltipTrigger>
            {locked && <TooltipContent>Waiting for permission approval…</TooltipContent>}
          </Tooltip>
        )}
      </div>

      {/* enter hint */}
      <div className="pointer-events-none absolute bottom-3 left-3 hidden items-center gap-1 font-mono text-[10px] text-muted-foreground/60 sm:flex">
        <CornerDownLeft className="size-3" aria-hidden /> send · shift+enter newline
      </div>
    </div>
  );

  return (
    <div className="border-t bg-background/60 px-4 py-3">
      {surface}
      <ComposerMetaRow sessionId={activeSessionId} />
    </div>
  );
}
