import { useEffect, useState } from "react";
import { startVisibleSecondTicker } from "@/components/workflow-graph/use-now-ticker.js";

export function useRunningBackgroundTaskElapsedClock(runningTaskCount: number) {
  const [now, setNow] = useState(() => Date.now());
  const hasRunningTasks = runningTaskCount > 0;

  useEffect(() => {
    if (!hasRunningTasks) {
      return;
    }

    // 单个任务完成不应重启整组计时器，否则剩余任务的秒数会短暂停顿后跳变。
    // 后台标签页跳过 tick（可见时行为不变），避免弱机上隐藏窗口每秒唤醒。
    return startVisibleSecondTicker(() => {
      setNow(Date.now());
    });
  }, [hasRunningTasks]);

  return now;
}
