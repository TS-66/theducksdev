"use client";

import * as React from "react";
import { PackageCheck, PackagePlus, Search, Store } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDuckyStore } from "@/lib/ducky/store";
import { PLUGINS } from "@/lib/ducky/plugins";
import { toast } from "sonner";

/**
 * Plugin marketplace: every shipped plugin, searchable, one click to
 * install (enable) or remove (disable). Toggling unloads the plugin's
 * tools from the model's schema immediately.
 */
export function MarketplacePanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const disabledPlugins = useDuckyStore((s) => s.disabledPlugins);
  const [query, setQuery] = React.useState("");
  const [cat, setCat] = React.useState<string>("all");

  const enabledCount = PLUGINS.length - disabledPlugins.length;

  const cats = React.useMemo(
    () => ["all", ...Array.from(new Set(PLUGINS.map((p) => p.category)))],
    [],
  );

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return PLUGINS.filter((p) => {
      if (cat !== "all" && p.category !== cat) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tools.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [query, cat]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-label="Plugin marketplace"
        className="flex h-[84vh] max-h-[820px] w-[860px] max-w-[94vw] flex-col gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">Plugin marketplace</DialogTitle>
        <DialogDescription className="sr-only">
          Browse, search, install and remove agent plugins.
        </DialogDescription>
        <div className="flex shrink-0 items-center gap-2 border-b px-5 pb-3 pt-4">
          <Store className="size-4 shrink-0 text-[#FDC00A]" aria-hidden />
          <h2 className="truncate text-lg font-bold tracking-tight">Marketplace</h2>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {enabledCount}/{PLUGINS.length} installed
          </span>
          <div className="relative ml-auto w-52">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search plugins or tools…"
              aria-label="Search plugins"
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5 border-b px-5 py-2">
          {cats.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={cn(
                "rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors",
                cat === c
                  ? "border-[#FDC00A]/50 bg-[#FDC00A]/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
          {shown.length === 0 && (
            <p className="py-10 text-center text-xs text-muted-foreground">
              No plugins match “{query}”.
            </p>
          )}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {shown.map((p) => {
              const off = disabledPlugins.includes(p.id);
              return (
                <div
                  key={p.id}
                  className={cn(
                    "ducky-glass flex flex-col gap-2 rounded-2xl p-3.5 transition-all",
                    !off && "ring-1 ring-emerald-400/20",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        off ? "bg-muted-foreground/40" : "bg-emerald-400",
                      )}
                    />
                    <p className="min-w-0 flex-1 truncate font-mono text-xs font-semibold">
                      {p.name.replace("@ducky-ai/", "")}
                    </p>
                    <Badge variant="outline" className="shrink-0 font-mono text-[9px]">
                      v{p.version} · {p.category}
                    </Badge>
                  </div>
                  <p className="min-h-8 text-[11px] leading-snug text-muted-foreground">
                    {p.description}
                  </p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground/70">
                    {p.tools.join(" · ")}
                  </p>
                  <Button
                    size="sm"
                    variant={off ? "default" : "outline"}
                    onClick={() => {
                      useDuckyStore.getState().togglePlugin(p.id);
                      toast.success(off ? `Installed ${p.name}` : `Removed ${p.name}`, {
                        description: off
                          ? `${p.tools.length} tool(s) added to the model schema.`
                          : "Its tools left the model schema.",
                      });
                    }}
                    className="mt-auto w-full gap-1.5"
                  >
                    {off ? (
                      <>
                        <PackagePlus className="size-3.5" /> Install
                      </>
                    ) : (
                      <>
                        <PackageCheck className="size-3.5" /> Installed — remove
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
