import { useRef } from "react";
import {
  getDuckyBackgroundTaskControlItemElapsedMs,
  type DuckyBackgroundTaskControlItem,
} from "@ducky/shared";
import { cn } from "@/components/lib/utils.js";
import { useDuckyIntl } from "@/i18n/IntlProvider.js";

export function formatBackgroundTaskElapsedLabel(
  elapsedMs: number,
  formatMessage: ReturnType<typeof useDuckyIntl>["intl"]["formatMessage"],
) {
  const totalSeconds = Math.max(1, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return formatMessage(
      { id: "chat.longRunning.elapsedMinutesSeconds" },
      { minutes: String(minutes), seconds: String(seconds) },
    );
  }

  return formatMessage(
    { id: "chat.longRunning.elapsedSeconds" },
    { seconds: String(totalSeconds) },
  );
}

function createElapsedBaseline(job: DuckyBackgroundTaskControlItem) {
  const mountedAt = Date.now();
  return {
    elapsedMs: getDuckyBackgroundTaskControlItemElapsedMs(job, mountedAt),
    key: `${job.jobId}:${job.startedAt ?? "no-start"}:${job.elapsedMs ?? "no-elapsed"}`,
    mountedAt,
  };
}

function elapsedMsForClock(input: {
  baseline: ReturnType<typeof createElapsedBaseline>;
  job: DuckyBackgroundTaskControlItem;
  now: number;
}) {
  const elapsedFromJob = getDuckyBackgroundTaskControlItemElapsedMs(input.job, input.now);
  const elapsedFromBaseline =
    input.baseline.elapsedMs + Math.max(0, input.now - input.baseline.mountedAt);
  return Math.max(elapsedFromJob, elapsedFromBaseline);
}

export function BackgroundTaskElapsedLabel({
  className,
  job,
  now = Date.now(),
}: {
  className?: string;
  job: DuckyBackgroundTaskControlItem;
  now?: number;
}) {
  const { intl } = useDuckyIntl();
  const baselineRef = useRef<ReturnType<typeof createElapsedBaseline> | null>(null);
  const baselineKey = `${job.jobId}:${job.startedAt ?? "no-start"}:${job.elapsedMs ?? "no-elapsed"}`;
  if (!baselineRef.current || baselineRef.current.key !== baselineKey) {
    baselineRef.current = createElapsedBaseline(job);
  }
  const baseline = baselineRef.current;

  return (
    <span className={cn("shrink-0 tabular-nums text-foreground-subtle", className)}>
      {formatBackgroundTaskElapsedLabel(
        elapsedMsForClock({
          baseline,
          job,
          now,
        }),
        intl.formatMessage,
      )}
    </span>
  );
}
