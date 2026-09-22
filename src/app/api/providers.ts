/**
 * Ducky AI | Coder — the ONE provider: NVIDIA Build.
 *
 * IMPORTANT: this module runs ONLY on the server (imported by API routes).
 * It never leaves the server bundle, so the API key set via env is invisible
 * to browsers, devtools, and git (`.env*` is gitignored).
 *
 * Single preset — NVIDIA Nemotron 3 Ultra (550B MoE, 55B active):
 * frontier reasoning + agentic coding model with tool calling
 * (`tools`/`tool_choice`), streaming `reasoning_content` (feeds the
 * Thinking… cards), and up to 1M context. Served on NVIDIA's optimized
 * stack at:
 *   AI_PROVIDER=nvidia (the default — you can omit it entirely)
 *   AI_API_KEY=nvapi-...  # server env ONLY — never paste in UI
 *   (base URL + model fill in automatically; override below if needed)
 *
 * Secrets may ALSO come from a JSON file your own database writes
 * (rotations apply live, no restart):
 *   DUCKY_SECRETS_FILE=/run/ducky/secrets.json
 *   {"apiKey":"nvapi-...","model":"nvidia/nemotron-3-ultra-550b-a55b","baseUrl":"https://..."}
 * Field priority per key: process.env > secrets file > preset default.
 */

/** The single provider endpoint (OpenAI-compatible). */
export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

/** The one model: Nemotron 3 Ultra. Override via AI_MODEL_ID if needed. */
export const NVIDIA_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";

export type ProviderId = "nvidia" | "custom";

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

/** Effective value: process.env wins, then secrets file. */
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
  provider: ProviderId;
  /** What the UI may show (never a secret value). */
  label: string;
  /** Bearer key — SERVER ONLY. Never return this to the client. */
  apiKey: string;
  baseUrl: string;
  /** Upstream model id sent to the provider. */
  model: string;
}

/**
 * Resolve effective credentials server-side. One preset: a custom
 * AI_BASE_URL switches to "custom" mode, otherwise it's NVIDIA + Nemotron 3
 * Ultra with zero configuration beyond the key.
 */
export function resolveProviderEnv(): ResolvedProvider {
  const file = readSecretsFile();
  const apiKey = eff("AI_API_KEY", file);
  const baseUrl = eff("AI_BASE_URL", file) || NVIDIA_BASE_URL;
  const custom = baseUrl.toLowerCase() !== NVIDIA_BASE_URL.toLowerCase();
  return {
    provider: custom ? "custom" : "nvidia",
    label: custom ? "server" : "nvidia",
    apiKey,
    baseUrl,
    model: eff("AI_MODEL_ID", file) || NVIDIA_MODEL,
  };
}

/** Back-compat: old configs may still set AI_PROVIDER — only "nvidia" is meaningful now. */
export function resolveProviderId(): ProviderId {
  return resolveProviderEnv().provider;
}

/** Back-compat: UI-safe label for a provider id. */
export function providerDisplayName(id: ProviderId | null): string | null {
  if (id === "custom") return "server";
  if (id === "nvidia") return "nvidia";
  return null;
}
