/**
 * Ducky AI | Coder — model registry.
 *
 * A single user-facing model: **Ducky 3.5 Coder**. Which endpoint serves it
 * is a deployment concern, configured entirely through server environment
 * variables (AI_BASE_URL / AI_API_KEY / AI_MODEL_ID) — nothing here (or
 * anywhere in the client bundle) references the upstream provider.
 */

export const MODEL_ID = "ducky-3.5-coder" as const;

export const MODEL_DISPLAY = "Ducky 3.5 Coder";

export const KNOWN_MODELS = [MODEL_ID] as const;

/** Short marketing blurb shown under the model picker / settings card. */
export const MODEL_BLURB =
  "The one model. Tuned end-to-end for agentic coding — tools, diffs and long-horizon tasks.";

/** Default base URL used when the user hasn't overridden it in Settings.
 *  Empty string = defer to the server-configured endpoint (AI_BASE_URL). */
export const DEFAULT_BASE_URL = "";

/** Map a (possibly legacy) model id to its user-facing display name. */
export function modelDisplayName(model: string | undefined): string {
  if (!model) return MODEL_DISPLAY;
  if (model === "demo-script") return "demo";
  return MODEL_DISPLAY;
}
