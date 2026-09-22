"use client";

import * as React from "react";
import { ExternalLink, Globe, Plus, RotateCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  closeTab,
  getActiveTab,
  getTabsRevision,
  listTabs,
  openTab,
  setActiveTab,
  subscribeTabs,
  type BrowserTab,
} from "@/lib/ducky/browser-tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function useBrowserTabs(): { tabs: BrowserTab[]; active: BrowserTab | null } {
  const rev = React.useSyncExternalStore(subscribeTabs, getTabsRevision, getTabsRevision);
  return React.useMemo(() => ({ tabs: listTabs(), active: getActiveTab() }), [rev]);
}

/** In-app browser panel: tab strip + address bar + sandboxed page view. */
export function BrowserPanel() {
  const { tabs, active } = useBrowserTabs();
  const [draft, setDraft] = React.useState("");
  const [frameKey, setFrameKey] = React.useState(0);

  const navigate = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    const url = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    try {
      openTab(url);
      setDraft("");
    } catch (e) {
      toast.error("Cannot open tab", { description: (e as Error).message });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* tab strip */}
      <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b bg-muted/20 px-2">
        <Globe className="size-3.5 shrink-0 text-cyan-400" aria-hidden />
        {tabs.length === 0 && (
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            no tabs — ask Ducky to browser_open a URL, or paste one below
          </span>
        )}
        {tabs.map((t) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === active?.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "group flex h-7 max-w-52 cursor-pointer items-center gap-1.5 rounded-t-md border-b-2 px-2 font-mono text-[11px]",
              t.id === active?.id
                ? "border-cyan-400 bg-background text-foreground"
                : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
            title={t.url}
          >
            <span className="truncate">{t.title}</span>
            <button
              type="button"
              aria-label={`Close ${t.title}`}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.id);
              }}
              className="rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
      </div>

      {/* address bar */}
      <div className="flex shrink-0 items-center gap-1.5 border-b bg-muted/10 px-2 py-1.5">
        <Button
          size="icon"
          variant="ghost"
          aria-label="Reload active tab"
          disabled={!active}
          onClick={() => setFrameKey((k) => k + 1)}
          className="size-7 shrink-0"
        >
          <RotateCw className="size-3.5" />
        </Button>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") navigate(draft);
          }}
          placeholder={active ? active.url : "https://… — paste a URL and press Enter"}
          spellCheck={false}
          aria-label="Browser address bar"
          className="h-7 font-mono text-xs"
        />
        {active && (
          <Button
            size="icon"
            variant="ghost"
            aria-label="Open active tab in a real browser window"
            onClick={() => window.open(active.url, "_blank", "noopener")}
            className="size-7 shrink-0"
          >
            <ExternalLink className="size-3.5" />
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate(draft || "https://")}
          className="h-7 shrink-0 gap-1 font-mono text-[11px]"
        >
          <Plus className="size-3" /> tab
        </Button>
      </div>

      {/* page view */}
      <div className="relative min-h-0 flex-1 bg-background">
        {active ? (
          <iframe
            key={`${active.id}:${frameKey}`}
            src={active.url}
            title={active.title}
            sandbox="allow-scripts allow-same-origin allow-forms"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full border-0 bg-white"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <Globe className="size-8 text-cyan-400/40" aria-hidden />
            <p className="text-sm font-semibold">Browser is empty</p>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              Tell Ducky to <code className="font-mono">browser_open</code> a page and{" "}
              <code className="font-mono">browser_snapshot</code> to read it — pages render
              here for you while the agent reads their text. Sites that forbid
              embedding show a blank frame; the agent can still read them.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
