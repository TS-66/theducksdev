export const DUCKY_BUILTIN_PROVIDER_CONFIG_FILE_ENV = "DUCKY_BUILTIN_PROVIDER_CONFIG_FILE";
export const DUCKY_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE_ENV =
  "DUCKY_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE";
export const DUCKY_PERSONAL_PROVIDER_CONFIG_FILE_ENV = "DUCKY_PERSONAL_PROVIDER_CONFIG_FILE";
export const PERSONAL_PROVIDER_CONFIG_FILE_NAME = "provider_config.json";

export interface NodeProviderRuntimePaths {
  readonly duckyBuiltinFilePath: string;
  readonly personalFilePath: string;
}

export function createNodeProviderRuntimePathEnv(
  paths: NodeProviderRuntimePaths,
): Record<string, string> {
  return {
    [DUCKY_BUILTIN_PROVIDER_CONFIG_FILE_ENV]: paths.duckyBuiltinFilePath,
    [DUCKY_PERSONAL_PROVIDER_CONFIG_FILE_ENV]: paths.personalFilePath,
  };
}

export function resolveNodeProviderRuntimePaths(
  env: Readonly<Record<string, string | undefined>>,
): NodeProviderRuntimePaths | null {
  const duckyBuiltinFilePath = env[DUCKY_BUILTIN_PROVIDER_CONFIG_FILE_ENV]?.trim();
  const personalFilePath = env[DUCKY_PERSONAL_PROVIDER_CONFIG_FILE_ENV]?.trim();
  if (!duckyBuiltinFilePath && !personalFilePath) return null;
  if (!duckyBuiltinFilePath || !personalFilePath) {
    throw new Error("Ducky Built-in 与 Personal Provider Config 路径必须同时提供");
  }
  return Object.freeze({ duckyBuiltinFilePath, personalFilePath });
}
