/**
 * Adapted from zai-org/ZCode (Apache License 2.0, © Z.ai),
 * original path: packages/ui/src/ModelTrajectoryExpansion.ts
 *
 * Only the type import specifier was adapted from the monorepo alias
 * ("@/ModelTrajectoryRoleStyles.js") to the relative vendored module;
 * all logic below is unchanged. See THIRD-PARTY-NOTICES.md.
 */
import { createContext } from "react";
import type { TrajectoryVisualRole } from "./trajectory-role-styles";

export interface TrajectoryExpansionCommand {
  expanded: boolean;
  version: number;
}

export type TrajectoryExpansionCommands = Record<TrajectoryVisualRole, TrajectoryExpansionCommand>;

export const TRAJECTORY_EXPANSION_KINDS: readonly TrajectoryVisualRole[] = [
  "system",
  "user",
  "reasoning",
  "assistant",
  "tool-call",
  "tool-result",
];

export function createTrajectoryExpansionCommands(): TrajectoryExpansionCommands {
  return Object.fromEntries(
    TRAJECTORY_EXPANSION_KINDS.map((kind) => [kind, { expanded: true, version: 0 }]),
  ) as TrajectoryExpansionCommands;
}

export const TrajectoryExpansionCommandContext = createContext<TrajectoryExpansionCommands | null>(
  null,
);

export interface TrajectoryExpansionOverride {
  open: boolean;
  commandVersion: number;
}

interface TrajectoryExpansionRegistry {
  overrides: ReadonlyMap<string, TrajectoryExpansionOverride>;
  setOverride: (key: string, override: TrajectoryExpansionOverride) => void;
}

export const TrajectoryExpansionRegistryContext = createContext<TrajectoryExpansionRegistry | null>(
  null,
);
