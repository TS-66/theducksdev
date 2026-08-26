"use client";

import * as React from "react";
import {
  Brain,
  Check,
  Copy,
  DatabaseBackup,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FileJson,
  FlaskConical,
  Hand,
  HardDrive,
  Image as ImageIcon,
  KeyRound,
  MessageSquare,
  TriangleAlert,
  Upload,
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
import { useDshStore } from "@/lib/dsh/store";
import {
  downloadSessionsBackup,
  parseBackupFile,
} from "@/lib/dsh/session-backup";
import type { PermissionPolicy, Settings } from "@/lib/dsh/types";

export type SettingsTab = "models" | "behavior" | "data" | "about";

const FALLBACK_DEFAULTS: Settings = {
  apiKey: "",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-chat",
  temperature: 0.7,
  maxTokens: 4096,
  policy: "ask",
  systemPromptExtra: "",
  maxToolIterations: 6,
  showReasoning: true,
  demoMode: false,
};

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: SettingsTab;
}

export function SettingsSheet({ open, onOpenChange, initialTab }: SettingsSheetProps) {
  const storeSettings = useDshStore((s) => s.settings);
  const [tab, setTab] = React.useState<SettingsTab>(initialTab ?? "models");
  const [draft, setDraft] = React.useState<Settings>(storeSettings);
  const [showKey, setShowKey] = React.useState(false);

  // re-seed draft whenever the sheet opens / forced tab changes
  React.useEffect(() => {
    if (!open) return;
    setDraft(useDshStore.getState().settings);
    if (initialTab) setTab(initialTab);
  }, [open, initialTab]);

  const patch = (p: Partial<Settings>) => setDraft((d) => ({ ...d, ...p }));

  const save = () => {
    useDshStore.getState().updateSettings(draft);
    toast.success("Settings saved", { description: `model=${draft.model} · policy=${draft.policy}` });
  };

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
          <TabsList className="mx-4 mt-3 grid grid-cols-4">
            <TabsTrigger value="models">Models</TabsTrigger>
            <TabsTrigger value="behavior">Behavior</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
          </TabsList>

          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {/* ── Models ─────────────────────────────────────────────── */}
            <TabsContent value="models" className="mt-0 space-y-5">
              <section className="space-y-1.5">
                <Label htmlFor="dsh-api-key" className="flex items-center gap-1.5 text-xs">
                  <KeyRound className="size-3 text-[#4D6BFE]" aria-hidden /> DeepSeek API key
                </Label>
                <div className="relative">
                  <Input
                    id="dsh-api-key"
                    type={showKey ? "text" : "password"}
                    value={draft.apiKey}
                    onChange={(e) => patch({ apiKey: e.target.value })}
                    placeholder="sk-…"
                    autoComplete="off"
                    spellCheck={false}
                    className="pr-9 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    aria-label={showKey ? "Hide API key" : "Show API key"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
                  >
                    {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Stored only in this browser&apos;s localStorage — requests are proxied
                  serverlessly without persistence. Get a key at{" "}
                  <a
                    href="https://platform.deepseek.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    platform.deepseek.com
                  </a>
                  .
                </p>
              </section>

              <section className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="dsh-base-url" className="text-xs">
                    Base URL
                  </Label>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/60">
                    advanced
                  </span>
                </div>
                <Input
                  id="dsh-base-url"
                  value={draft.baseUrl}
                  onChange={(e) => patch({ baseUrl: e.target.value })}
                  placeholder="https://api.deepseek.com"
                  className="h-8 font-mono text-xs"
                  spellCheck={false}
                />
              </section>

              <section className="space-y-1.5">
                <Label className="text-xs">Model</Label>
                <div role="radiogroup" aria-label="Choose model" className="grid gap-2">
                  <ModelCard
                    active={draft.model === "deepseek-chat"}
                    onSelect={() => patch({ model: "deepseek-chat" })}
                    title="deepseek-chat"
                    icon={<MessageSquare className="size-4 text-[#4D6BFE]" aria-hidden />}
                    desc="V3 · fast general-purpose chat & coding assistant."
                    blurb="best default · cheap"
                  />
                  <ModelCard
                    active={draft.model === "deepseek-reasoner"}
                    onSelect={() => patch({ model: "deepseek-reasoner" })}
                    title="deepseek-reasoner"
                    icon={<Brain className="size-4 text-[#4D6BFE]" aria-hidden />}
                    desc="R1 · shows chain-of-thought for deep reasoning tasks."
                    blurb="slower · deeper thinking"
                  />
                </div>
              </section>

              <section className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Label className="flex items-center gap-1.5 text-xs">
                      <FlaskConical className="size-3 text-amber-400" aria-hidden /> Demo mode
                    </Label>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      Scripted agent flows with <strong>real</strong> tool execution — no key
                      required. Implied automatically while the API key is empty.
                    </p>
                  </div>
                  <Switch
                    checked={draft.demoMode}
                    onCheckedChange={(v) => patch({ demoMode: v })}
                    aria-label="Force demo mode"
                  />
                </div>
              </section>
            </TabsContent>

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
                  <Label htmlFor="dsh-show-reasoning" className="text-xs">
                    Show reasoning
                  </Label>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Render R1 chain-of-thought as a “Thinking…” card.
                  </p>
                </div>
                <Switch
                  id="dsh-show-reasoning"
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
                <Label htmlFor="dsh-sys-extra" className="text-xs">
                  Extra system instructions
                </Label>
                <Textarea
                  id="dsh-sys-extra"
                  value={draft.systemPromptExtra}
                  onChange={(e) => patch({ systemPromptExtra: e.target.value })}
                  placeholder="Extra instructions appended to the dsh system prompt…"
                  className="min-h-24 font-mono text-xs"
                />
              </section>
            </TabsContent>

            {/* ── Data ───────────────────────────────────────────────── */}
            <TabsContent value="data" className="mt-0 space-y-5">
              <BackupSection />
              <StorageUsageSection />
            </TabsContent>

            {/* ── About ──────────────────────────────────────────────── */}
            <TabsContent value="about" className="mt-0 space-y-5">
              <section className="rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono">
                    dsh web v0.1
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    DeepSeek Harness Web Edition
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  A browser-native recreation of{" "}
                  <a
                    href="https://github.com/deepseek-ai/deepseek-harness"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-primary underline underline-offset-2"
                  >
                    deepseek-harness <ExternalLink className="size-3" />
                  </a>{" "}
                  — plugin-based agent harness, virtual workspace FS and permission gates,
                  rebuilt for Next.js + Vercel. UI by Task 2-b; agent engine by Task 2-a.
                </p>
              </section>

              <section className="rounded-md border p-3">
                <h3 className="text-xs font-semibold">Deploy on Vercel</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  The app is fully stateless client-side — one click away from your own URL:
                </p>
                <div className="mt-2 flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-primary">
                    npx vercel --prod
                  </code>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Copy deploy command"
                    className="size-7 shrink-0"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText("npx vercel --prod");
                        toast.success("Copied", { description: "npx vercel --prod" });
                      } catch {
                        /* noop */
                      }
                    }}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
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
                          useDshStore.getState().clearAllSessions();
                          useDshStore.getState().updateSettings(FALLBACK_DEFAULTS);
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

