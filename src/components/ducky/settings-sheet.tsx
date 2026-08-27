"use client";

import * as React from "react";
import {
  Check,
  Eye,
  FlaskConical,
  Hand,
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
import { MODEL_DISPLAY, MODEL_ID } from "@/lib/ducky/models";
import type { PermissionPolicy, Settings } from "@/lib/ducky/types";

export type SettingsTab = "behavior" | "about";

const FALLBACK_DEFAULTS: Settings = {
  apiKey: "",
  baseUrl: "",
  model: MODEL_ID,
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
  const [tab, setTab] = React.useState<SettingsTab>(initialTab ?? "behavior");
  const [draft, setDraft] = React.useState<Settings>(
    useDuckyStore.getState().settings,
  );

  // re-seed draft whenever the sheet opens / forced tab changes
  React.useEffect(() => {
    if (!open) return;
    setDraft(useDuckyStore.getState().settings);
    if (initialTab) setTab(initialTab);
  }, [open, initialTab]);

  const patch = (p: Partial<Settings>) => setDraft((d) => ({ ...d, ...p }));

  const save = () => {
    useDuckyStore.getState().updateSettings(draft);
    toast.success("Settings saved", { description: `policy=${draft.policy}` });
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
          <TabsList className="mx-4 mt-3 grid grid-cols-2">
            <TabsTrigger value="behavior">Behavior</TabsTrigger>
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

              <section className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Label className="flex items-center gap-1.5 text-xs">
                      <FlaskConical className="size-3 text-amber-400" aria-hidden /> Demo mode
                    </Label>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      Scripted agent flows with <strong>real</strong> tool execution — no key
                      required. Implied automatically while no credentials are configured.
                    </p>
                  </div>
                  <Switch
                    checked={draft.demoMode}
                    onCheckedChange={(v) => patch({ demoMode: v })}
                    aria-label="Force demo mode"
                  />
                </div>
              </section>

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
                      v1.0 · model: {MODEL_DISPLAY}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  A browser-native coding agent console — plugin-based harness, virtual
                  workspace FS and permission gates, built with Next.js. Every chat
                  streams through <span className="text-foreground/80">{MODEL_DISPLAY}</span> via a
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
