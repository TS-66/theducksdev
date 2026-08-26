"use client";

import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ApprovalRequest } from "@/lib/dsh/types";

interface ApprovalCardProps {
  request: Omit<ApprovalRequest, "resolve">;
  onRespond: (ok: boolean) => void;
}

/** Inline permission-gate card (amber) rendered above the composer. */
export function ApprovalCard({ request, onRespond }: ApprovalCardProps) {
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
            Permission required — dsh wants to run{" "}
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
          <div className="mt-2.5 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => onRespond(false)}>
              Reject
            </Button>
            <Button
              size="sm"
              className="bg-amber-500 text-black hover:bg-amber-400"
              onClick={() => onRespond(true)}
            >
              Approve
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
