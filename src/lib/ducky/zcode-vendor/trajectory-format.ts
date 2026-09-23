/**
 * Vendored verbatim from zai-org/ZCode (Apache License 2.0, © Z.ai),
 * original path: packages/ui/src/ModelTrajectoryFormat.ts
 *
 * Only this notice header was added; the code below is unchanged.
 * See THIRD-PARTY-NOTICES.md at the repo root.
 */
export function formatTrajectoryClockTime(value: string): string {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return value;
  return new Date(time).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatTrajectoryDateTime(value: string): string {
  const time = Date.parse(value);
  return Number.isNaN(time) ? value : new Date(time).toLocaleString();
}

export function formatTrajectoryDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(durationMs < 10000 ? 2 : 1)}s`;
}
