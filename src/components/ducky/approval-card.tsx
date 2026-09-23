"use client";

import * as React from "react";
import { ClipboardCheck, ShieldAlert, SquareTerminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ApprovalRequest } from "@/lib/ducky/types";
import { DiffView, parseEditArgs } from "./diff-view";

interface ApprovalCardProps {
  request: Omit<ApprovalRequest, "resolve">;
  onRespond: (ok: boolean, feedback?: string) => void;
  /** "always allow" escalates the permission mode, then approves */
  onAlwaysAllow?: () => void;
}

/** Extract a command string from bash/pc_exec-style args previews. */
function commandOf(toolName: string, preview: string): string | null {
  if (toolName !== "bash" && toolName !== "pc_exec") return null;
  try {
    const parsed = JSON.parse(preview) as { command?: unknown };
    return typeof parsed.command === "string" ? parsed.command : null;
  } catch {
    const m = preview.match(/"command"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m) {
      try {
        return JSON.parse(`"${m[1]}"`) as string;
      } catch {
        return m[1];
      }
    }
    return null;
  }
}

/** Inline permission-gate card rendered above the composer.
 *  exit_plan_mode gets a dedicated violet plan-review treatment. */
export function ApprovalCard({ request, onRespond, onAlwaysAllow }: ApprovalCardProps) {
  const [feedback, setFeedback] = React.useState("");
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
  if (request.toolName === "exit_plan_mode") {
    return (
      <div
        role="alertdialog"
        aria-label="Plan review"
        className="mx-auto w-full max-w-3xl rounded-lg border border-violet-500/50 bg-violet-500/5 px-4 py-3 shadow-sm md:px-8"
      >
        <div className="flex items-start gap-2.5">
          <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-violet-400" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-snug">
              Plan ready for review — approve to exit plan mode
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{request.reason}</p>
            <pre className="custom-scrollbar mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-md border border-violet-500/20 bg-card p-2 font-mono text-[11px] leading-relaxed">
              {request.argsPreview}
            </pre>
            <div className="mt-2.5 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onRespond(false)}>
                Keep planning
              </Button>
              <Button
                size="sm"
                className="bg-violet-500 text-white hover:bg-violet-400"
                onClick={() => onRespond(true)}
              >
                <ClipboardCheck className="mr-1.5 size-3.5" /> Approve &amp; proceed
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const editArgs = request.toolName === "edit_file" ? parseEditArgs(request.argsPreview) : null;
  const command = commandOf(request.toolName, request.argsPreview);

  return (
    <div
      role="alertdialog"
      aria-label={`Approve tool ${request.toolName}`}
      className="ducky-glass mx-auto w-full max-w-3xl rounded-2xl px-4 py-3 md:px-6"
    >
      <div className="flex items-start gap-2.5">
        {request.toolName === "bash" || request.toolName === "pc_exec" ? (
          <SquareTerminal className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
        ) : (
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">
            Permission required — ducky wants to run{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[13px] text-primary">
              {request.toolName}
            </code>
          </p>
          {request.reason && (
            <p className="mt-0.5 text-xs text-muted-foreground">{request.reason}</p>
          )}

          {/* kind-specific preview: diff for edits, command for shells, args otherwise */}
          {editArgs ? (
            <div className="mt-2">
              <DiffView oldStr={editArgs.oldStr} newStr={editArgs.newStr} />
            </div>
          ) : command !== null ? (
            <pre className="custom-scrollbar mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border border-amber-500/20 bg-black/40 p-2.5 font-mono text-[12px] leading-relaxed">
              <span aria-hidden className="mr-2 select-none text-emerald-400">$</span>
              {command}
            </pre>
          ) : (
            <pre className="custom-scrollbar mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-card p-2 font-mono text-[11px] leading-relaxed">
              {request.argsPreview}
            </pre>
          )}

          {/* optional feedback → sent as your next message on deny */}
          {feedbackOpen ? (
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Tell ducky what to do instead… (sent as your next message)"
              aria-label="Feedback for the agent"
              className="mt-2 min-h-16 font-mono text-xs"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              className="mt-2 font-mono text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              + add feedback for deny
            </button>
          )}

          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRespond(false, feedback.trim() || undefined)}
            >
              Deny{feedback.trim() ? " + send feedback" : ""}
            </Button>
            {onAlwaysAllow && (
              <Button size="sm" variant="outline" onClick={onAlwaysAllow}>
                Always allow
              </Button>
            )}
            <Button
              size="sm"
              className="bg-amber-500 text-black hover:bg-amber-400"
              onClick={() => onRespond(true)}
            >
              Allow once
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
