/**
 * Ducky AI | Coder — model registry.
 *
 * A single user-facing model: **Ducky 3.5 Coder**. Behind the curtain it is
 * served by NVIDIA Neutron 3 Ultra (550B params) through the AIHUBMIX
 * OpenAI-compatible gateway. The public id never leaks the upstream name —
 * the server maps `ducky-3.5-coder` → `AIHUBMIX_MODEL` (default
 * `neutron-3-ultra-550b`) inside /api/chat.
 */

export const MODEL_ID = "ducky-3.5-coder" as const;

export const MODEL_DISPLAY = "Ducky 3.5 Coder";

export const KNOWN_MODELS = [MODEL_ID] as const;

/** Short marketing blurb shown under the model picker / settings card. */
export const MODEL_BLURB =
  "Flagship coding model. Powered by NVIDIA Neutron 3 Ultra (550B) — served via AIHUBMIX.";

/** Where to get a key, shown in Settings → Models. */
export const KEY_PORTAL_URL = "https://aihubmix.com";
export const KEY_PORTAL_LABEL = "aihubmix.com";

/** Default OpenAI-compatible base URL (AIHUBMIX gateway). */
export const DEFAULT_BASE_URL = "https://aihubmix.com/v1";

/** Map a (possibly legacy) model id to its user-facing display name. */
export function modelDisplayName(model: string | undefined): string {
  if (!model) return MODEL_DISPLAY;
  if (model === "demo-script") return "demo";
  return MODEL_DISPLAY;
}
