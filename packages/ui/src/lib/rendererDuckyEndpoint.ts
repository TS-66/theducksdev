import {
  buildRuntimeDuckyEndpointUrls,
  DUCKY_ENV,
  type RuntimeDuckyEndpointEnv,
} from "@ducky/shared";

interface RendererImportMetaEnv {
  VITE_DUCKY_BASE_URL?: string;
  VITE_DUCKY_ENDPOINT_ORIGIN?: string;
}

function readRendererImportMetaEnv(): RendererImportMetaEnv {
  return ((import.meta as ImportMeta & { env?: RendererImportMetaEnv }).env ??
    {}) as RendererImportMetaEnv;
}

function createRendererDuckyEndpointEnv(
  env: RendererImportMetaEnv = readRendererImportMetaEnv(),
): RuntimeDuckyEndpointEnv {
  return {
    DUCKY_ENV,
    // UI 侧的 ducky-plan 占位 provider 以前只看 DUCKY_ENV，
    // 没有消费 Vite 注入的 base url，导致自定义测试域名时 renderer 和 host/service 可能不一致。
    DUCKY_BASE_URL: env.VITE_DUCKY_BASE_URL,
    DUCKY_ENDPOINT_ORIGIN: env.VITE_DUCKY_ENDPOINT_ORIGIN,
  };
}

export const RENDERER_DUCKY_ENDPOINT_URLS = buildRuntimeDuckyEndpointUrls(
  createRendererDuckyEndpointEnv(),
);
