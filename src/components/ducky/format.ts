/**
 * Ducky AI | Coder — small formatting helpers (UI-local).
 */

import { formatCompactTokenNumber } from "@/lib/ducky/zcode-vendor/token-number-format";

/** 1234 -> "1.2k", 1234567 -> "1234.6k" style compact counters */
export function fmtK(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) < 1000) return String(Math.round(n));
  const k = n / 1000;
  return k >= 100 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`;
}

/** Compact token counter via vendored ZCode formatter ("en-US" keeps K/M/B stable). */
export function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return formatCompactTokenNumber("en-US", n);
}

/** "5m ago", "2h ago", "3d ago" */
export function relTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function clockHM(d: Date = new Date()): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function shortId(id: string | null | undefined): string {
  return (id ?? "").replace(/-/g, "").slice(0, 4);
}

const KNOWN_ARG_KEYS = [
  "path",
  "file_path",
  "filepath",
  "file",
  "glob",
  "pattern",
  "query",
  "command",
  "url",
  "name",
  "content",
];

/**
 * One-line args summary: prettified `key=value` for well-known keys,
 * minified JSON otherwise. Caller truncates to fit.
 */
export function summarizeArgs(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    return raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return JSON.stringify(parsed) ?? "";
  }
  const obj = parsed as Record<string, unknown>;
  const keys = Object.keys(obj);
  const ordered = [...KNOWN_ARG_KEYS.filter((k) => k in obj), ...keys.filter((k) => !KNOWN_ARG_KEYS.includes(k))];
  const parts = ordered.map((k) => {
    let v = obj[k];
    if (typeof v === "string" && v.length > 40) v = `${v.slice(0, 37)}…`;
    else if (typeof v !== "string") v = JSON.stringify(v);
    return `${k}=${String(v)}`;
  });
  const out = parts.join(" ");
  return out;
}

export function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function byteSize(s: string): string {
  const bytes = new TextEncoder().encode(s).length;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} kB`;
}
