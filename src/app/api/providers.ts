/**
 * Ducky AI | Coder — server-side credentials (optional fallback).
 *
 * IMPORTANT: this module runs ONLY on the server (imported by API routes).
 * It never leaves the server bundle.
 *
 * Bring-your-own-model: the PRIMARY configuration lives in the user's own
 * browser (Settings → Connections: base URL + API key + model id). These
 * server variables are just a shared fallback so a deployment can work with
 * zero per-user setup:
 *   AI_BASE_URL — OpenAI-compatible base URL (e.g. https://api.example.com/v1)
 *   AI_API_KEY  — bearer key (server env ONLY — never in UI/git)
 *   AI_MODEL_ID — model id served by that endpoint
 *
 * Secrets may ALSO come from a JSON file your own database writes
 * (rotations apply live, no restart):
 *   DUCKY_SECRETS_FILE=/run/ducky/secrets.json
 *   {"apiKey":"...","model":"...","baseUrl":"https://..."}
 * Field priority per key: process.env > secrets file > "" (unconfigured).
 */

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

interface SecretsFile {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

/** Read the database-written secrets file fresh on every call (live rotation). */
function readSecretsFile(): SecretsFile {
  const p = clean(process.env.DUCKY_SECRETS_FILE);
  if (!p) return {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs");
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as Partial<SecretsFile>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return {
      ...(typeof parsed.apiKey === "string" ? { apiKey: parsed.apiKey } : {}),
      ...(typeof parsed.baseUrl === "string" ? { baseUrl: parsed.baseUrl } : {}),
      ...(typeof parsed.model === "string" ? { model: parsed.model } : {}),
    };
  } catch {
    return {};
  }
}

/** Effective value: process.env wins, then secrets file, then "". */
function eff(envKey: "AI_API_KEY" | "AI_BASE_URL" | "AI_MODEL_ID", file: SecretsFile): string {
  const fromEnv = clean(process.env[envKey]);
  if (fromEnv) return fromEnv;
  switch (envKey) {
    case "AI_API_KEY":
      return clean(file.apiKey);
    case "AI_BASE_URL":
      return clean(file.baseUrl);
    case "AI_MODEL_ID":
      return clean(file.model);
  }
}

export interface ResolvedProvider {
  /** Bearer key — SERVER ONLY. Never return this to the client. */
  apiKey: string;
  baseUrl: string;
  /** Model id served by the endpoint ("" when unconfigured). */
  model: string;
  /** True when base URL + key are present server-side. */
  live: boolean;
}

/** Resolve server-side fallback credentials (never client-visible values). */
export function resolveProviderEnv(): ResolvedProvider {
  const file = readSecretsFile();
  const apiKey = eff("AI_API_KEY", file);
  const baseUrl = eff("AI_BASE_URL", file);
  return { apiKey, baseUrl, model: eff("AI_MODEL_ID", file), live: Boolean(apiKey && baseUrl) };
}

/** Back-compat shims (older UI code referenced provider ids — now unused). */
export type ProviderId = "custom";
export function resolveProviderId(): ProviderId {
  return "custom";
}
export function providerDisplayName(): string | null {
  return "server";
}
