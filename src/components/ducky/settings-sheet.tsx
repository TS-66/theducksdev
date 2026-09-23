"use client";

import * as React from "react";
import {
  ArrowLeft,
  BarChart3,
  Boxes,
  Brain,
  Check,
  Eye,
  EyeOff,
  GraduationCap,
  Hand,
  Info,
  Keyboard,
  KeyRound,
  Monitor,
  Plug,
  Radar,
  RefreshCw,
  Server,
  Settings as SettingsIcon,
  Terminal,
  Trash2,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useDuckyStore } from "@/lib/ducky/store";
import { modelDisplayName } from "@/lib/ducky/models";
import { discoverModels, testConnection, type ConnectionTest } from "@/lib/ducky/connection";
import {
  addMcpServer,
  listMcpServers,
  removeMcpServer,
  type McpServer,
} from "@/lib/ducky/mcp";
import {
  deleteProfile,
  listProfiles,
  maskKeyHint,
  recordProfileTest,
  saveProfile,
  type ModelProfile,
} from "@/lib/ducky/profiles";
import {
  clearPcConfig,
  getPcConfig,
  pcStatus,
  setPcConfig,
} from "@/lib/ducky/pc";
import { PLUGINS } from "@/lib/ducky/plugins";
import { SKILLS } from "@/lib/ducky/skills";
import { SLASH_COMMANDS } from "./composer";
import {
  forgetMemory,
  listMemories,
  type MemoryEntry,
} from "@/lib/ducky/memory";
import type { PermissionPolicy, Settings } from "@/lib/ducky/types";

export type SettingsTab =
  | "general"
  | "models"
  | "computer"
  | "plugins"
  | "mcp"
  | "skills"
  | "commands"
  | "memory"
  | "shortcuts"
  | "usage"
  | "about";
interface NavItem {
  id: SettingsTab;
  label: string;
  icon: React.ReactNode;
  group?: string;
}

const NAV: NavItem[] = [
  { id: "general", label: "General", icon: <SettingsIcon className="size-4" aria-hidden /> },
  { id: "models", label: "Models", icon: <KeyRound className="size-4" aria-hidden /> },
  { id: "computer", label: "Computer Use", icon: <Monitor className="size-4" aria-hidden /> },
  { id: "plugins", label: "Plugins", icon: <Boxes className="size-4" aria-hidden />, group: "Agent capabilities" },
  { id: "mcp", label: "MCP Servers", icon: <Plug className="size-4" aria-hidden />, group: "Agent capabilities" },
  { id: "skills", label: "Skills", icon: <GraduationCap className="size-4" aria-hidden />, group: "Agent capabilities" },
  { id: "commands", label: "Commands", icon: <Terminal className="size-4" aria-hidden />, group: "Agent capabilities" },
  { id: "memory", label: "Memory", icon: <Brain className="size-4" aria-hidden />, group: "Agent capabilities" },
  { id: "shortcuts", label: "Keyboard Shortcuts", icon: <Keyboard className="size-4" aria-hidden /> },
  { id: "usage", label: "Usage stats", icon: <BarChart3 className="size-4" aria-hidden />, group: "Data and statistics" },
  { id: "about", label: "About", icon: <Info className="size-4" aria-hidden /> },
];

const SECTION_META: Record<SettingsTab, { title: string; desc: string }> = {
  general: { title: "General", desc: "Agent behavior, budgets and house instructions." },
  models: { title: "Models", desc: "Your model connections — base URL, key and model id, with discovery and live tests." },
  computer: { title: "Computer Use", desc: "Pair this PC for a real shell and real files, plus screen capture." },
  plugins: { title: "Plugins", desc: "Everything is a plugin — toggling unloads its tools from the model." },
  mcp: { title: "MCP Servers", desc: "Outside apps over Model Context Protocol (Blender, Roblox Studio, browsers…)." },
  skills: { title: "Skills", desc: "Playbooks the agent pulls into context with skill_show." },
  commands: { title: "Commands", desc: "Slash commands — type / in the composer or press ⌘P." },
  memory: { title: "Memory", desc: "Durable facts the agent saved across sessions." },
  shortcuts: { title: "Keyboard Shortcuts", desc: "Every shortcut in one place." },
  usage: { title: "Usage stats", desc: "Tokens, tools and files across all sessions." },
  about: { title: "About", desc: "What this app is — and the danger zone." },
};

