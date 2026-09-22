"use client";

import * as React from "react";
import {
  Check,
  Eye,
  EyeOff,
  Hand,
  KeyRound,
  Plug,
  RefreshCw,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import type { PermissionPolicy, Settings } from "@/lib/ducky/types";

export type SettingsTab = "behavior" | "connections" | "about";

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

export function SettingsSheet({ open, onOpenChange, initialTab }: SettingsSheetProps) {
  const [tab, setTab] = React.useState<SettingsTab>(initialTab ?? "behavior");
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

  const runTest = async () => {
    setTesting(true);
    setConnTest(null);
    try {
      setConnTest(await testConnection(draft.baseUrl, draft.apiKey));
    } finally {
      setTesting(false);
    }
  };

  const runDiscover = async () => {
    setDiscovering(true);
    try {
      const models = await discoverModels(draft.baseUrl, draft.apiKey);
      setDiscovered(models.map((m) => m.id).slice(0, 100));
      toast.success(`Found ${models.length} model(s)`, {
        description: models.length ? "Pick one below — it fills the model field." : undefined,
      });
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
      if (initialTab) setTab(initialTab);
    }, 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [open, initialTab]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[420px] max-w-[94vw] flex-col gap-0 sm:max-w-[420px]">
        <SheetHeader className="border-b">
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Everything lives in this browser&apos;s localStorage.
          </SheetDescription>
        </SheetHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as SettingsTab)} className="flex min-h-0 flex-1 flex-col gap-0">
          <TabsList className="mx-4 mt-3 grid grid-cols-3">
            <TabsTrigger value="behavior">Behavior</TabsTrigger>
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
          </TabsList>

          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {/* ── Behavior ───────────────────────────────────────────── */}
            <TabsContent value="behavior" className="mt-0 space-y-6">
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
            </TabsContent>

            {/* ── Connections ────────────────────────────────────────── */}
            <TabsContent value="connections" className="mt-0 space-y-5">
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
            </TabsContent>

            {/* ── About ──────────────────────────────────────────────── */}
            <TabsContent value="about" className="mt-0 space-y-5">
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
            </TabsContent>
          </div>
        </Tabs>

        {/* footer */}
        <div className="border-t p-3">
          <Button onClick={save} className="w-full gap-2">
            <Check className="size-4" /> Save settings
          </Button>
        </div>
      </SheetContent>
    </Sheet>
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
