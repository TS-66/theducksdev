"use client";

import * as React from "react";
import { Toaster } from "@/components/ui/sonner";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ActivityTimelinePanel } from "@/components/ducky/activity-panel";
import { ApprovalCard } from "@/components/ducky/approval-card";
import { AskUserCard } from "@/components/ducky/ask-user-card";
import { ChatStream } from "@/components/ducky/chat-stream";
import { Composer } from "@/components/ducky/composer";
import { CommandPalette } from "@/components/ducky/command-palette";
import { FilePreviewDialog } from "@/components/ducky/file-preview-dialog";
import { HeaderBar } from "@/components/ducky/header-bar";
import { NewProjectDialog } from "@/components/ducky/project-picker";
import { PluginsSheet } from "@/components/ducky/plugins-sheet";
import { SettingsSheet, type SettingsTab } from "@/components/ducky/settings-sheet";
import { Sidebar } from "@/components/ducky/sidebar";
import { ShortcutsDialog } from "@/components/ducky/shortcuts-dialog";
import { StatusBar } from "@/components/ducky/status-bar";
import { TodoCard } from "@/components/ducky/message-item";
import { useDuckyAgent } from "@/hooks/use-ducky-agent";
import { useDuckyStore } from "@/lib/ducky/store";
import { setServerLive, setModelIdSet } from "@/lib/ducky/server-caps";
import { connectDisk, reconnectDisk, restoreDiskOnBoot, useDiskStore } from "@/lib/ducky/disk";
import { MODEL_DISPLAY, MODEL_ID } from "@/lib/ducky/models";
import type { PermissionPolicy } from "@/lib/ducky/types";

const KNOWN_POLICIES = ["readonly", "ask", "auto"] as const;

export default function DuckyCoderPage() {
  const hydrated = useDuckyStore((s) => s.hydrated);
  const sessions = useDuckyStore((s) => s.sessions);
  const activeSessionId = useDuckyStore((s) => s.activeSessionId);
  const projects = useDuckyStore((s) => s.projects);
  const activeProjectId = useDuckyStore((s) => s.activeProjectId);

  const [input, setInput] = React.useState("");
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsTab, setSettingsTab] = React.useState<SettingsTab | undefined>(undefined);
  const [pluginsOpen, setPluginsOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [activityOpen, setActivityOpen] = React.useState(false);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = React.useState(false);

  const agent = useDuckyAgent();

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  /* ── server capability probe (booleans only) ─────────────────────── */
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : { live: false, hasModelId: false }))
      .then((d: { live?: boolean; hasModelId?: boolean }) => {
        if (cancelled) return;
        const changed = setServerLive(Boolean(d.live));
        setModelIdSet(Boolean(d.hasModelId));
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
        if (arg !== MODEL_ID) {
          return toast.error("Unknown model", {
            description: `Ducky AI currently ships a single model: ${MODEL_DISPLAY} (/model ${MODEL_ID}).`,
          });
        }
        st.updateSettings({ model: arg });
        toast.success(`Model switched to ${MODEL_DISPLAY}`);
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
      case "/plugins": {
        setPluginsOpen(true);
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
  }, []);

  const doSend = React.useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t) return;
      if (t.startsWith("/")) {
        executeCommand(t);
        return;
      }
      await agent.send(t);
    },
    [agent, executeCommand],
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

  const openSettings = React.useCallback((tab?: SettingsTab) => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }, []);

  /** one-click sample project — the greeting-service repo, only when asked for */
  const useSampleProject = React.useCallback(() => {
    const st = useDuckyStore.getState();
    const existing = st.projects.find((p) => p.name === "greeting-service");
    if (existing) {
      st.selectProject(existing.id);
      toast.info("Sample project selected", {
        description: "greeting-service already exists — new tasks start from it.",
      });
      return;
    }
    void import("@/lib/ducky/workspace-seed").then(({ SEED_WORKSPACE }) => {
      const st2 = useDuckyStore.getState();
      st2.createProject("greeting-service", { ...SEED_WORKSPACE });
      toast.success("Sample project created", {
        description: `greeting-service · ${Object.keys(SEED_WORKSPACE).length} files — new tasks start from it.`,
      });
    });
  }, []);

  /* ── hydration splash ─────────────────────────────────────────────────── */
  if (!hydrated) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-background">
        <img
          src="/ducky-mark.png"
          alt="Ducky AI logo"
          className="size-14 rounded-xl border bg-black ducky-pulse-dot"
        />
        <span aria-hidden className="font-mono text-lg font-bold text-[#FDC00A]">
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

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      <HeaderBar
        onMenu={() => setMobileNavOpen(true)}
        onOpenSettings={openSettings}
        onOpenPlugins={() => setPluginsOpen(true)}
      />

      {/* body row */}
      <div className="flex min-h-0 flex-1">
        {/* desktop sidebar */}
        <aside className="hidden w-[264px] shrink-0 border-r lg:flex lg:flex-col">
          <Sidebar onPreviewFile={setPreviewPath} />
        </aside>

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
                  setPreviewPath(p);
                  setMobileNavOpen(false);
                }}
                onAfterSelect={() => setMobileNavOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>

        {/* center column */}
        <main className="flex min-w-0 flex-1 flex-col">
          <ChatStream
            sessionRunning={agent.running}
            onPick={pickPrompt}
            heroProps={{
              projectName: activeProject?.name ?? null,
              projectFileCount: activeProject ? Object.keys(activeProject.files).length : 0,
              onNewProject: () => setNewProjectOpen(true),
              onUseSample: useSampleProject,
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
                onNewProject={() => setNewProjectOpen(true)}
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
                  onRespond={(ok) =>
                    ok ? agent.respondApproval(true) : agent.respondApproval(false)
                  }
                />
              )}
              {askPayload && (
                <AskUserCard pendingAsk={askPayload} respondAsk={agent.respondAsk} />
              )}
            </div>
          )}

          {/* docked composer — hidden while the hero (zcode welcome) state owns the screen */}
          {!heroState && (
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
          )}
        </main>
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
        onPreviewFile={setPreviewPath}
        onToggleActivity={() => setActivityOpen((v) => !v)}
      />

      {/* globals */}
      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialTab={settingsTab}
      />
      <PluginsSheet open={pluginsOpen} onOpenChange={setPluginsOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
      <ActivityTimelinePanel
        open={activityOpen}
        onOpenChange={setActivityOpen}
        session={activeSession}
        onPreviewFile={setPreviewPath}
      />
      <FilePreviewDialog
        path={previewPath}
        content={
          previewPath ? (activeSession?.workspace[previewPath] ?? "") : ""
        }
        onOpenChange={(open) => {
          if (!open) setPreviewPath(null);
        }}
      />

      <Toaster richColors position="bottom-right" />
    </div>
  );
}
