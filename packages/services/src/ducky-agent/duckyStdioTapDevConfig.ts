import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DuckyStdioTapDevState } from "@ducky/shared";
import { getAppConfigDir } from "#src/paths.js";
import { isEffectiveDevelopmentNodeEnv } from "#src/runtime-tools/nodeEnv.js";

interface DuckyStdioTapStateFile {
  enabled?: boolean;
}

function isDuckyStdioTapDevVisible(): boolean {
  return isEffectiveDevelopmentNodeEnv();
}

function getDuckyStdioTapDevDir(): string {
  return join(getAppConfigDir(), "dev");
}

export function getDuckyStdioTapDevLogDir(): string {
  return join(getDuckyStdioTapDevDir(), "stdio-traffic");
}

function getDuckyStdioTapDevStatePath(): string {
  return join(getDuckyStdioTapDevDir(), "ducky-stdio-tap.json");
}

function readStateFile(path: string): DuckyStdioTapStateFile {
  if (!existsSync(path)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as DuckyStdioTapStateFile) : {};
  } catch {
    return {};
  }
}

export function readDuckyStdioTapDevState(): DuckyStdioTapDevState {
  const visible = isDuckyStdioTapDevVisible();
  const statePath = getDuckyStdioTapDevStatePath();
  const fileState = readStateFile(statePath);
  return {
    enabled: visible && fileState.enabled === true,
    visible,
    logDir: getDuckyStdioTapDevLogDir(),
    statePath,
  };
}

export function setDuckyStdioTapDevEnabled(enabled: boolean): DuckyStdioTapDevState {
  const visible = isDuckyStdioTapDevVisible();
  const statePath = getDuckyStdioTapDevStatePath();
  mkdirSync(getDuckyStdioTapDevDir(), { recursive: true });
  writeFileSync(
    statePath,
    `${JSON.stringify(
      {
        // 开发态 stdio 抓包是高频原始协议帧，只能通过显式开关写旁路文件，避免误进生产日志。
        enabled: visible && enabled,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  return readDuckyStdioTapDevState();
}
