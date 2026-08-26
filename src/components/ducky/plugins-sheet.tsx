"use client";

import * as React from "react";
import {
  Folder,
  Globe,
  ListTodo,
  MessageCircleQuestion,
  Network,
  Puzzle,
  SquareTerminal,
  Boxes,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useDuckyStore } from "@/lib/ducky/store";
import type { PluginManifest } from "@/lib/ducky/types";
import { PLUGINS } from "@/lib/ducky/plugins";

const CATEGORY_META: Record<
  PluginManifest["category"],
  { label: string; icon: React.ReactNode }
> = {
  filesystem: { label: "filesystem", icon: <Folder className="size-3" aria-hidden /> },
  shell: { label: "shell", icon: <SquareTerminal className="size-3" aria-hidden /> },
  planning: { label: "planning", icon: <ListTodo className="size-3" aria-hidden /> },
  delegation: { label: "delegation", icon: <Network className="size-3" aria-hidden /> },
  web: { label: "web", icon: <Globe className="size-3" aria-hidden /> },
  interaction: {
    label: "interaction",
    icon: <MessageCircleQuestion className="size-3" aria-hidden />,
  },
  meta: { label: "meta", icon: <Boxes className="size-3" aria-hidden /> },
};

const CATEGORY_ORDER = [
  "filesystem",
  "shell",
  "planning",
  "delegation",
  "web",
  "interaction",
  "meta",
] as const;

interface PluginsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PluginsSheet({ open, onOpenChange }: PluginsSheetProps) {
  const disabledPlugins = useDuckyStore((s) => s.disabledPlugins);
  const enabledCount = PLUGINS.length - disabledPlugins.length;

  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    plugins: PLUGINS.filter((p) => p.category === cat),
  })).filter((g) => g.plugins.length > 0);

  return (
    <PuzzleSheetShell
      open={open}
      onOpenChange={onOpenChange}
      subtitle={`${enabledCount}/${PLUGINS.length} loaded`}
    >
      <div className="space-y-5">
        <section className="space-y-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Puzzle className="size-4 text-[#FDC00A]" aria-hidden /> Plugins
          </h2>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Everything is a plugin. Each package below contributes tools to the model&apos;s
            schema; toggling one off unloads it exactly like a Cordis package.
          </p>
        </section>

        {grouped.map(({ cat, plugins }) => (
          <section key={cat} className="space-y-1.5">
            <h3 className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
              {CATEGORY_META[cat].icon}
              {CATEGORY_META[cat].label}
            </h3>
            {plugins.map((plugin) => {
              const enabled = !disabledPlugins.includes(plugin.id);
              return (
                <PluginCard
                  key={plugin.id}
                  plugin={plugin}
                  enabled={enabled}
                  onToggle={(on) => {
                    useDuckyStore.getState().togglePlugin(plugin.id);
                    toast.success(`${on ? "Enabled" : "Disabled"} ${plugin.name}`, {
                      description: on
                        ? `${plugin.tools.length} tool(s) added to the schema.`
                        : `Tools unloaded: ${plugin.tools.join(", ")}`,
                    });
                  }}
                />
              );
            })}
          </section>
        ))}

        <p className="border-t pt-3 text-[10px] leading-relaxed text-muted-foreground/70">
          Disabled plugins are removed from the tool schema sent to the model — like unloading a
          Cordis package. Side-effecting tools remain subject to your permission policy either
          way.
        </p>
      </div>
    </PuzzleSheetShell>
  );
}

function PluginCard({
  plugin,
  enabled,
  onToggle,
}: {
  plugin: PluginManifest;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div className="rounded-md border bg-card/50 p-2.5 transition-colors hover:bg-card">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-mono text-[13px] font-semibold text-[#FDC00A] dark:text-[#7b90ff]">
              {plugin.name}
            </span>
            <Badge variant="secondary" className="px-1 py-0 font-mono text-[9px] text-muted-foreground">
              v{plugin.version}
            </Badge>
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {plugin.description}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {plugin.tools.map((t) => (
              <code
                key={t}
                className="rounded border border-border/60 bg-muted/60 px-1 py-px font-mono text-[10px] text-muted-foreground"
              >
                {t}
              </code>
            ))}
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => onToggle(Boolean(v))}
          aria-label={`Toggle plugin ${plugin.name}`}
          className="mt-1 shrink-0"
        />
      </div>
    </div>
  );
}

/* shell wrapper keeps Sheet markup in one place */
function PuzzleSheetShell({
  open,
  onOpenChange,
  subtitle,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[400px] max-w-[94vw] flex-col gap-0 sm:max-w-[400px]">
        <SheetHeader className="border-b">
          <SheetTitle className="sr-only">Plugins</SheetTitle>
          <SheetDescription className="sr-only">Manage the ducky plugin registry</SheetDescription>
          <span className="font-mono text-[10px] text-muted-foreground">{subtitle}</span>
        </SheetHeader>
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
