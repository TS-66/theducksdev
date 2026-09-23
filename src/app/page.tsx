"use client";

import * as React from "react";
import { Command, Menu, PanelRight, Puzzle, Settings, SquareTerminal } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  APP_VERSION,
  checkForUpdate,
  dismissUpdate,
  type ReleaseInfo,
} from "@/lib/ducky/app-version";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ActivityTimelinePanel } from "@/components/ducky/activity-panel";
import { ApprovalCard } from "@/components/ducky/approval-card";
import { AskUserCard } from "@/components/ducky/ask-user-card";
import { ChatStream } from "@/components/ducky/chat-stream";
import { Composer } from "@/components/ducky/composer";
import { CommandPalette } from "@/components/ducky/command-palette";
import { NewProjectDialog } from "@/components/ducky/project-picker";
import { MarketplacePanel } from "@/components/ducky/marketplace-panel";
import { PluginsSheet } from "@/components/ducky/plugins-sheet";
import { SettingsSheet, type SettingsTab } from "@/components/ducky/settings-sheet";
import { Sidebar } from "@/components/ducky/sidebar";
import { ShortcutsDialog } from "@/components/ducky/shortcuts-dialog";
import { StatusBar } from "@/components/ducky/status-bar";
import { TodoCard } from "@/components/ducky/message-item";
import {
  IdeFilePreview,
  IdeInspector,
  IdeTabBar,
  IdeActivityRail,
  type CenterTab,
} from "@/components/ducky/ide-panels";
import { BrowserPanel } from "@/components/ducky/browser-panel";
import { TerminalPanel } from "@/components/ducky/terminal-panel";
import {
  getTabsRevision,
  listTabs,
  subscribeTabs,
} from "@/lib/ducky/browser-tabs";
import { useDuckyAgent } from "@/hooks/use-ducky-agent";
import { useDuckyStore } from "@/lib/ducky/store";
import { setServerLive, setModelIdSet, setProvider } from "@/lib/ducky/server-caps";
import { connectDisk, reconnectDisk, restoreDiskOnBoot, useDiskStore } from "@/lib/ducky/disk";
import { modelDisplayName } from "@/lib/ducky/models";
import { discoverModels } from "@/lib/ducky/connection";
import { forgetMemory, saveMemory } from "@/lib/ducky/memory";
import { openTab } from "@/lib/ducky/browser-tabs";
import type { PermissionPolicy } from "@/lib/ducky/types";

const KNOWN_POLICIES = ["readonly", "ask", "auto"] as const;

/**
 * Expand `@path` mentions against the active session workspace: matched
 * paths inline the file content as a fenced context block (truncated at
 * 6KB); unknown @tokens pass through untouched.
 */
