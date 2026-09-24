import { DEFAULT_DUCKY_ENDPOINT_ORIGIN } from "./duckyEndpoint.js";

export const DUCKY_SOURCE_HEADERS = {
  "User-Agent": "Ducky/unknown",
  "HTTP-Referer": DEFAULT_DUCKY_ENDPOINT_ORIGIN,
  "X-Title": "Z Code@electron",
} as const;

export interface BuildDuckySourceHeadersFromContextOptions {
  appVersion?: string;
  arch?: string;
  clientLanguage?: string;
  clientTimezone?: string;
  deviceMid?: string;
  endpointOrigin?: string;
  osVersion?: string;
  platform?: string;
  releaseChannel?: string;
  sourceTitle?: string;
}

export function normalizeDuckySourceHeaderValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !/^[\x20-\x7e]+$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export function buildDuckySourceHeadersFromContext(
  options: BuildDuckySourceHeadersFromContextOptions = {},
): Record<string, string> {
  const appVersion = normalizeDuckySourceHeaderValue(options.appVersion);
  const arch = normalizeDuckySourceHeaderValue(options.arch);
  const clientLanguage = normalizeDuckySourceHeaderValue(options.clientLanguage) ?? "unknown";
  const clientTimezone = normalizeDuckySourceHeaderValue(options.clientTimezone) ?? "unknown";
  const deviceMid = normalizeDuckySourceHeaderValue(options.deviceMid);
  const endpointOrigin =
    normalizeDuckySourceHeaderValue(options.endpointOrigin) ?? DEFAULT_DUCKY_ENDPOINT_ORIGIN;
  const osVersion = normalizeDuckySourceHeaderValue(options.osVersion);
  const platform = normalizeDuckySourceHeaderValue(options.platform);
  const releaseChannel = normalizeDuckySourceHeaderValue(options.releaseChannel);
  const sourceTitle = normalizeDuckySourceHeaderValue(options.sourceTitle) ?? "electron";

  return {
    ...DUCKY_SOURCE_HEADERS,
    "HTTP-Referer": endpointOrigin,
    "User-Agent": `Ducky/${appVersion ?? "unknown"}`,
    ...(appVersion ? { "X-Ducky-App-Version": appVersion } : {}),
    "X-Title": `Z Code@${sourceTitle}`,
    ...(platform && arch ? { "X-Platform": `${platform}-${arch}` } : {}),
    ...(releaseChannel ? { "X-Release-Channel": releaseChannel } : {}),
    "X-Client-Language": clientLanguage,
    "X-Client-Timezone": clientTimezone,
    ...(platform ? { "X-Os-Category": normalizeOsCategory(platform) } : {}),
    ...(osVersion ? { "X-Os-Version": osVersion } : {}),
    ...(deviceMid ? { "X-Device-Mid": deviceMid } : {}),
  };
}

function normalizeOsCategory(platform: string): string {
  switch (platform) {
    case "darwin":
      return "macos";
    case "win32":
      return "windows";
    default:
      return "linux";
  }
}
