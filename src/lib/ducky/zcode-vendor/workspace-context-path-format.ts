/**
 * Vendored verbatim from zai-org/ZCode (Apache License 2.0, © Z.ai),
 * original path: packages/ui/src/WorkspaceHeaderSections/workspaceContextPathFormat.ts
 *
 * Only this notice header was added; the code below is unchanged.
 * See THIRD-PARTY-NOTICES.md at the repo root.
 */
export function formatWorkspaceContextPath(path: string, home?: string): string {
  if (!home) return path;
  const normalizedPath = path.replace(/\\/g, "/");
  const normalizedHome = home.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalizedHome) return path;
  if (normalizedPath === normalizedHome) return "~";
  return normalizedPath.startsWith(`${normalizedHome}/`)
    ? `~${normalizedPath.slice(normalizedHome.length)}`
    : path;
}
