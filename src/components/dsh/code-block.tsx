"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "@/lib/utils";

/**
 * Fenced code block with syntax highlighting + copy button.
 * `oneDark` theme is typed via @types/react-syntax-highlighter; the style
 * object itself is a loose record so we cast once here (single any-cast site).
 */
const oneDarkStyle = oneDark as any;

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

export function CodeBlock({ code, language, className }: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className={cn("group/code relative my-3 overflow-hidden rounded-md border bg-[#282c34]", className)}>
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">
          {language ?? "text"}
        </span>
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? "Copied" : "Copy code"}
          className="rounded p-0.5 text-neutral-400 opacity-0 transition-opacity hover:text-neutral-200 focus-visible:opacity-100 group-hover/code:opacity-100"
        >
          {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <SyntaxHighlighter
        language={language ?? "text"}
        style={oneDarkStyle}
        wrapLongLines={false}
        customStyle={{
          margin: 0,
          padding: "0.85rem 1rem",
          background: "transparent",
          fontSize: "13px",
          lineHeight: 1.55,
        }}
        codeTagProps={{ style: { fontFamily: "var(--font-mono), monospace" } }}
      >
        {code.endsWith("\n") ? code.slice(0, -1) : code}
      </SyntaxHighlighter>
    </div>
  );
}
