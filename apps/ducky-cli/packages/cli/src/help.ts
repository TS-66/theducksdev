import { getDuckyCopy, type SupportedLocale, type UiLocale } from "@ducky/i18n";

export function formatCliHelp(
  version: string,
  locale?: UiLocale,
  detectedLocale?: SupportedLocale,
): string {
  return getDuckyCopy(locale, detectedLocale).cli.help(version);
}
