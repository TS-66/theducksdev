/**
 * Ducky AI | Coder — model identity.
 *
 * Bring-your-own-model: there is no bundled model and no hard-coded id.
 * The user points the app at ANY OpenAI-compatible endpoint (base URL + key
 * + model id, all editable in Settings → Connections or via server env).
 * The display name is simply the configured model id.
 */

/** Empty = not configured yet — the UI guides the user to Connections. */
export const DEFAULT_MODEL = "";

/** User-facing name for a model id (or the unconfigured placeholder). */
export function modelDisplayName(model: string | undefined): string {
  const m = (model ?? "").trim();
  return m || "Custom model";
}

/** True when a usable model id is configured (client settings or server). */
export function hasModelId(model: string | undefined): boolean {
  return (model ?? "").trim().length > 0;
}
