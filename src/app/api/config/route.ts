/**
 * Read-only capability probe. Returns booleans only — never credential
 * values, never endpoint URLs. Lets the client know whether the live agent
 * path is available without any user-side configuration.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const live =
    Boolean(process.env.AI_API_KEY) && Boolean(process.env.AI_BASE_URL);
  return Response.json(
    { live },
    { headers: { "Cache-Control": "no-store" } },
  );
}
