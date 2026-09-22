/**
 * Read-only capability probe. Returns booleans + a generic provider label
 * ONLY — never credential values, never endpoint URLs, never vendor names
 * except the default preset. Lets the client know whether the live agent
 * path is available without any user-side configuration.
 */

import { resolveProviderEnv } from "../providers";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const server = resolveProviderEnv();
  const live = Boolean(server.apiKey) && Boolean(server.baseUrl);
  // AI_MODEL_ID is technically optional but only works against an endpoint
  // that understands the literal "ducky-3.5-coder" id — real providers need
  // a model they actually serve (the default preset ships one).
  const hasModelId = server.model !== "ducky-3.5-coder";
  return Response.json(
    { live, hasModelId, provider: server.label },
    { headers: { "Cache-Control": "no-store" } },
  );
}