/** Data tab — full backup export/import of every session as one JSON file. */
function BackupSection() {
  const sessions = useDshStore((s) => s.sessions);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const totalMessages = React.useMemo(
    () => sessions.reduce((n, s) => n + s.messages.length, 0),
    [sessions],
  );
  const totalFiles = React.useMemo(
    () => sessions.reduce((n, s) => n + Object.keys(s.workspace).length, 0),
    [sessions],
  );

  const exportBackup = () => {
    if (sessions.length === 0) {
      toast.info("Nothing to back up yet", { description: "Create a session first." });
      return;
    }
    downloadSessionsBackup(sessions);
    toast.success("Backup downloaded", {
      description: `${sessions.length} session${sessions.length === 1 ? "" : "s"} · ${totalMessages} messages. API key never included.`,
    });
  };

  const onImportFile = async (file: File) => {
    try {
      const res = parseBackupFile(await file.text());
      const imported = useDshStore.getState().importSessions(res.sessions);
      if (imported === 0) throw new Error("No valid sessions found in this backup.");
      toast.success(`Imported ${imported} session${imported === 1 ? "" : "s"}`, {
        description:
          res.skipped > 0
            ? `${res.skipped} malformed entr${res.skipped === 1 ? "y" : "ies"} skipped. Ids were regenerated — no collisions.`
            : "Ids regenerated — safe to import repeatedly.",
      });
    } catch (e) {
      toast.error("Import failed", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <section className="space-y-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md border border-[#4D6BFE]/40 bg-[#4D6BFE]/10">
          <DatabaseBackup className="size-4 text-[#4D6BFE]" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-xs font-semibold">Local backup</h3>
          <p className="text-[11px] text-muted-foreground">
            All sessions with messages, virtual workspaces and todos in one JSON file.
          </p>
        </div>
      </div>

      {/* stat strip */}
      <div className="grid grid-cols-3 gap-2" aria-label="Backup scope">
        {[
          { label: "sessions", value: sessions.length },
          { label: "messages", value: totalMessages },
          { label: "v-files", value: totalFiles },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 text-center"
          >
            <p className="font-mono text-sm font-semibold">{stat.value}</p>
            <p className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={exportBackup} disabled={sessions.length === 0}>
          <Download className="mr-1.5 size-3.5" /> Export .json
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mr-1.5 size-3.5" /> Import…
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onImportFile(f);
          e.target.value = "";
        }}
      />

      <ul className="space-y-1 border-t pt-2 text-[11px] leading-relaxed text-muted-foreground">
        <li className="flex items-start gap-1.5">
          <FileJson className="mt-0.5 size-3 shrink-0 text-muted-foreground/70" aria-hidden />
          Imports are sanitized and ids regenerated, so re-importing never duplicates or collides.
        </li>
        <li className="flex items-start gap-1.5">
          <TriangleAlert className="mt-0.5 size-3 shrink-0 text-amber-400" aria-hidden />
          Your API key is deliberately never written to backups.
        </li>
      </ul>
    </section>
  );
}

/* ───────────────────────── storage usage (Data tab) ─────────────────────── */

const STORE_KEY = "dsh-web-store-v1";
/** Chrome/Firefox grant ~5 MB per origin for localStorage — treat as the budget. */
const LS_QUOTA = 5 * 1024 * 1024;

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

/**
 * Live read of what dsh web actually occupies in localStorage, with a quota
 * meter and the heaviest sessions called out — pasted images live here too.
 */
function StorageUsageSection() {
  const sessions = useDshStore((s) => s.sessions);

  const usage = React.useMemo(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY) ?? "";
      const total = new Blob([raw]).size;
      let persisted: Array<Record<string, unknown>> = [];
      try {
        persisted =
          (JSON.parse(raw) as { state?: { sessions?: Array<Record<string, unknown>> } })
            .state?.sessions ?? [];
      } catch {
        /* degraded measurements only */
      }
      const byId = new Map(
        persisted.map((p) => [String(p.id ?? ""), p] as const),
      );
      const rows = sessions
        .map((s) => ({
          id: s.id,
          title: s.title,
          bytes: (() => {
            const p = byId.get(s.id);
            return p ? new Blob([JSON.stringify(p)]).size : 0;
          })(),
          files: Object.keys(s.workspace).length,
          images: Object.values(s.workspace).filter((c) => typeof c === "string" && isDataUrlImage(c)).length,
        }))
        .sort((a, b) => b.bytes - a.bytes);
      return { total, rows };
    } catch {
      return { total: 0, rows: [] };
    }
  }, [sessions]);

  const pct = Math.min(100, (usage.total / LS_QUOTA) * 100);
  const tone = pct >= 85 ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-emerald-500";
  const topRows = usage.rows.filter((r) => r.bytes > 0).slice(0, 4);

  return (
    <section className="space-y-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md border border-violet-500/40 bg-violet-500/10">
          <HardDrive className="size-4 text-violet-400" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-xs font-semibold">Storage usage</h3>
          <p className="text-[11px] text-muted-foreground">
            Everything lives in this browser&apos;s localStorage — messages, workspaces and pasted
            images.
          </p>
        </div>
      </div>

      {/* quota meter */}
      <div>
        <div className="mb-1 flex items-baseline justify-between font-mono text-[10px] text-muted-foreground">
          <span>
            {fmtBytes(usage.total)} used · {fmtBytes(Math.max(0, LS_QUOTA - usage.total))} free
          </span>
          <span>{pct.toFixed(pct < 10 ? 1 : 0)}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="localStorage quota used"
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn("h-full rounded-full transition-all duration-500", tone)}
            style={{ width: `${Math.max(pct, usage.total > 0 ? 2 : 0)}%` }}
          />
        </div>
      </div>

      {topRows.length > 0 ? (
        <ul className="space-y-1 border-t pt-2">
          {topRows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 font-mono text-[10px]">
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.title}</span>
              {r.images > 0 && (
                <span
                  className="flex shrink-0 items-center gap-0.5 rounded bg-pink-500/10 px-1 py-px text-pink-300"
                  title={`${r.images} image${r.images === 1 ? "" : "s"} in workspace`}
                >
                  <ImageIcon className="size-2.5" aria-hidden /> {r.images}
                </span>
              )}
              <span className="w-16 shrink-0 text-right text-foreground/80">{fmtBytes(r.bytes)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t pt-2 font-mono text-[10px] text-muted-foreground">
          no measurable sessions yet.
        </p>
      )}

      {pct >= 60 && (
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-400">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
          Storage is filling up — export a backup, then delete heavy sessions (large pasted images
          are usually the culprit).
        </p>
      )}
    </section>
  );
}

function isDataUrlImage(content: string): boolean {
  return /^data:image\//i.test(content.slice(0, 40));
}

function ModelCard({
  active,
  onSelect,
  title,
  desc,
  blurb,
  icon,
}: {
  active: boolean;
  onSelect: () => void;
  title: string;
  desc: string;
  blurb: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors",
        active ? "border-ring bg-accent ring-1 ring-ring" : "hover:bg-muted/50",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      )}
    >
      <span className="mt-0.5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[13px] font-semibold">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{desc}</span>
        <span className="mt-1 inline-block rounded-full bg-muted px-1.5 py-px font-mono text-[10px] text-muted-foreground">
          {blurb}
        </span>
      </span>
      {active && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
    </button>
  );
}

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
          <span className="text-[#4D6BFE]">{icon}</span>
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
