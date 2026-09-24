import type { DuckyBackgroundTaskControlItem } from "./background-task-controls.js";

export function mergeDuckyBackgroundTaskControlItems(
  current: readonly DuckyBackgroundTaskControlItem[],
  updates: readonly DuckyBackgroundTaskControlItem[],
): DuckyBackgroundTaskControlItem[] {
  const jobsById = new Map(current.map((job) => [job.jobId, job] as const));
  for (const job of updates) {
    jobsById.set(job.jobId, job);
  }
  return Array.from(jobsById.values());
}
