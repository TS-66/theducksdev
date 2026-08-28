/**
 * Read-only capability probe. Returns booleans only — never credential
 * values, never endpoint URLs. Lets the client know whether the live agent
 * path is available without any user-side configuration.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const live =
    Boolean(process.env.AI_API_KEY) && Boolean(process.env.AI_BASE_URL);
  // AI_MODEL_ID is technically optional but only works against an endpoint
  // that understands the literal "ducky-3.5-coder" id — real providers need
  // it set to the upstream model they actually serve.
  const hasModelId = Boolean(process.env.AI_MODEL_ID);
  return Response.json(
    { live, hasModelId },
    { headers: { "Cache-Control": "no-store" } },
  );
}
