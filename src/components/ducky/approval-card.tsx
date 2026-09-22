"use client";

import { ClipboardCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ApprovalRequest } from "@/lib/ducky/types";

interface ApprovalCardProps {
  request: Omit<ApprovalRequest, "resolve">;
  onRespond: (ok: boolean) => void;
  /** "always allow" escalates the permission mode, then approves */
  onAlwaysAllow?: () => void;
}

/** Inline permission-gate card rendered above the composer.
 *  exit_plan_mode gets a dedicated violet plan-review treatment. */
export function ApprovalCard({ request, onRespond, onAlwaysAllow }: ApprovalCardProps) {
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

  return (
    <div
      role="alertdialog"
      aria-label={`Approve tool ${request.toolName}`}
      className="mx-auto w-full max-w-3xl rounded-lg border border-amber-500/50 bg-amber-500/5 px-4 py-3 shadow-sm md:px-8"
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
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
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-card p-2 font-mono text-[11px] leading-relaxed">
            {request.argsPreview}
          </pre>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onRespond(false)}>
              Deny
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
