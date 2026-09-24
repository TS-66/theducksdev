import type { UiLocale, SupportedLocale } from "@ducky/contracts";
import { enUS } from "./locales/en-US.js";
import { zhCN } from "./locales/zh-CN.js";
import {
  DEFAULT_LOCALE,
  detectLocale,
  isSupportedLocale,
  isUiLocale,
  resolveLocale,
  SUPPORTED_LOCALES,
} from "./locale.js";
import type { DuckyCopy } from "./types.js";

export {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  detectLocale,
  isSupportedLocale,
  isUiLocale,
  resolveLocale,
};
export type { LocaleDetectionInput } from "./locale.js";
export type { CliCopy, TuiCopy, UiLocale, SupportedLocale, DuckyCopy } from "./types.js";

const CATALOGS: Record<SupportedLocale, DuckyCopy> = {
  "en-US": enUS,
  "zh-CN": zhCN,
};

export function getDuckyCopy(locale?: UiLocale | string, detected?: string | null): DuckyCopy {
  return CATALOGS[resolveLocale(locale, detected)];
}