function expandMentions(text: string): string {
  const st = useDuckyStore.getState();
  const session = st.sessions.find((s) => s.id === st.activeSessionId) ?? null;
  const ws = session?.workspace;
  if (!ws || Object.keys(ws).length === 0) return text;
  return text.replace(/(^|\s)@([^\s@`]+)/g, (full, pre: string, p: string) => {
    const content = ws[p];
    if (typeof content !== "string") return full;
    const body = content.length > 6000 ? `${content.slice(0, 6000)}\n…(truncated)` : content;
    return `${pre}@${p}:\n\`\`\`\n${body}\n\`\`\``;
  });
}

function SideFootButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-lg p-2 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        active && "bg-white/[0.07] text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export default function DuckyCoderPage() {
  const hydrated = useDuckyStore((s) => s.hydrated);
  const sessions = useDuckyStore((s) => s.sessions);
  const activeSessionId = useDuckyStore((s) => s.activeSessionId);
  const projects = useDuckyStore((s) => s.projects);
  const activeProjectId = useDuckyStore((s) => s.activeProjectId);
  const topbarModel = useDuckyStore((s) => s.settings.model);

  const [input, setInput] = React.useState("");
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsTab, setSettingsTab] = React.useState<SettingsTab | undefined>(undefined);
  const [pluginsOpen, setPluginsOpen] = React.useState(false);
  const [marketOpen, setMarketOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [activityOpen, setActivityOpen] = React.useState(false);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = React.useState(false);
  const [terminalOpen, setTerminalOpen] = React.useState(false);
  const [update, setUpdate] = React.useState<ReleaseInfo | null>(null);

  /* ── update check: every boot asks GitHub releases; banner once per version ── */
  React.useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      checkForUpdate(APP_VERSION).then((rel) => {
        if (live && rel) {
          setUpdate(rel);
          toast.info(`Update available: ${rel.tag}`, {
            description: "A newer Ducky is out — see the banner up top.",
            duration: 8000,
          });
        }
      });
    }, 2500);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, []);

  /* ── IDE shell state ── */
  const [leftOpen, setLeftOpen] = React.useState(true);
  const [rightOpen, setRightOpen] = React.useState(false);
  const [centerTab, setCenterTab] = React.useState<CenterTab>("chat");

  const agent = useDuckyAgent();
  // Stable fn reference: the agent object identity changes per render, but
  // send/stop/responders are stable useCallbacks — destructure once so every
  // callback below keeps its memoization.
  const { send: agentSend } = agent;

  /* ── stable UI helpers (declared before the command pipeline) ── */
  const openSettings = React.useCallback((tab?: SettingsTab) => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }, []);

  /* ── IDE file preview plumbing ── */
  const handlePreviewFile = React.useCallback((p: string) => {
    setPreviewPath(p);
    setCenterTab("file");
  }, []);
  const handleCloseFile = React.useCallback(() => {
    setPreviewPath(null);
    setCenterTab("chat");
  }, []);

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  /* ── server capability probe (booleans only) ─────────────────────── */
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : { live: false, hasModelId: false, provider: null }))
      .then((d: { live?: boolean; hasModelId?: boolean; provider?: string | null }) => {
        if (cancelled) return;
        const changed = setServerLive(Boolean(d.live));
        setModelIdSet(Boolean(d.hasModelId));
        setProvider(typeof d.provider === "string" ? d.provider : null);
        // poke subscribers so the status bar reflects model availability
        if (changed) useDuckyStore.setState({});
      })
      .catch(() => {
        /* offline / probe failed — stays "no model" */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* ── local-folder (File System Access API) boot restore ──────────── */
  React.useEffect(() => {
    void restoreDiskOnBoot();
  }, []);

  /** Hero / picker entry: connect (or re-grant) a real local folder. */
  const handleConnectDisk = React.useCallback(async () => {
    const st = useDiskStore.getState();
    if (st.status === "needs-permission") {
      const ok = await reconnectDisk();
      if (ok) {
        toast.success(`Folder reconnected: ${useDiskStore.getState().rootName}`, {
          description: "disk_* tools can read and edit real files in it again.",
        });
      } else {
        toast.error("Permission not granted", {
          description: "The browser kept the folder locked — try again and allow access.",
        });
      }
      return;
    }
    const ok = await connectDisk();
    if (ok) {
      toast.success(`Folder connected: ${useDiskStore.getState().rootName}`, {
        description: "disk_* tools now list, read, edit and create REAL files inside it.",
      });
    }
  }, []);

  /* ── global shortcuts ─────────────────────────────────────────────────── */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useDuckyStore.getState().newSession();
        toast.success("New task created");
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setActivityOpen((v) => !v);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setLeftOpen((v) => !v);
        return;
      }
      if (
        e.key === "?" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ── slash-command pipeline ───────────────────────────────────────────── */
  const executeCommand = React.useCallback((raw: string) => {
    const st = useDuckyStore.getState();
    const sid = st.activeSessionId;
    const parts = raw.trim().split(/\s+/);
    const name = parts[0];
    const arg = parts[1];
    const rest = parts.slice(1).join(" ");
    const session = sid ? (st.sessions.find((s) => s.id === sid) ?? null) : null;

    switch (name) {
      case "/new": {
        st.newSession();
        toast.success("New task created");
        break;
      }
      case "/clear": {
        if (!sid) return toast.info("Select a session first");
        st.clearSession(sid);
        toast("Session cleared", { description: "Messages and todos removed." });
        break;
      }
      case "/plan": {
        if (!sid) return toast.info("Select a session first");
        const cur = st.sessions.find((s) => s.id === sid);
        const next = !cur?.planMode;
        st.setPlanMode(sid, next);
        toast.success(next ? "Plan mode ON" : "Plan mode OFF");
        break;
      }
      case "/model": {
        if (!rest) {
          return toast.info(`Current model: ${modelDisplayName(st.settings.model)}`, {
            description: "Usage: /model <id> — any id your endpoint serves.",
          });
        }
        st.updateSettings({ model: rest });
        toast.success(`Model switched to ${modelDisplayName(rest)}`);
        break;
      }
      case "/models": {
        const { baseUrl, apiKey } = st.settings;
        if (!baseUrl.trim() || !apiKey.trim()) {
          return toast.info("Set base URL + API key first", {
            description: "Settings → Connections, then /models to discover.",
          });
        }
        toast.info("Discovering models…");
        discoverModels(baseUrl, apiKey).then(
          (models) => {
            if (!models.length) return toast.info("Reachable, but no models listed.");
            toast.success(`${models.length} model(s) found`, {
              description: `${models.slice(0, 5).map((m) => m.id).join(", ")}${
                models.length > 5 ? ` +${models.length - 5} more` : ""
              } — /model <id> to switch.`,
              duration: 8000,
            });
          },
          (e) => toast.error("Discovery failed", { description: (e as Error).message }),
        );
        break;
      }
      case "/endpoint": {
        if (!arg) return toast.info("Usage: /endpoint <base-url>");
        st.updateSettings({ baseUrl: arg.replace(/\/+$/, "") });
        toast.success("Endpoint updated", { description: "Test it in Settings → Connections." });
        break;
      }
      case "/key": {
        if (!arg) {
          const has = st.settings.apiKey.trim() !== "";
          return toast.info(has ? "API key is set (hidden)." : "No API key set.", {
            description: "Usage: /key <key> — stored in this browser only, never echoed.",
          });
        }
        st.updateSettings({ apiKey: arg.trim() });
        toast.success("API key saved", { description: "This browser only — value never shown." });
        break;
      }
      case "/conn":
      case "/connect": {
        openSettings("models");
        break;
      }
      case "/mcp": {
        openSettings("mcp");
        break;
      }
      case "/policy": {
        const p = arg as PermissionPolicy;
        if (!KNOWN_POLICIES.includes(p)) {
          return toast.error("Unknown policy", {
            description: "Usage: /policy readonly | ask | auto",
          });
        }
        st.updateSettings({ policy: p });
        toast.success(`Permission policy → ${p}`);
        break;
      }
      case "/temp": {
        const t = Number(arg);
        if (!Number.isFinite(t) || t < 0 || t > 2) return toast.info("Usage: /temp <0–2>");
        st.updateSettings({ temperature: Math.round(t * 10) / 10 });
        toast.success(`Temperature → ${Math.round(t * 10) / 10}`);
        break;
      }
      case "/tokens": {
        const t = Number(arg);
        if (!Number.isFinite(t) || t < 512 || t > 32768) return toast.info("Usage: /tokens <512–32768>");
        st.updateSettings({ maxTokens: Math.round(t) });
        toast.success(`Max tokens → ${Math.round(t)}`);
        break;
      }
      case "/iters": {
        const t = Number(arg);
        if (!Number.isFinite(t) || t < 1 || t > 30) return toast.info("Usage: /iters <1–30>");
        st.updateSettings({ maxToolIterations: Math.round(t) });
        toast.success(`Max tool iterations → ${Math.round(t)}`);
        break;
      }
      case "/goal": {
        if (!sid || !session) return toast.info("Select a session first");
        if (!rest) {
          const g = session.todos.length
            ? `${session.todos.filter((t) => t.status !== "completed").length} open todo(s)`
            : "no goal set";
          return toast.info(`Goal: ${session.title} — ${g}`, {
            description: "Usage: /goal <text> to set it.",
          });
        }
        st.renameSession(sid, rest.slice(0, 80));
        toast.success("Goal set", { description: `${rest.slice(0, 120)} — /remember it to keep it across sessions.` });
        break;
      }
      case "/remember": {
        if (!rest) return toast.info("Usage: /remember <fact>");
        try {
          const e = saveMemory(rest.slice(0, 500));
          toast.success("Remembered", { description: `id ${e.id.slice(0, 8)} — /forget to drop it.` });
        } catch (e) {
          toast.error("Memory full", { description: (e as Error).message });
        }
        break;
      }
      case "/forget": {
        if (!arg) return toast.info("Usage: /forget <id-prefix> (see memory_list)");
        if (forgetMemory(arg)) toast.success("Forgotten");
        else toast.error("No memory starts with that id");
        break;
      }
      case "/stats": {
        if (!sid || !session) return toast.info("Select a session first");
        toast.info(`Session: ${session.title}`, {
          description: `${session.stats.promptTokens + session.stats.completionTokens} tokens · ${session.stats.toolCalls} tools · ${session.messages.length} messages · ${Object.keys(session.workspace).length} files.`,
        });
        break;
      }
      case "/files": {
        if (!sid || !session) return toast.info("Select a session first");
        const files = Object.keys(session.workspace).sort();
        if (!files.length) return toast.info("Workspace is empty");
        toast.info(`${files.length} file(s)`, {
          description: files.slice(0, 12).join(", ") + (files.length > 12 ? ` +${files.length - 12} more` : ""),
        });
        break;
      }
      case "/retry": {
        if (!sid || !session) return toast.info("Select a session first");
        const lastUser = [...session.messages].reverse().find((m) => m.role === "user");
        if (!lastUser) return toast.info("Nothing to retry yet");
        void agentSend(lastUser.content);
        break;
      }
      case "/undo": {
        if (!sid || !session) return toast.info("Select a session first");
        const idx = session.messages.map((m) => m.role).lastIndexOf("user");
        if (idx === -1) return toast.info("Nothing to undo");
        st.truncateSessionFrom(sid, session.messages.slice(0, idx));
        toast.success("Undone", { description: "Last exchange removed." });
        break;
      }
      case "/compact": {
        if (!sid || !session) return toast.info("Select a session first");
        const keep = Math.max(2, Math.min(100, Number(arg) || 20));
        const userIdx = session.messages.map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i >= 0);
        if (userIdx.length <= keep) return toast.info("Nothing to compact");
        const cut = userIdx[userIdx.length - keep];
        st.truncateSessionFrom(sid, session.messages.slice(cut));
        toast.success("Compacted", { description: `Kept the last ${keep} exchange(s).` });
        break;
      }
      case "/rename": {
        if (!sid) return toast.info("Select a session first");
        if (!rest) return toast.info("Usage: /rename <title>");
        st.renameSession(sid, rest.slice(0, 80));
        toast.success("Renamed");
        break;
      }
      case "/star": {
        if (!sid || !session) return toast.info("Select a session first");
        if (!session.starred) st.toggleStar(sid);
        toast.success("Starred");
        break;
      }
      case "/duplicate": {
        if (!sid) return toast.info("Select a session first");
        const id = st.duplicateSession(sid);
        if (id) toast.success("Session duplicated");
        break;
      }
      case "/reset": {
        if (!sid || !session) return toast.info("Select a session first");
        st.resetWorkspace(sid);
        toast.success("Workspace reset", { description: "Restored to starting files." });
        break;
      }
      case "/browser": {
        if (!rest || !/^https?:\/\//i.test(rest)) return toast.info("Usage: /browser <https-url>");
        try {
          openTab(rest);
          setCenterTab("browser");
        } catch (e) {
          toast.error("Cannot open tab", { description: (e as Error).message });
        }
        break;
      }
      case "/term": {
        setTerminalOpen((v) => !v);
        break;
      }
      case "/screen": {
        if (!sid) return toast.info("Select a session first");
        void import("@/lib/ducky/screen").then(({ captureScreenToWorkspace }) => {
          toast.info("Pick a screen to share…");
          captureScreenToWorkspace(sid, (path, content) =>
            useDuckyStore.getState().writeFile(sid, path, content),
          ).then(
            (msg) => {
              toast.success("Screen captured", { description: msg });
              const m = msg.match(/→ (\S+)/);
              if (m) handlePreviewFile(m[1]);
            },
            (e) => toast.error("Capture cancelled", { description: (e as Error).message }),
          );
        });
        break;
      }
      case "/tools": {
        setPaletteOpen(true);
        toast.info("Tools live in the palette", { description: "Type a tool name to see usage." });
        break;
      }
      case "/plugins": {
        setPluginsOpen(true);
        break;
      }
      case "/market": {
        setMarketOpen(true);
        break;
      }
      case "/export": {
        if (!sid) return toast.info("Select a session first");
        const target = st.sessions.find((s) => s.id === sid);
        if (!target) return toast.error("Session not found");
        import("@/lib/ducky/export-md").then(({ downloadSessionMarkdown }) => {
          downloadSessionMarkdown(target);
          toast.success("Session exported", {
            description: "Markdown transcript downloaded.",
          });
        });
        break;
      }
      case "/zip": {
        if (!sid) return toast.info("Select a session first");
        const target = st.sessions.find((s) => s.id === sid);
        if (!target) return toast.error("Session not found");
        const fileCount = Object.keys(target.workspace).length;
        if (fileCount === 0) return toast.info("Workspace is empty — nothing to zip");
        import("@/lib/ducky/zip").then(({ downloadWorkspaceZip }) => {
          downloadWorkspaceZip(target);
          toast.success("Workspace exported", {
            description: `${fileCount} files zipped — opens in any archive tool.`,
          });
        });
        break;
      }
      case "/activity": {
        setActivityOpen(true);
        break;
      }
      case "/help": {
        setShortcutsOpen(true);
        break;
      }
      case "/backup": {
        const all = st.sessions;
        if (all.length === 0) return toast.info("Nothing to back up yet");
        import("@/lib/ducky/session-backup").then(({ downloadSessionsBackup }) => {
          downloadSessionsBackup(all);
          toast.success("Backup downloaded", {
            description: `${all.length} session${all.length === 1 ? "" : "s"} exported as JSON (API key never included).`,
          });
        });
        break;
      }
      case "/timeline": {
        setActivityOpen(true);
        break;
      }
      default:
        toast.error(`Unknown command “${name}”`);
    }
  }, [agentSend, handlePreviewFile, openSettings]);

  const doSend = React.useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t) return;
      if (t.startsWith("/")) {
        executeCommand(t);
        return;
      }
      await agentSend(expandMentions(t));
    },
    [agentSend, executeCommand],
  );

  /** composer path: clear input, dispatch */
  const composerSend = React.useCallback(
    (text: string) => {
      setInput("");
      void doSend(text);
    },
    [doSend],
  );

  /** hero suggestion path: stage text then auto-send (may flip plan mode on) */
  const pickPrompt = React.useCallback(
    (prompt: string, opts?: { planMode?: boolean }) => {
      if (opts?.planMode) {
        const st = useDuckyStore.getState();
        let sid = st.activeSessionId;
        if (!sid || !st.sessions.some((s) => s.id === sid)) sid = st.newSession();
        if (!st.sessions.find((s) => s.id === sid)?.planMode) {
          st.setPlanMode(sid, true);
          toast.success("Plan mode ON", { description: "Drafting a plan before any writes." });
        }
      }
      setInput(prompt);
      void doSend(prompt);
      setTimeout(() => setInput(""), 0);
    },
    [doSend],
  );

  // Derived tabs (no setState-in-effect): file needs a preview path,
  // browser needs at least one open tab — otherwise we render chat.
  const browserRev = React.useSyncExternalStore(subscribeTabs, getTabsRevision, getTabsRevision);
  const browserCount = React.useMemo(() => listTabs().length, [browserRev]);
  const effectiveTab: CenterTab =
    centerTab === "file" && previewPath
      ? "file"
      : centerTab === "browser" && browserCount > 0
        ? "browser"
        : "chat";

  /* ── hydration splash ─────────────────────────────────────────────────── */
  if (!hydrated) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-background">
        <img
          src="/ducky-mark.png"
          alt="Ducky AI logo"
          className="size-14 rounded-xl border bg-black ducky-pulse-dot"
        />
        <span aria-hidden className="font-mono text-lg font-bold text-[#FF7A1A]">
          ducky ai | coder
        </span>
        <div className="w-48 space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
        <Toaster richColors position="bottom-right" />
      </div>
    );
  }

  const todos = activeSession?.todos ?? [];
  const approvalRequest = agent.pendingApproval;
  const askPayload = agent.pendingAsk;
  const showInlineDeck =
    Boolean(approvalRequest) || Boolean(askPayload) || todos.length > 0;
  /** hero (welcome) state — no visible conversation yet */
  const heroState = !activeSession || activeSession.messages.length === 0;
  const messageCount = activeSession?.messages.filter((m) => m.role === "user" || m.role === "assistant").length ?? 0;
  const previewContent = previewPath ? (activeSession?.workspace[previewPath] ?? "") : "";

  return (
    <div className="ducky-ide-shell ducky-v3-app flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      {/* mobile mini bar (desktop uses the sidebar for everything) */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 lg:hidden">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={() => setMobileNavOpen(true)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
        >
          <Menu className="size-4" aria-hidden />
        </button>
        <img src="/ducky-mark.png" alt="" aria-hidden className="size-5 rounded border border-white/10 bg-black" />
        <span className="text-sm font-bold tracking-tight">Ducky AI</span>
        <button
          type="button"
          aria-label="Toggle terminal"
          onClick={() => setTerminalOpen((v) => !v)}
          className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
        >
          <SquareTerminal className="size-4" aria-hidden />
        </button>
      </div>

      {/* update banner — one per release, dismissed per version */}
      {update && (
        <div
          role="status"
          aria-label={`Update available: ${update.tag}`}
          className="ducky-fade-up z-20 flex shrink-0 items-center gap-2 border-b border-[#FF7A1A]/30 bg-gradient-to-r from-[#FF7A1A]/15 via-[#FF7A1A]/8 to-transparent px-3 py-1.5"
        >
          <span aria-hidden className="ducky-pulse-dot inline-block size-1.5 shrink-0 rounded-full bg-[#FF7A1A]" />
          <p className="min-w-0 flex-1 truncate text-xs">
            <span className="font-semibold">Update available: {update.name}</span>
            <span className="ml-2 hidden text-muted-foreground sm:inline">
              v{APP_VERSION} → {update.tag} — run `ducky update`
            </span>
          </p>
          <button
            type="button"
            onClick={() => {
              const cmd = "ducky update";
              if (navigator.clipboard) {
                void navigator.clipboard.writeText(cmd).catch(() => undefined);
              }
              toast.success("Copied: ducky update", {
                description: update.url ? `Release notes: ${update.url}` : undefined,
              });
            }}
            className="shrink-0 rounded-full bg-[#FF7A1A] px-2.5 py-1 font-mono text-[11px] font-semibold text-black hover:brightness-105"
          >
            Copy update command
          </button>
          <button
            type="button"
            aria-label="Dismiss update"
            onClick={() => {
              dismissUpdate(update.tag);
              setUpdate(null);
            }}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}

      {/* App body row: rail + sidebar + center + inspector */}
      <div className="flex min-h-0 flex-1">
        {/* icon rail — Pond OS v3: VSCode-style strip */}
        <div className="ducky-v3-rail hidden shrink-0 md:block">
          <IdeActivityRail
            leftOpen={leftOpen}
            onToggleLeft={() => setLeftOpen((v) => !v)}
            onRail={(v) => {
              setLeftOpen(true);
              if (v === "search") setPaletteOpen(true);
              if (v === "source") setActivityOpen(true);
              if (v === "plugins") setPluginsOpen(true);
            }}
            onOpenPlugins={() => setPluginsOpen(true)}
            onOpenSettings={() => openSettings()}
            onOpenPalette={() => setPaletteOpen(true)}
            onOpenActivity={() => setActivityOpen(true)}
          />
        </div>
        {/* desktop sidebar */}
        {leftOpen && (
          <aside className="ducky-v3-side hidden w-[300px] shrink-0 flex-col border-r border-white/[0.06] lg:flex">
            {/* identity */}
            <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
              <img
                src="/ducky-mark.png"
                alt="Ducky AI logo"
                className="ducky-v3-logo-ring size-8 rounded-xl border border-white/10 bg-black"
              />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="font-pixel truncate text-[12px] leading-none text-foreground">DUCKY</p>
                <p className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                  <span
                    aria-hidden
                    className={cn(
                      "inline-block size-1.5 rounded-full",
                      agent.running ? "ducky-pulse-dot bg-amber-400" : "bg-emerald-400",
                    )}
                  />
                  {agent.running ? "working…" : "pond ready"}
                </p>
              </div>
              <button
                type="button"
                aria-label="Hide sidebar (⌘B)"
                onClick={() => setLeftOpen(false)}
                className="rounded-md p-1.5 font-mono text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
              >
                ✕
              </button>
            </div>
            {/* big new-task action */}
            <div className="shrink-0 px-3 pb-2">
              <button
                type="button"
                onClick={() => {
                  useDuckyStore.getState().newSession();
                  toast.success("New task created");
                }}
                className="ducky-v3-newtask flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold"
              >
                <span aria-hidden className="text-base leading-none">+</span> New chat
                <kbd className="ml-1 rounded bg-black/20 px-1.5 py-0.5 font-mono text-[10px] font-medium">⌘K</kbd>
              </button>
            </div>
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-white/[0.06] px-4">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                Workspace
              </span>
              <span className="truncate font-mono text-[10px] text-muted-foreground/50">
                {activeProject?.name ?? activeSession?.projectName ?? "sandbox"}
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <Sidebar
                onPreviewFile={handlePreviewFile}
                onOpenPalette={() => setPaletteOpen(true)}
                onOpenActivity={() => setActivityOpen(true)}
                onOpenPlugins={() => setPluginsOpen(true)}
                onOpenMarketplace={() => setMarketOpen(true)}
              />
            </div>
            {/* sidebar footer tools */}
            <div className="flex shrink-0 items-center gap-1 border-t border-white/[0.06] px-3 py-2">
              <SideFootButton label={terminalOpen ? "Close terminal" : "Open terminal"} onClick={() => setTerminalOpen((v) => !v)} active={terminalOpen}>
                <SquareTerminal className="size-4" aria-hidden />
              </SideFootButton>
              <SideFootButton label="Command palette (⌘P)" onClick={() => setPaletteOpen(true)}>
                <Command className="size-4" aria-hidden />
              </SideFootButton>
              <SideFootButton label="Plugins" onClick={() => setPluginsOpen(true)}>
                <Puzzle className="size-4" aria-hidden />
              </SideFootButton>
              <SideFootButton label={rightOpen ? "Hide inspector" : "Show inspector"} onClick={() => setRightOpen((v) => !v)} active={rightOpen}>
                <PanelRight className="size-4" aria-hidden />
              </SideFootButton>
              <SideFootButton label="Settings" onClick={() => openSettings()}>
                <Settings className="size-4" aria-hidden />
              </SideFootButton>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground/50">v{APP_VERSION}</span>
            </div>
          </aside>
        )}

        {/* mobile sidebar */}
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="w-[286px] gap-0 p-0 sm:max-w-[286px]">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">
              Sessions and workspace files
            </SheetDescription>
            <div className="flex min-h-0 flex-1 flex-col pt-10">
              <Sidebar
                onPreviewFile={(p) => {
                  handlePreviewFile(p);
                  setMobileNavOpen(false);
                }}
                onAfterSelect={() => setMobileNavOpen(false)}
                onOpenPalette={() => {
                  setPaletteOpen(true);
                  setMobileNavOpen(false);
                }}
                onOpenActivity={() => {
                  setActivityOpen(true);
                  setMobileNavOpen(false);
                }}
                onOpenPlugins={() => {
                  setPluginsOpen(true);
                  setMobileNavOpen(false);
                }}
                onOpenMarketplace={() => {
                  setMarketOpen(true);
                  setMobileNavOpen(false);
                }}
              />
            </div>
          </SheetContent>
        </Sheet>

        {/* center column: chat/file + composer (tabs appear only with open files) */}
        <main className="flex min-w-0 flex-1 flex-col bg-transparent">
          {/* Pond OS v3 topbar: breadcrumb + model + quick actions */}
          <div className="ducky-v3-topbar flex h-12 shrink-0 items-center gap-2 px-3">
            {!leftOpen && (
              <button
                type="button"
                aria-label="Show sidebar (⌘B)"
                onClick={() => setLeftOpen(true)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
              >
                <Menu className="size-4" aria-hidden />
              </button>
            )}
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold tracking-tight">
                {activeSession?.title ?? "New task"}
              </p>
              <p className="truncate font-mono text-[10px] text-muted-foreground/70">
                {activeProject?.name ?? activeSession?.projectName ?? "sandbox"} · {modelDisplayName(topbarModel)} · {messageCount} msgs
              </p>
            </div>
            <button
              type="button"
              aria-label="Command palette (⌘P)"
              onClick={() => setPaletteOpen(true)}
              className="hidden rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground hover:border-[#FF7A1A]/40 hover:text-foreground sm:block"
            >
              ⌘P search
            </button>
            <button
              type="button"
              aria-label="Toggle terminal"
              onClick={() => setTerminalOpen((v) => !v)}
              className={cn(
                "rounded-md p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground",
                terminalOpen && "bg-white/[0.07] text-foreground",
              )}
            >
              <SquareTerminal className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Settings"
              onClick={() => openSettings()}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              <Settings className="size-4" aria-hidden />
            </button>
          </div>
          {(previewPath || browserCount > 0) && (
            <IdeTabBar
            tab={effectiveTab}
            onTab={(t) => {
              if (t === "file" && !previewPath) return;
              if (t === "browser" && browserCount === 0) return;
              setCenterTab(t);
            }}
            fileName={previewPath}
            onCloseFile={handleCloseFile}
            sessionTitle={activeSession?.title ?? "New task"}
            projectName={activeProject?.name ?? activeSession?.projectName ?? null}
            messageCount={messageCount}
            browserCount={browserCount}
            rightOpen={rightOpen}
            onToggleRight={() => setRightOpen((v) => !v)}
            />
          )}

          <div className="flex min-h-0 flex-1 flex-col">
            {effectiveTab === "file" && previewPath ? (
              <IdeFilePreview
                path={previewPath}
                content={previewContent}
                onBack={() => setCenterTab("chat")}
              />
            ) : effectiveTab === "browser" ? (
              <BrowserPanel />
            ) : (
              <>
                <ChatStream
                  sessionRunning={agent.running}
                  onPick={pickPrompt}
                  heroProps={{
                    projectName: activeProject?.name ?? null,
                    projectFileCount: activeProject ? Object.keys(activeProject.files).length : 0,
                    onNewProject: () => setNewProjectOpen(true),
                    onConnectDisk: () => void handleConnectDisk(),
                  }}
                  composerSlot={
                    <Composer
                      variant="hero"
                      value={input}
                      onChange={setInput}
                      onSend={composerSend}
                      onStop={() => {
                        agent.stop();
                        toast.info("Stopped by user");
                      }}
                      running={agent.running}
                      locked={Boolean(agent.pendingApproval)}
                      hasSession={Boolean(activeSessionId)}
                    />
                  }
                />

                {/* inline deck: todos -> permission gate -> ask-user */}
                {showInlineDeck && (
                  <div className="space-y-2 px-0 pb-2">
                    <TodoCard todos={todos} />
                    {approvalRequest && (
                      <ApprovalCard
                        request={{
                          id: approvalRequest.id,
                          toolName: approvalRequest.toolName,
                          argsPreview: approvalRequest.argsPreview,
                          reason: approvalRequest.reason,
                        }}
                        onRespond={(ok, feedback) => {
                          if (ok) {
                            agent.respondApproval(true);
                            return;
                          }
                          agent.respondApproval(false);
                          if (feedback) {
                            setInput(feedback);
                            toast.info("Feedback staged", {
                              description: "Denied. Press Enter to send the feedback as your next message.",
                            });
                          }
                        }}
                        onAlwaysAllow={() => {
                          useDuckyStore.getState().updateSettings({ policy: "auto" });
                          toast.success("Permission mode → Edit automatically", {
                            description: "Side-effecting tools now run without asking.",
                          });
                          agent.respondApproval(true);
                        }}
                      />
                    )}
                    {askPayload && (
                      <AskUserCard pendingAsk={askPayload} respondAsk={agent.respondAsk} />
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* terminal drawer — same mini-bash the agent uses, over this session */}
          {terminalOpen && activeSession && (
            <TerminalPanel
              key={activeSession.id}
              sessionId={activeSession.id}
              onClose={() => setTerminalOpen(false)}
            />
          )}

          {/* docked composer — hidden in hero welcome and in file-tab focus mode */}
          {!heroState && effectiveTab !== "file" && (
            <div className="ducky-composer-dock">
              <Composer
                value={input}
                onChange={setInput}
                onSend={composerSend}
                onStop={() => {
                  agent.stop();
                  toast.info("Stopped by user");
                }}
                running={agent.running}
                locked={Boolean(agent.pendingApproval)}
                hasSession={Boolean(activeSessionId)}
              />
            </div>
          )}
        </main>

        {/* right inspector */}
        {rightOpen && (
          <aside className="hidden w-[300px] shrink-0 flex-col border-l bg-muted/10 xl:flex">
            <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Inspector
              </span>
              <button
                type="button"
                aria-label="Hide inspector"
                onClick={() => setRightOpen(false)}
                className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <IdeInspector
                onOpenPlugins={() => setPluginsOpen(true)}
                onOpenActivity={() => setActivityOpen(true)}
                onPreviewFile={handlePreviewFile}
              />
            </div>
          </aside>
        )}
      </div>

      <StatusBar
        onOpenPlugins={() => setPluginsOpen(true)}
        onOpenActivity={() => setActivityOpen(true)}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onRunCommand={executeCommand}
        onStageText={(t) => {
          setInput(t);
          toast.info("Command staged", { description: "Finish the argument and press Enter." });
        }}
        onPreviewFile={handlePreviewFile}
        onToggleActivity={() => setActivityOpen((v) => !v)}
      />

      {/* globals */}
      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialTab={settingsTab}
      />
      <PluginsSheet open={pluginsOpen} onOpenChange={setPluginsOpen} />
      <MarketplacePanel open={marketOpen} onOpenChange={setMarketOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
      <ActivityTimelinePanel
        open={activityOpen}
        onOpenChange={setActivityOpen}
        session={activeSession}
        onPreviewFile={handlePreviewFile}
      />

      <Toaster richColors position="bottom-right" />
    </div>
  );
}
