/**
 * Read-only capability probe. Returns booleans ONLY — never credential
 * values, never endpoint URLs. Lets the client know whether a shared
 * server-side fallback exists (the user's own Settings → Connections key
 * always works regardless).
 */

import { resolveProviderEnv } from "../providers";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const server = resolveProviderEnv();
  return Response.json(
    { live: server.live, hasModelId: Boolean(server.model) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
