import { useEffect, useState } from "react";

/** 倒计时的自然粒度：秒级文案再快一格文字也不会变。 */
export const NOW_TICKER_INTERVAL_MS = 1_000;

/**
 * 后台标签页跳过 tick，返回可见时补一次，避免弱机上隐藏窗口的秒级时钟空转唤醒。
 * 可见时行为与普通 setInterval 完全一致；返回清理函数。
 */
export function startVisibleSecondTicker(tick: () => void, intervalMs: number = NOW_TICKER_INTERVAL_MS): () => void {
  const timer = setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    tick();
  }, intervalMs);
  const resync = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") tick();
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", resync);
  }
  return () => {
    clearInterval(timer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", resync);
    }
  };
}

/**
 * 一个只在 `active` 时走的"现在"（后台标签页跳过 tick，见 startVisibleSecondTicker 的实现注释）。
 *
 * 为什么不靠投影更新顺手重算：一个在退避等待 provider 的 ask **恰恰不发事件**，靠事件驱动的
 * 读数会一直停在收到那一刻的秒数。定时器只在有倒计时可显示时存在；`active` 一变真先重取一次
 * "现在"，不带着上一段的偏差起步。
 */
export function useNowTicker(active: boolean, intervalMs: number = NOW_TICKER_INTERVAL_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    return startVisibleSecondTicker(() => setNow(Date.now()), intervalMs);
  }, [active, intervalMs]);
  return now;
}
