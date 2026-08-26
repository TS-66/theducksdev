"use client";

import * as React from "react";
import { Check, Copy, FileCode2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { byteSize } from "./format";

interface FilePreviewDialogProps {
  path: string | null;
  content: string;
  onOpenChange: (open: boolean) => void;
}

/** Fullscreen-ish read-only viewer with line-number gutter + copy. */
export function FilePreviewDialog({ path, content, onOpenChange }: FilePreviewDialogProps) {
  const [copied, setCopied] = React.useState(false);
  const lines = React.useMemo(() => (path ? content.split("\n") : []), [content, path]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  return (
    <Dialog open={Boolean(path)} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-h-[85vh] w-[720px] max-w-[94vw] flex-col gap-0 p-0">
        {path && (
          <>
            <DialogHeader className="border-b px-4 py-3">
              <DialogTitle className="flex min-w-0 items-center gap-2 text-sm">
                <FileCode2 className="size-4 shrink-0 text-[#4D6BFE]" aria-hidden />
                <span className="truncate font-mono font-normal">{path}</span>
              </DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-3 pl-6 font-mono text-[10px] uppercase tracking-wide">
                <span>{lines.length} lines</span>
                <span>{byteSize(content)}</span>
                <span>virtual workspace</span>
              </DialogDescription>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Copy file contents"
                onClick={onCopy}
                className="absolute right-9 top-3 size-7"
              >
                {copied ? (
                  <Check className="size-3.5 text-emerald-500" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </Button>
            </DialogHeader>

            <ScrollArea className="min-h-0 flex-1">
              <pre className="min-w-full p-4 font-mono text-xs leading-relaxed">
                <code className="grid grid-cols-[auto_1fr] gap-x-3">
                  {lines.map((line, i) => (
                    <React.Fragment key={i}>
                      <span
                        aria-hidden
                        className="select-none border-r pr-3 text-right text-muted-foreground/50"
                      >
                        {i + 1}
                      </span>
                      <span className="whitespace-pre-wrap break-words">{line || " "}</span>
                    </React.Fragment>
                  ))}
                </code>
              </pre>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
