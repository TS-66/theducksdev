import {
  collectVisibleDuckyBackgroundTaskControlItems,
  getDuckyBackgroundTaskControlItemElapsedMs,
  isActiveDuckyBackgroundTaskControlItem,
  parseDuckyBackgroundTaskControlItems,
  type DuckyBackgroundTaskControlItem,
  type DuckyBackgroundTaskControlStatus,
} from "./background-task-controls.js";

export type DuckyBackgroundBashJobStatus = DuckyBackgroundTaskControlStatus;
export type DuckyBackgroundBashJob = DuckyBackgroundTaskControlItem & {
  taskKind: "bash";
};

export function parseDuckyBackgroundBashJobs(value: unknown): DuckyBackgroundBashJob[] {
  return parseDuckyBackgroundTaskControlItems(value).filter(isBackgroundBashJob);
}

export function isActiveDuckyBackgroundBashJob(job: DuckyBackgroundBashJob): boolean {
  return isActiveDuckyBackgroundTaskControlItem(job);
}

export function getDuckyBackgroundBashJobElapsedMs(
  job: DuckyBackgroundBashJob,
  now = Date.now(),
): number {
  return getDuckyBackgroundTaskControlItemElapsedMs(job, now);
}

export function collectVisibleDuckyBackgroundBashJobs(
  jobs: readonly DuckyBackgroundBashJob[],
  now = Date.now(),
  thresholdMs = 30_000,
): Array<DuckyBackgroundBashJob & { elapsedMs: number }> {
  return collectVisibleDuckyBackgroundTaskControlItems(jobs, now, thresholdMs) as Array<
    DuckyBackgroundBashJob & { elapsedMs: number }
  >;
}

function isBackgroundBashJob(job: DuckyBackgroundTaskControlItem): job is DuckyBackgroundBashJob {
  return job.taskKind === "bash";
}
