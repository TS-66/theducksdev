/**
 * Vendored verbatim from zai-org/ZCode (Apache License 2.0, © Z.ai),
 * original path: packages/ui/src/ModelTrajectoryRoleStyles.ts
 *
 * Only this notice header was added; the code below is unchanged.
 * See THIRD-PARTY-NOTICES.md at the repo root.
 */
export type TrajectoryVisualRole =
  | "system"
  | "user"
  | "assistant"
  | "reasoning"
  | "tool-call"
  | "tool-result";

const roleTextClasses: Record<TrajectoryVisualRole, string> = {
  system: "text-foreground-subtle",
  user: "text-trajectory-user/80",
  assistant: "text-trajectory-assistant/80",
  reasoning: "text-trajectory-reasoning/80",
  "tool-call": "text-trajectory-tool-call/80",
  "tool-result": "text-trajectory-tool-result/80",
};

export function trajectoryRoleTextClass(role: TrajectoryVisualRole): string {
  return roleTextClasses[role];
}
