import { buildRuntimeDuckyApiUrl, resolveZaiBusinessBaseUrl } from "@ducky/shared";

export const DUCKY_CLIENT_SCENES_URL = buildRuntimeDuckyApiUrl(
  process.env,
  "/api/v1/client/scenes",
);

export const ZAI_API_HOST = resolveZaiBusinessBaseUrl(process.env);
