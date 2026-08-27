/**
 * Client-side mirror of "this deployment has server-side credentials".
 *
 * The browser can't read env vars, so the app probes GET /api/config once on
 * mount. Until (and unless) the server reports credentials, an empty Settings
 * key means the scripted demo engine runs.
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
