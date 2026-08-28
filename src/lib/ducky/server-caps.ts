/**
 * Client-side mirror of "this deployment has server-side credentials".
 *
 * The browser can't read env vars, so the app probes GET /api/config once on
 * mount. When the server reports no credentials, the composer shows a
 * "model not configured" state instead of attempting live runs.
 */

let serverLive = false;

/** Update the flag; returns true when the value changed (so UI can refresh). */
export function setServerLive(live: boolean): boolean {
  const changed = serverLive !== live;
  serverLive = live;
  return changed;
}

export function isServerLive(): boolean {
  return serverLive;
}