const SHORTCUTS: Array<[string, string]> = [
  ["⌘/Ctrl K", "New task"],
  ["⌘/Ctrl P", "Command palette"],
  ["⌘/Ctrl E", "Activity timeline"],
  ["⌘/Ctrl B", "Toggle sidebar"],
  ["⌘/Ctrl / or ?", "Shortcut cheat sheet"],
  ["Enter", "Send message"],
  ["Shift + Enter", "Newline in composer"],
  ["↑ / ↓ in terminal", "Command history"],
];

const FALLBACK_DEFAULTS: Settings = {
  apiKey: "",
  baseUrl: "",
  model: "",
  temperature: 1,
  maxTokens: 8192,
  policy: "ask",
  systemPromptExtra: "",
  maxToolIterations: 25,
  showReasoning: true,
};

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: SettingsTab;
}

/** Map legacy tab ids to the new nav (older buttons pass these). */
function normalizeTab(t: SettingsTab | "behavior" | "connections" | undefined): SettingsTab {
  if (t === "behavior") return "general";
  if (t === "connections") return "models";
  return t ?? "general";
}

export function SettingsSheet({ open, onOpenChange, initialTab }: SettingsSheetProps) {
  const [tab, setTab] = React.useState<SettingsTab>(() => normalizeTab(initialTab));
  const [memories, setMemories] = React.useState<MemoryEntry[]>([]);
  const disabledPlugins = useDuckyStore((s) => s.disabledPlugins);
  const sessions = useDuckyStore((s) => s.sessions);
  const [draft, setDraft] = React.useState<Settings>(
    useDuckyStore.getState().settings,
  );

  const patch = (p: Partial<Settings>) => setDraft((d) => ({ ...d, ...p }));

  const save = () => {
    useDuckyStore.getState().updateSettings(draft);
    toast.success("Settings saved", { description: `policy=${draft.policy}` });
  };

  /* ── Connections tab state (never persisted until Save) ── */
  const [showKey, setShowKey] = React.useState(false);
  const [connTest, setConnTest] = React.useState<ConnectionTest | null>(null);
  const [testing, setTesting] = React.useState(false);
  const [discovered, setDiscovered] = React.useState<string[]>([]);
  const [discovering, setDiscovering] = React.useState(false);
  const [mcpServers, setMcpServers] = React.useState<McpServer[]>([]);
  const [mcpName, setMcpName] = React.useState("");
  const [mcpUrl, setMcpUrl] = React.useState("");
  const [profiles, setProfiles] = React.useState<ModelProfile[]>([]);
  const [profileName, setProfileName] = React.useState("");
  const [pcPort, setPcPort] = React.useState("3791");
  const [pcToken, setPcToken] = React.useState("");
  const [pcState, setPcState] = React.useState<{ live: boolean; text: string } | null>(null);
  const [pcTesting, setPcTesting] = React.useState(false);

  const runTest = async () => {
    setTesting(true);
    setConnTest(null);
    try {
      setConnTest(await testConnection(draft.baseUrl, draft.apiKey, draft.model));
    } finally {
      setTesting(false);
    }
  };

  const runDiscover = async () => {
    setDiscovering(true);
    try {
      const models = await discoverModels(draft.baseUrl, draft.apiKey);
      const ids = models.map((m) => m.id).slice(0, 100);
      setDiscovered(ids);
      if (ids.length > 0 && !draft.model.trim()) {
        patch({ model: ids[0] });
        toast.success(`Found ${models.length} model(s) — using ${ids[0]}`, {
          description: "Tap another chip below to switch.",
          duration: 6000,
        });
      } else {
        toast.success(`Found ${models.length} model(s)`, {
          description: ids.length ? "Pick one below — it fills the model field." : undefined,
        });
      }
    } catch (e) {
      toast.error("Discovery failed", { description: (e as Error).message });
    } finally {
      setDiscovering(false);
    }
  };

  // re-seed draft whenever the sheet opens / forced tab changes.
  // Deferred to a microtask so the render phase commits first (no cascading renders).
  React.useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(() => {
      if (!live) return;
      setDraft(useDuckyStore.getState().settings);
      setConnTest(null);
      setDiscovered([]);
      setMcpServers(listMcpServers());
      setMemories(listMemories());
      setProfiles(listProfiles());
      const pc = getPcConfig();
      setPcPort(String(pc?.port ?? 3791));
      setPcToken(pc?.token ?? "");
      setPcState(null);
      if (initialTab) setTab(normalizeTab(initialTab));
    }, 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [open, initialTab]);

  const meta = SECTION_META[tab];
  const statusDot = (on: boolean) => (
    <span
      aria-hidden
      className={cn("ml-auto size-1.5 shrink-0 rounded-full", on ? "bg-emerald-400" : "bg-muted-foreground/30")}
    />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-label="Settings"
        className="flex h-[86vh] max-h-[860px] w-[880px] max-w-[94vw] gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          General, models, computer use, plugins, MCP, skills, commands, memory, shortcuts, usage and about.
        </DialogDescription>
        {/* left nav */}
        <nav aria-label="Settings sections" className="custom-scrollbar hidden w-60 shrink-0 flex-col gap-px overflow-y-auto border-r bg-muted/20 p-3 sm:flex">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="mb-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden /> Back to workspace
          </button>
          {NAV.map((item) => (
            <React.Fragment key={item.id}>
              {item.group && (
                <p className="px-2 pb-1 pt-3 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60 first:pt-1">
                  {item.group}
                </p>
              )}
              <button
                type="button"
                onClick={() => setTab(item.id)}
                aria-current={tab === item.id ? "true" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
                  tab === item.id
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                {item.icon}
                <span className="flex-1 truncate">{item.label}</span>
                {item.id === "models" && statusDot(draft.baseUrl.trim() !== "" && draft.apiKey.trim() !== "")}
                {item.id === "computer" && statusDot(getPcConfig() !== null)}
                {item.id === "mcp" && statusDot(mcpServers.length > 0)}
                {item.id === "memory" && statusDot(memories.length > 0)}
              </button>
            </React.Fragment>
          ))}
          <div className="mt-auto px-2 pt-3 font-mono text-[10px] text-muted-foreground/60">
            v1.0 · local-first
          </div>
        </nav>

        {/* right content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="shrink-0 border-b px-6 pb-4 pt-5">
            <h2 className="text-xl font-bold tracking-tight">{meta.title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{meta.desc}</p>
          </div>
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {/* mobile section picker */}
            <div className="mb-4 sm:hidden">
              <div className="flex flex-wrap gap-1.5">
                {NAV.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 font-mono text-[11px]",
                      tab === item.id ? "border-[#FDC00A]/50 bg-[#FDC00A]/10" : "text-muted-foreground",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            {tab === "general" && (
              <div className="space-y-6">
            {/* ── Behavior ───────────────────────────────────────────── */}
              <SliderRow
                label="Temperature"
                hint="Randomness of sampling"
                min={0}
                max={2}
                step={0.1}
                value={[draft.temperature]}
                onChange={([v]) => patch({ temperature: Math.round(v * 10) / 10 })}
                format={(v) => v.toFixed(1)}
              />
              <SliderRow
                label="Max tokens"
                hint="Response length cap"
                min={512}
                max={16384}
                step={512}
                value={[draft.maxTokens]}
                onChange={([v]) => patch({ maxTokens: v })}
                format={(v) => String(v)}
              />
              <SliderRow
                label="Max tool iterations"
                hint="Agent-loop tool rounds per turn"
                min={2}
                max={16}
                step={1}
                value={[draft.maxToolIterations]}
                onChange={([v]) => patch({ maxToolIterations: v })}
                format={(v) => `${v}×`}
              />

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label htmlFor="ducky-show-reasoning" className="text-xs">
                    Show reasoning
                  </Label>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Render chain-of-thought as a “Thinking…” card when the model streams it.
                  </p>
                </div>
                <Switch
                  id="ducky-show-reasoning"
                  checked={draft.showReasoning}
                  onCheckedChange={(v) => patch({ showReasoning: Boolean(v) })}
                />
              </div>

              <section className="space-y-1.5">
                <Label className="text-xs">Permission policy</Label>
                <RadioGroup
                  value={draft.policy}
                  onValueChange={(v) => patch({ policy: v as PermissionPolicy })}
                  className="gap-1.5"
                >
                  <PolicyOption
                    value="readonly"
                    current={draft.policy}
                    onSelect={() => patch({ policy: "readonly" })}
                    icon={<Eye className="size-3.5" aria-hidden />}
                    title="readOnly"
                    desc="The agent can read and search, never write or run commands."
                  />
                  <PolicyOption
                    value="ask"
                    current={draft.policy}
                    onSelect={() => patch({ policy: "ask" })}
                    icon={<Hand className="size-3.5" aria-hidden />}
                    title="ask"
                    desc="Ask before every side-effecting tool call — you approve inline."
                  />
                  <PolicyOption
                    value="auto"
                    current={draft.policy}
                    onSelect={() => patch({ policy: "auto" })}
                    icon={<Zap className="size-3.5" aria-hidden />}
                    title="auto"
                    desc="Full autonomy — tools run without confirmation. Fastest, least safe."
                  />
                </RadioGroup>
              </section>

              <section className="space-y-1.5">
                <Label htmlFor="ducky-sys-extra" className="text-xs">
                  Extra system instructions
                </Label>
                <Textarea
                  id="ducky-sys-extra"
                  value={draft.systemPromptExtra}
                  onChange={(e) => patch({ systemPromptExtra: e.target.value })}
                  placeholder="Extra instructions appended to the ducky system prompt…"
                  className="min-h-24 font-mono text-xs"
                />
              </section>
              </div>
            )}
            {tab === "models" && (
              <div className="space-y-5">
              <section className="space-y-3 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="size-4 text-[#FDC00A]" aria-hidden />
                  <h3 className="text-xs font-semibold">Your model connection</h3>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Bring your own model — any OpenAI-compatible endpoint. Saved
                  only in <em>this browser</em>; never sent anywhere except your
                  endpoint through the chat proxy.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      patch({ baseUrl: "https://integrate.api.nvidia.com/v1" });
                      toast.success("NVIDIA endpoint filled", {
                        description: "Paste your key, then Discover → pick a model → Test.",
                      });
                    }}
                    className="rounded-full border border-[#FDC00A]/30 bg-[#FDC00A]/5 px-2.5 py-1 font-mono text-[11px] hover:border-[#FDC00A]/60 hover:text-foreground"
                  >
                    ⚡ Use NVIDIA
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      patch({ baseUrl: "", apiKey: "", model: "" });
                      setDiscovered([]);
                      setConnTest(null);
                      toast.info("Connection cleared");
                    }}
                    className="rounded-full border px-2.5 py-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ducky-base-url" className="text-xs">
                    Base URL
                  </Label>
                  <Input
                    id="ducky-base-url"
                    value={draft.baseUrl}
                    onChange={(e) => patch({ baseUrl: e.target.value })}
                    placeholder="https://api.example.com/v1"
                    spellCheck={false}
                    autoComplete="off"
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ducky-api-key" className="text-xs">
                    API key
                  </Label>
                  <div className="relative">
                    <Input
                      id="ducky-api-key"
                      type={showKey ? "text" : "password"}
                      value={draft.apiKey}
                      onChange={(e) => patch({ apiKey: e.target.value })}
                      placeholder="sk-…"
                      spellCheck={false}
                      autoComplete="off"
                      className="pr-9 font-mono text-xs"
                    />
                    <button
                      type="button"
                      aria-label={showKey ? "Hide API key" : "Show API key"}
                      onClick={() => setShowKey((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ducky-model" className="text-xs">
                    Model
                  </Label>
                  <Input
                    id="ducky-model"
                    value={draft.model}
                    onChange={(e) => patch({ model: e.target.value })}
                    placeholder="e.g. gpt-4o-mini"
                    spellCheck={false}
                    autoComplete="off"
                    className="font-mono text-xs"
                  />
                  {discovered.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {discovered.slice(0, 12).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => patch({ model: m })}
                          title={m}
                          className="max-w-44 truncate rounded-full border px-2 py-0.5 font-mono text-[10px] text-muted-foreground hover:border-[#FDC00A]/50 hover:text-foreground"
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={runDiscover}
                    disabled={discovering || !draft.baseUrl.trim() || !draft.apiKey.trim()}
                    className="flex-1 gap-1.5"
                  >
                    <RefreshCw className={discovering ? "size-3.5 animate-spin" : "size-3.5"} />
                    {discovering ? "Discovering…" : "Discover models"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={runTest}
                    disabled={testing || !draft.baseUrl.trim() || !draft.apiKey.trim()}
                    className="flex-1 gap-1.5"
                  >
                    <Zap className="size-3.5" />
                    {testing ? "Testing…" : "Test connection"}
                  </Button>
                </div>
                {connTest && (
                  <p
                    className={
                      connTest.ok
                        ? "rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 font-mono text-[11px] text-emerald-300"
                        : "rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 font-mono text-[11px] text-red-300"
                    }
                  >
                    {connTest.ok ? "✓ " : "✕ "}{connTest.message}
                  </p>
                )}
              </section>
              <section className="space-y-3 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Server className="size-4 text-violet-400" aria-hidden />
                  <h3 className="text-xs font-semibold">Saved connections</h3>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {profiles.length}/20
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Name the working setup above; switching copies it back into
                  the form. Dots show the last test per connection.
                </p>
                {profiles.length > 0 && (
                  <ul className="space-y-1">
                    {profiles.map((p) => {
                      const active =
                        draft.baseUrl.trim() === p.baseUrl.trim() &&
                        draft.model.trim() === p.model.trim() &&
                        draft.apiKey.trim() === p.apiKey.trim();
                      return (
                        <li
                          key={p.id}
                          className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5"
                        >
                          <span
                            aria-hidden
                            title={p.lastTest ? p.lastTest.message : "never tested"}
                            className={
                              p.lastTest
                                ? p.lastTest.ok
                                  ? "size-1.5 shrink-0 rounded-full bg-emerald-400"
                                  : "size-1.5 shrink-0 rounded-full bg-red-400"
                                : "size-1.5 shrink-0 rounded-full bg-muted-foreground/30"
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium">
                              {p.name}
                              {active && <span className="ml-1.5 text-[10px] text-[#FDC00A]">active</span>}
                            </span>
                            <span className="block truncate font-mono text-[10px] text-muted-foreground">
                              {p.model || "(no model)"} · {maskKeyHint(p.apiKey)}
                            </span>
                          </span>
                          {!active && (
                            <button
                              type="button"
                              onClick={() => {
                                patch({ baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model });
                                toast.success(`Switched to ${p.name}`, {
                                  description: "Save settings to apply it to the agent.",
                                });
                              }}
                              className="shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] hover:bg-accent"
                            >
                              Use
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={`Test ${p.name}`}
                            title="Test this connection"
                            onClick={() => {
                              toast.info(`Testing ${p.name}…`);
                              testConnection(p.baseUrl, p.apiKey, p.model).then((r) => {
                                recordProfileTest(p.id, r.ok, r.message);
                                setProfiles(listProfiles());
                                toast[r.ok ? "success" : "error"](r.ok ? `${p.name}: live` : `${p.name}: failed`, {
                                  description: r.message.slice(0, 160),
                                });
                              });
                            }}
                            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Zap className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${p.name}`}
                            onClick={() => {
                              deleteProfile(p.id);
                              setProfiles(listProfiles());
                            }}
                            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="flex gap-1.5">
                  <Input
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Name this setup (e.g. work-gpt)"
                    aria-label="Profile name"
                    className="h-8 font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!draft.baseUrl.trim() || !draft.apiKey.trim()}
                    onClick={() => {
                      try {
                        saveProfile(profileName || "Profile", draft.baseUrl, draft.apiKey, draft.model);
                        setProfiles(listProfiles());
                        setProfileName("");
                        toast.success("Connection saved");
                      } catch (e) {
                        toast.error("Cannot save", { description: (e as Error).message });
                      }
                    }}
                    className="h-8 shrink-0"
                  >
                    Save current
                  </Button>
                </div>
              </section>
              </div>
            )}
            {tab === "mcp" && (
              <div className="space-y-5">
              <section className="space-y-3 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Plug className="size-4 text-cyan-400" aria-hidden />
                  <h3 className="text-xs font-semibold">MCP servers</h3>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {mcpServers.length}/10
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Connect outside apps over MCP (Streamable HTTP) — Blender and
                  Roblox Studio bridges, browsers, filesystems. The agent calls
                  their tools via <code className="font-mono">mcp_list</code> /{" "}
                  <code className="font-mono">mcp_call</code>.
                </p>
                <ScanThisPc onFound={() => setMcpServers(listMcpServers())} />
                {mcpServers.length > 0 && (
                  <ul className="space-y-1">
                    {mcpServers.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">{s.name}</span>
                          <span className="block truncate font-mono text-[10px] text-muted-foreground">
                            {s.url}
                          </span>
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${s.name}`}
                          onClick={() => {
                            removeMcpServer(s.id);
                            setMcpServers(listMcpServers());
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-1.5">
                  <Input
                    value={mcpName}
                    onChange={(e) => setMcpName(e.target.value)}
                    placeholder="Name (e.g. blender)"
                    aria-label="MCP server name"
                    className="h-8 font-mono text-xs"
                  />
                  <Input
                    value={mcpUrl}
                    onChange={(e) => setMcpUrl(e.target.value)}
                    placeholder="http://127.0.0.1:9876/mcp"
                    aria-label="MCP server URL"
                    spellCheck={false}
                    className="h-8 flex-[2] font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!mcpUrl.trim()}
                    onClick={() => {
                      try {
                        addMcpServer(mcpName || "mcp", mcpUrl);
                        setMcpServers(listMcpServers());
                        setMcpName("");
                        setMcpUrl("");
                        toast.success("MCP server connected");
                      } catch (e) {
                        toast.error("Cannot add server", { description: (e as Error).message });
                      }
                    }}
                    className="h-8"
                  >
                    Add
                  </Button>
                </div>
              </section>
              </div>
            )}
            {tab === "computer" && (
              <div className="space-y-5">
              <section className="space-y-3 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Monitor className="size-4 text-emerald-400" aria-hidden />
                  <h3 className="text-xs font-semibold">This PC (real machine)</h3>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Run <code className="font-mono">ducky bridge</code> in a terminal on
                  your computer — it prints a one-time token. Paste it here and
                  the terminal gains a <strong>PC mode</strong> (real shell +
                  files) plus <code className="font-mono">pc_*</code> agent tools.
                  Ctrl+C in that terminal disconnects instantly.
                </p>
                <div className="flex gap-1.5">
                  <div className="w-20 space-y-1.5">
                    <Label htmlFor="ducky-pc-port" className="text-xs">
                      Port
                    </Label>
                    <Input
                      id="ducky-pc-port"
                      value={pcPort}
                      onChange={(e) => setPcPort(e.target.value)}
                      placeholder="3791"
                      inputMode="numeric"
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Label htmlFor="ducky-pc-token" className="text-xs">
                      Bridge token
                    </Label>
                    <Input
                      id="ducky-pc-token"
                      type="password"
                      value={pcToken}
                      onChange={(e) => setPcToken(e.target.value)}
                      placeholder="paste the one-time token"
                      spellCheck={false}
                      autoComplete="off"
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!pcToken.trim()}
                    onClick={() => {
                      const port = Math.max(1, Math.min(65535, parseInt(pcPort, 10) || 3791));
                      setPcConfig(port, pcToken.trim());
                      setPcPort(String(port));
                      useDuckyStore.setState({});
                      toast.success("PC paired", {
                        description: `Port ${port} — test it below. Unpair any time.`,
                      });
                    }}
                    className="h-8 flex-1"
                  >
                    Pair this PC
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      clearPcConfig();
                      setPcToken("");
                      setPcState(null);
                      useDuckyStore.setState({});
                      toast.info("PC unpaired");
                    }}
                    className="h-8"
                  >
                    Unpair
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pcTesting}
                    onClick={() => {
                      setPcTesting(true);
                      setPcState(null);
                      pcStatus().then(
                        (s) => {
                          setPcState({ live: true, text: `LIVE — root "${s.root}" · ${s.platform}` });
                          useDuckyStore.setState({});
                        },
                        (e) => setPcState({ live: false, text: (e as Error).message }),
                      ).finally(() => setPcTesting(false));
                    }}
                    className="h-8 flex-1 gap-1.5"
                  >
                    <Zap className="size-3.5" />
                    {pcTesting ? "Probing…" : "Probe bridge"}
                  </Button>
                </div>
                {pcState && (
                  <p
                    className={
                      pcState.live
                        ? "rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 font-mono text-[11px] text-emerald-300"
                        : "rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 font-mono text-[11px] text-red-300"
                    }
                  >
                    {pcState.live ? "✓ " : "✕ "}{pcState.text}
                  </p>
                )}
              </section>
              <section className="rounded-md border p-3">
                <h3 className="text-xs font-semibold">Screen capture</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  The other half of computer use: the monitor button in the Explorer
                  header (or <code className="font-mono">screen_capture</code> /{" "}
                  <code className="font-mono">/screen</code>) grabs one user-shared
                  frame into <code className="font-mono">images/</code> for{" "}
                  <code className="font-mono">vision_describe</code>. The browser
                  always asks what to share — nothing is captured silently.
                </p>
              </section>
              </div>
            )}
            {tab === "plugins" && (
              <div className="space-y-1.5">
                {PLUGINS.map((p) => {
                  const off = disabledPlugins.includes(p.id);
                  return (
                    <div key={p.id} className="flex items-start gap-2.5 rounded-md border p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 font-mono text-xs font-semibold">
                          <span aria-hidden className={cn("size-1.5 rounded-full", off ? "bg-muted-foreground/40" : "bg-emerald-400")} />
                          {p.name}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{p.description}</p>
                        <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">{p.tools.join(" · ")}</p>
                      </div>
                      <Switch
                        checked={!off}
                        onCheckedChange={() => useDuckyStore.getState().togglePlugin(p.id)}
                        aria-label={`Toggle ${p.name}`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            {tab === "skills" && (
              <div className="space-y-1.5">
                {SKILLS.map((s) => (
                  <div key={s.name} className="rounded-md border p-2.5">
                    <p className="flex items-center gap-1.5 font-mono text-xs font-semibold">
                      <GraduationCap className="size-3.5 text-[#FDC00A]" aria-hidden />
                      {s.name}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{s.description}</p>
                  </div>
                ))}
              </div>
            )}
            {tab === "commands" && (
              <div className="space-y-1">
                {SLASH_COMMANDS.map((c) => (
                  <div key={c.cmd} className="flex items-baseline gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40">
                    <span className="shrink-0 font-mono text-xs font-semibold">{c.cmd}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{c.desc}</span>
                  </div>
                ))}
              </div>
            )}
            {tab === "memory" && (
              <div className="space-y-1.5">
                {memories.length === 0 && (
                  <p className="rounded-md border p-3 text-xs text-muted-foreground">
                    No memories yet — the agent saves them with <code className="font-mono">memory_save</code>, or use <code className="font-mono">/remember</code> in chat.
                  </p>
                )}
                {memories.map((m) => (
                  <div key={m.id} className="flex items-start gap-2 rounded-md border p-2.5">
                    <p className="min-w-0 flex-1 break-words text-xs">{m.text}</p>
                    <button
                      type="button"
                      aria-label="Forget this memory"
                      onClick={() => {
                        forgetMemory(m.id);
                        setMemories(listMemories());
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {tab === "shortcuts" && (
              <div className="space-y-1">
                {SHORTCUTS.map(([keys, what]) => (
                  <div key={keys} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40">
                    <kbd className="shrink-0 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                      {keys}
                    </kbd>
                    <span className="text-xs text-muted-foreground">{what}</span>
                  </div>
                ))}
              </div>
            )}
            {tab === "usage" && (
              <UsageSection sessions={sessions} />
            )}
            {tab === "about" && (
              <div className="space-y-5">
              <section className="rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <img
                    src="/ducky-mark.png"
                    alt="Ducky AI logo"
                    className="size-8 rounded-md border border-[#FDC00A]/25 bg-black"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">Ducky AI | Coder</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      v1.0 · model: {modelDisplayName(draft.model)}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  A browser-native coding agent console — plugin-based harness, virtual
                  workspace FS and permission gates, built with Next.js. Every chat
                  streams through <span className="text-foreground/80">your own model</span> via a
                  stateless, serverless proxy — no database, no server-side session state.
                </p>
              </section>

              <section className="rounded-md border border-destructive/50 p-3">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                  <TriangleAlert className="size-3.5" aria-hidden /> Danger zone
                </h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Wipe all sessions, workspace files and reset preferences.
                </p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="mt-2">
                      Reset everything…
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reset all local data?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This deletes every session (including messages and virtual workspaces)
                        and restores default settings. Your API key will be cleared too. This
                        cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-white hover:bg-destructive/90"
                        onClick={() => {
                          useDuckyStore.getState().clearAllSessions();
                          useDuckyStore.getState().updateSettings(FALLBACK_DEFAULTS);
                          toast.success("All local data cleared");
                        }}
                      >
                        Reset everything
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </section>
              </div>
            )}
          </div>

          {/* footer */}
          <div className="flex shrink-0 items-center gap-2 border-t px-6 py-3">
            <p className="hidden font-mono text-[10px] text-muted-foreground sm:block">
              Model, key and URL above save with the rest
            </p>
            <Button onClick={save} className="ml-auto gap-2">
              <Check className="size-4" /> Save settings
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Scan-this-PC: probe candidate localhost MCP bridges, one-click connect. */
function ScanThisPc({ onFound }: { onFound: () => void }) {
  const [scanning, setScanning] = React.useState(false);
  const [hits, setHits] = React.useState<import("@/lib/ducky/mcp").McpScanHit[]>([]);
  const [ran, setRan] = React.useState(false);

  const scan = () => {
    setScanning(true);
    setHits([]);
    setRan(false);
    void import("@/lib/ducky/mcp").then(({ scanLocalMcp }) =>
      scanLocalMcp().then(
        ({ hits: h }) => {
          setHits(h);
          setRan(true);
          setScanning(false);
        },
        () => {
          setRan(true);
          setScanning(false);
        },
      ),
    );
  };

  return (
    <div className="rounded-md border border-dashed p-2.5">
      <div className="flex items-center gap-2">
        <Radar className="size-3.5 text-fuchsia-400" aria-hidden />
        <p className="flex-1 text-[11px] text-muted-foreground">
          Look at this PC and try to connect: probes localhost MCP bridges.
        </p>
        <Button size="sm" variant="outline" onClick={scan} disabled={scanning} className="h-7 shrink-0">
          {scanning ? "Scanning…" : "Scan this PC"}
        </Button>
      </div>
      {ran && hits.length === 0 && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Nothing answered. Start a bridge (Blender / Roblox Studio / browser MCP on localhost), then scan again.
        </p>
      )}
      {hits.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {hits.map((h) => (
            <li key={h.url} className="flex items-center gap-2 rounded bg-muted/50 px-2 py-1.5">
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[11px]">{h.url}</span>
                <span className="block font-mono text-[10px] text-muted-foreground">
                  {h.tools} tool(s){h.alreadyRegistered ? " · registered" : ""}
                </span>
              </span>
              {!h.alreadyRegistered && (
                <button
                  type="button"
                  onClick={() => {
                    try {
                      addMcpServer(`bridge-${h.url.match(/:(\d+)/)?.[1] ?? "local"}`, h.url);
                      onFound();
                      setHits((prev) => prev.map((x) => (x.url === h.url ? { ...x, alreadyRegistered: true } : x)));
                      toast.success("MCP bridge connected");
                    } catch (e) {
                      toast.error("Cannot add bridge", { description: (e as Error).message });
                    }
                  }}
                  className="shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] hover:bg-accent"
                >
                  Connect
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Aggregate usage across sessions (reads the live store — always current). */
function UsageSection({ sessions }: { sessions: import("@/lib/ducky/types").Session[] }) {
  const totals = sessions.reduce(
    (acc, s) => ({
      tools: acc.tools + s.stats.toolCalls,
      prompt: acc.prompt + s.stats.promptTokens,
      completion: acc.completion + s.stats.completionTokens,
      files: acc.files + Object.keys(s.workspace).length,
      messages: acc.messages + s.messages.length,
    }),
    { tools: 0, prompt: 0, completion: 0, files: 0, messages: 0 },
  );
  const top = [...sessions]
    .sort((a, b) => b.stats.promptTokens + b.stats.completionTokens - (a.stats.promptTokens + a.stats.completionTokens))
    .slice(0, 5);
  const cards: Array<[string, string]> = [
    ["Tool calls", String(totals.tools)],
    ["Prompt tokens", totals.prompt.toLocaleString()],
    ["Completion tokens", totals.completion.toLocaleString()],
    ["Messages", String(totals.messages)],
    ["Workspace files", String(totals.files)],
    ["Sessions", String(sessions.length)],
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-md border p-2.5">
            <p className="truncate font-mono text-sm font-semibold">{value}</p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      {top.length > 0 && (
        <div className="rounded-md border p-2.5">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            Heaviest sessions
          </p>
          <ul className="space-y-1">
            {top.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {(s.stats.promptTokens + s.stats.completionTokens).toLocaleString()} tok
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── sub-pieces ─────────────────────────────────── */

function PolicyOption({
  value,
  current,
  onSelect,
  icon,
  title,
  desc,
}: {
  value: PermissionPolicy;
  current: PermissionPolicy;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Label
      htmlFor={`policy-${value}`}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 transition-colors",
        current === value ? "border-ring bg-accent" : "hover:bg-muted/50",
      )}
    >
      <RadioGroupItem id={`policy-${value}`} value={value} className="mt-0.5" />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-mono text-xs font-semibold">
          <span className="text-[#FDC00A]">{icon}</span>
          {title}
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{desc}</span>
      </span>
    </Label>
  );
}

function SliderRow({
  label,
  hint,
  min,
  max,
  step,
  value,
  onChange,
  format,
}: {
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: number[];
  onChange: (v: number[]) => void;
  format: (v: number) => string;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs">{label}</Label>
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <Badge variant="secondary" className="font-mono text-[11px]">
          {format(value[0])}
        </Badge>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        onValueChange={onChange}
        aria-label={`${label} slider`}
      />
    </section>
  );
}
