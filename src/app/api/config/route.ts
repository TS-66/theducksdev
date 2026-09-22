/**
 * Read-only capability probe. Returns booleans + app version ONLY — never
 * credential values, never endpoint URLs. Lets the client know whether a
 * shared server-side fallback exists (the user's own Settings → Connections
 * key always works regardless) and which app version is serving the UI.
 */

import { resolveProviderEnv } from "../providers";

export const dynamic = "force-dynamic";

function appVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require("../../../../package.json") as { version?: string };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export async function GET(): Promise<Response> {
  const server = resolveProviderEnv();
  return Response.json(
    { live: server.live, hasModelId: Boolean(server.model), version: appVersion() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
