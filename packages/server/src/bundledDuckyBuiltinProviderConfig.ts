import { materializeDuckyBuiltinProviderConfig } from "@ducky/services/node";

declare const __DUCKY_BUILTIN_PROVIDER_CONFIG_JSON__: string | undefined;

interface MaterializeBundledDuckyBuiltinProviderConfigOptions {
  readonly environmentConfigRoot: string;
  readonly content: string;
}

/** 返回构建时嵌入远端 Server 的 Ducky Built-in Provider Config。 */
export function readBundledDuckyBuiltinProviderConfig(): string {
  if (typeof __DUCKY_BUILTIN_PROVIDER_CONFIG_JSON__ !== "string") {
    throw new Error("当前构建未嵌入 Ducky Built-in Provider Config");
  }
  return __DUCKY_BUILTIN_PROVIDER_CONFIG_JSON__;
}

/**
 * 将 Ducky Built-in Config 原子物化到所属环境的固定资源副本。
 * 升级前退出旧进程；不保留按内容 hash 增长的历史文件。
 */
export async function materializeBundledDuckyBuiltinProviderConfig(
  options: MaterializeBundledDuckyBuiltinProviderConfigOptions,
): Promise<string> {
  return materializeDuckyBuiltinProviderConfig(options);
}
