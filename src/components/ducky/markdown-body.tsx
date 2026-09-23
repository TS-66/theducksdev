"use client";

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./code-block";
import {
  isMermaidLanguage,
  shouldRenderMermaidCodeBlock,
} from "@/lib/ducky/zcode-vendor/mermaid-language";

/**
 * Hand-rolled prose styling (no @tailwindcss/typography dependency).
 * - fenced blocks -> CodeBlock (react-syntax-highlighter / oneDark)
 * - inline code   -> muted pill in brand-primary tone
 * - tables        -> bordered, rounded, horizontally scrollable
 * - links         -> underlined, open in a new tab
 */
const components: Components = {
  pre(props) {
    const { children } = props;
    let code = "";
    let lang: string | undefined;
    if (React.isValidElement(children)) {
      const p = (children.props ?? {}) as { className?: string; children?: any };
      const m = /language-([\w+#.-]+)/.exec(p.className ?? "");
      lang = m?.[1];
      if (typeof p.children === "string") code = p.children;
      else if (Array.isArray(p.children)) code = p.children.map((c) => String(c)).join("");
      else code = String(p.children ?? "");
    } else {
      code = String(children ?? "");
    }
    const clean = code.replace(/\n$/, "");
    if (isMermaidLanguage(lang ?? "") || shouldRenderMermaidCodeBlock(lang ?? "", clean)) {
      return (
        <div className="my-3 overflow-hidden rounded-md border">
          <div className="border-b bg-muted/50 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            mermaid diagram
          </div>
          <pre className="overflow-x-auto p-3 font-mono text-[13px] leading-relaxed">{clean}</pre>
        </div>
      );
    }
    return <CodeBlock code={clean} language={lang} />;
  },
  code({ className, children }) {
    return (
      <code
        className={cn(
          "rounded bg-muted px-1.5 py-0.5 font-mono text-[13px] text-primary",
          className,
        )}
      >
        {children}
      </code>
    );
  },
  h1({ children }) {
    return <h1 className="mb-2 mt-4 text-lg font-semibold first:mt-0">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="mb-2 mt-4 text-[15px] font-semibold first:mt-0">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="mb-1.5 mt-3 text-[15px] font-semibold first:mt-0">{children}</h3>;
  },
  h4({ children }) {
    return <h4 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">{children}</h4>;
  },
  p({ children }) {
    return <p className="leading-relaxed [&:not(:first-child)]:mt-2">{children}</p>;
  },
  strong({ children }) {
    return <strong className="font-semibold">{children}</strong>;
  },
  em({ children }) {
    return <em className="italic">{children}</em>;
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:opacity-80"
      >
        {children}
      </a>
    );
  },
  ul({ children }) {
    return <ul className="my-2 list-disc space-y-1 pl-5 marker:text-muted-foreground">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-muted-foreground">{children}</ol>;
  },
  li({ children }) {
    return <li className="leading-relaxed">{children}</li>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-2 border-l-2 border-border pl-3 italic text-muted-foreground">
        {children}
      </blockquote>
    );
  },
  hr() {
    return <hr className="my-4 border-border" />;
  },
  table({ children }) {
    return (
      <div className="my-3 overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-muted/50">{children}</thead>;
  },
  th({ children, style }) {
    return (
      <th
        style={style}
        className="border-b px-3 py-1.5 text-left font-semibold [&:not(:last-child)]:border-r"
      >
        {children}
      </th>
    );
  },
  td({ children, style }) {
    return (
      <td
        style={style}
        className="border-b px-3 py-1.5 align-top last:border-r-0 [&:not(:last-child)]:border-r [&:not(:last-child)]:border-border/60"
      >
        {children}
      </td>
    );
  },
  tr({ children }) {
    return (
      <tr className="transition-colors odd:bg-muted/20 hover:bg-muted/40 [&:not(:last-child)]:border-b">
        {children}
      </tr>
    );
  },
};

export function MarkdownBody({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("min-w-0 break-words text-[15px]", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
