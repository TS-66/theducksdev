"use client";

import * as React from "react";
import { Toaster } from "@/components/ui/sonner";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ActivityTimelinePanel } from "@/components/dsh/activity-panel";
import { ApprovalCard } from "@/components/dsh/approval-card";
import { AskUserCard } from "@/components/dsh/ask-user-card";
import { ChatStream } from "@/components/dsh/chat-stream";
import { Composer } from "@/components/dsh/composer";
import { FilePreviewDialog } from "@/components/dsh/file-preview-dialog";
import { HeaderBar } from "@/components/dsh/header-bar";
import { PluginsSheet } from "@/components/dsh/plugins-sheet";
import { SettingsSheet, type SettingsTab } from "@/components/dsh/settings-sheet";
import { Sidebar } from "@/components/dsh/sidebar";
import { ShortcutsDialog } from "@/components/dsh/shortcuts-dialog";
import { StatusBar } from "@/components/dsh/status-bar";
import { TodoCard } from "@/components/dsh/message-item";
import { useDshAgent } from "@/hooks/use-dsh-agent";
import { useDshStore } from "@/lib/dsh/store";
import type { PermissionPolicy } from "@/lib/dsh/types";

const KNOWN_MODELS = ["deepseek-chat", "deepseek-reasoner"] as const;
const KNOWN_POLICIES = ["readonly", "ask", "auto"] as const;

export default function DshWebPage() {
  const hydrated = useDshStore((s) => s.hydrated);
  const sessions = useDshStore((s) => s.sessions);
  const activeSessionId = useDshStore((s) => s.activeSessionId);

  const [input, setInput] = React.useState("");
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsTab, setSettingsTab] = React.useState<SettingsTab | undefined>(undefined);
  const [pluginsOpen, setPluginsOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [activityOpen, setActivityOpen] = React.useState(false);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  const agent = useDshAgent();

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  /* ── global shortcuts ─────────────────────────────────────────────────── */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useDshStore.getState().newSession();
        toast.success("New task created");
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
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
    const st = useDshStore.getState();
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
        const m = arg as (typeof KNOWN_MODELS)[number];
        if (!KNOWN_MODELS.includes(m)) {
          return toast.error("Unknown model", {
            description: "Usage: /model deepseek-chat | deepseek-reasoner",
          });
        }
        st.updateSettings({ model: m });
        toast.success(`Model switched to ${m}`);
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
        import("@/lib/dsh/export-md").then(({ downloadSessionMarkdown }) => {
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
        import("@/lib/dsh/zip").then(({ downloadWorkspaceZip }) => {
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
        import("@/lib/dsh/session-backup").then(({ downloadSessionsBackup }) => {
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
        const st = useDshStore.getState();
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

  const newTask = React.useCallback(() => {
    useDshStore.getState().newSession();
    toast.success("New task created");
  }, []);

  const openSettings = React.useCallback((tab?: SettingsTab) => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }, []);

  /* ── hydration splash ─────────────────────────────────────────────────── */
  if (!hydrated) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-background">
        <span aria-hidden className="font-mono text-2xl font-bold text-[#4D6BFE] dsh-pulse-dot">
          ▚ dsh
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
            onNewTask={newTask}
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
        </main>
      </div>

      <StatusBar onOpenPlugins={() => setPluginsOpen(true)} onOpenActivity={() => setActivityOpen(true)} />

      {/* globals */}
      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialTab={settingsTab}
      />
      <PluginsSheet open={pluginsOpen} onOpenChange={setPluginsOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
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
