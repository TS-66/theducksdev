/**
 * Client-side mirror of "this deployment has server-side credentials".
 *
 * The browser can't read env vars, so the app probes GET /api/config once on
 * mount. Results live BOTH in module flags (imperative reads, e.g. the send
 * guard) and in the zustand store (reactive UI chips in the status bar).
 */

import { useDuckyStore } from "@/lib/ducky/store";

let serverLive = false;
let modelIdSet = false;
let provider: string | null = null;

/** Update the live flag; returns true when the value changed (so UI can refresh). */
export function setServerLive(live: boolean): boolean {
  const changed = serverLive !== live;
  serverLive = live;
  useDuckyStore.setState({ serverLive: live });
  return changed;
}

export function isServerLive(): boolean {
  return serverLive;
}

/** Whether the deployment configured AI_MODEL_ID (upstream model id). */
export function setModelIdSet(set: boolean): boolean {
  const changed = modelIdSet !== set;
  modelIdSet = set;
  useDuckyStore.setState({ modelIdSet: set });
  return changed;
}

export function isModelIdSet(): boolean {
  return modelIdSet;
}

/** Server provider label ("nvidia") — display only, never a secret. */
export function setProvider(p: string | null): void {
  provider = p;
  useDuckyStore.setState({ provider: p });
}

export function getProvider(): string | null {
  return provider;
}
