import { createLocalServices, getAppConfigDir } from "@ducky/services/node";
import {
  materializeBundledDuckyBuiltinProviderConfig,
  readBundledDuckyBuiltinProviderConfig,
} from "./bundledDuckyBuiltinProviderConfig.js";
import { createHttpServer } from "./http.js";

async function main(): Promise<void> {
  const duckyBuiltinProviderConfigFilePath = await materializeBundledDuckyBuiltinProviderConfig({
    environmentConfigRoot: getAppConfigDir(),
    content: readBundledDuckyBuiltinProviderConfig(),
  });
  const port = Number(process.env["PORT"]) || 3030;
  const host = process.env["DUCKY_SERVER_HOST"]?.trim() || process.env["HOST"]?.trim() || undefined;
  const staticRoot = process.env["DUCKY_WEB_STATIC_ROOT"]?.trim() || undefined;
  const authToken = process.env["DUCKY_SERVER_AUTH_TOKEN"]?.trim() || undefined;
  const services = createLocalServices({
    duckyBuiltinProviderConfigFilePath,
    // Ducky Coder guest mode: no sign-in, cross-environment credential push stays disabled.
    providerProvisioningTargetEnabled: false,
  });

  createHttpServer(services, port, {
    ...(host ? { host } : {}),
    ...(staticRoot ? { staticRoot, spaFallback: true } : {}),
    ...(authToken ? { authToken, authRequired: true } : {}),
  });
}

void main().catch((error: unknown) => {
  console.error("[ducky-server:http] startup failed", error);
  process.exitCode = 1;
});
