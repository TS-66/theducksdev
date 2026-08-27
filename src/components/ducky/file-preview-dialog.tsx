"use client";

import * as React from "react";
import { Check, Copy, Download, FileCode2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { byteSize } from "./format";
import { imageDataUrl, isImageEntry, mimeForExt } from "@/lib/ducky/images";

interface FilePreviewDialogProps {
  path: string | null;
  content: string;
  onOpenChange: (open: boolean) => void;
}

/** Fullscreen-ish read-only viewer: line-number gutter for text, gallery mode for images. */
export function FilePreviewDialog({ path, content, onOpenChange }: FilePreviewDialogProps) {
  const [copied, setCopied] = React.useState(false);
  const lines = React.useMemo(() => (path ? content.split("\n") : []), [content, path]);
  const image = React.useMemo(
    () => (path && content ? isImageEntry(path, content) : false),
    [path, content],
  );

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
                {image ? (
                  <ImageIcon className="size-4 shrink-0 text-pink-400" aria-hidden />
                ) : (
                  <FileCode2 className="size-4 shrink-0 text-[#FDC00A]" aria-hidden />
                )}
                <span className="truncate font-mono font-normal">{path}</span>
              </DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-3 pl-6 font-mono text-[10px] uppercase tracking-wide">
                {image ? (
                  <>
                    <span>image</span>
                    <ImageMeta path={path} content={content} />
                    <span>{byteSize(content)}</span>
                  </>
                ) : (
                  <>
                    <span>{lines.length} lines</span>
                    <span>{byteSize(content)}</span>
                  </>
                )}
                <span>virtual workspace</span>
              </DialogDescription>
              {image ? (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Download image"
                  onClick={() => downloadImage(path, content)}
                  className="absolute right-9 top-3 size-7"
                >
                  <Download className="size-3.5" />
                </Button>
              ) : (
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
              )}
            </DialogHeader>

            {image ? (
              <ImageViewer dataUrl={imageDataUrl(content) ?? ""} name={path} />
            ) : (
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
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────────── image viewer ─────────────────────────────── */

function ImageViewer({ dataUrl, name }: { dataUrl: string; name: string }) {
  return (
    <div className="ducky-checkerboard relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
      {/* inline data URL from the local vFS — next/image adds nothing here */}
      <img
        src={dataUrl}
        alt={`Preview of ${name}`}
        className="max-h-full max-w-full rounded-md border bg-background object-contain shadow-lg"
      />
    </div>
  );
}

/** Reports natural W×H once the bitmap decodes. */
function ImageMeta({ path, content }: { path: string; content: string }) {
  const [dims, setDims] = React.useState<string>("");
  const src = imageDataUrl(content) ?? "";
  return (
    <span aria-label="Image dimensions">
      {dims || (
        // measure via a detached image — no layout cost in the header itself
        <Measurer src={src} onDims={(d) => setDims(d)} />
      )}
      {!dims && mimeForExt(path).replace("image/", "")}
    </span>
  );
}

function Measurer({ src, onDims }: { src: string; onDims: (d: string) => void }) {
  React.useEffect(() => {
    if (!src) return;
    const img = new window.Image();
    img.onload = () =>
      onDims(`${img.naturalWidth}×${img.naturalHeight}`);
    img.onerror = () => onDims("");
    img.src = src;
  }, [src]);
  return null;
}

/** Decode a data URL into real bytes so downloads are valid images, not text. */
function downloadImage(path: string, content: string): void {
  try {
    const url = imageDataUrl(content);
    if (!url) throw new Error("not an inline image");
    const a = document.createElement("a");
    a.href = url;
    a.download = path.split("/").pop() ?? "image";
    a.click();
    toast.success("Image downloaded", { description: a.download });
  } catch {
    /* unreachable behind the isImageEntry guard */
  }
}
