"use client";

import * as React from "react";
import {
  createTrajectoryExpansionCommands,
  TrajectoryExpansionCommandContext,
  TrajectoryExpansionRegistryContext,
  type TrajectoryExpansionOverride,
} from "@/lib/ducky/zcode-vendor/trajectory-expansion";
import type { TrajectoryVisualRole } from "@/lib/ducky/zcode-vendor/trajectory-role-styles";

const STORAGE_KEY = "ducky-traj-expansion-v1";

function loadOverrides(): Map<string, TrajectoryExpansionOverride> {
  try {
    if (typeof localStorage === "undefined") return new Map();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, TrajectoryExpansionOverride>;
    return new Map(Object.entries(obj).filter(([, v]) => v && typeof v.open === "boolean"));
  } catch {
    return new Map();
  }
}

/**
 * Provides ZCode's trajectory expansion defaults + persisted per-row
 * overrides (localStorage). Wrap the transcript once; rows consume via
 * `useTrajectoryOpen(role, key, fallbackOpen)`.
 */
export function TrajectoryExpansionProvider({ children }: { children: React.ReactNode }) {
  const [commands] = React.useState(createTrajectoryExpansionCommands);
  const [overrides, setOverrides] = React.useState<Map<string, TrajectoryExpansionOverride>>(
    () => loadOverrides(),
  );

  const setOverride = React.useCallback((key: string, override: TrajectoryExpansionOverride) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(key, override);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(next)));
      } catch {
        // private mode — memory copy still works for this session
      }
      return next;
    });
  }, []);

  const registry = React.useMemo(
    () => ({ overrides, setOverride }),
    [overrides, setOverride],
  );

  return (
    <TrajectoryExpansionCommandContext.Provider value={commands}>
      <TrajectoryExpansionRegistryContext.Provider value={registry}>
        {children}
      </TrajectoryExpansionRegistryContext.Provider>
    </TrajectoryExpansionCommandContext.Provider>
  );
}

/**
 * Row open-state: persisted user override wins, else the vendored
 * role default, else the caller fallback. Toggling records an override.
 */
export function useTrajectoryOpen(
  role: TrajectoryVisualRole,
  key: string,
  fallbackOpen: boolean,
): [boolean, (open: boolean) => void] {
  const commands = React.useContext(TrajectoryExpansionCommandContext);
  const registry = React.useContext(TrajectoryExpansionRegistryContext);
  const override = registry?.overrides.get(key);
  const roleDefault = commands?.[role].expanded ?? fallbackOpen;
  const open = override ? override.open : roleDefault;
  const setOpen = React.useCallback(
    (next: boolean) => {
      registry?.setOverride(key, {
        open: next,
        commandVersion: commands?.[role].version ?? 0,
      });
    },
    [registry, commands, role, key],
  );
  return [open, setOpen];
}
