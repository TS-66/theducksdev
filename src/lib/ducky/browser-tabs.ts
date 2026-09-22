/**
 * Ducky AI | Coder — in-app browser tabs (browser-use, agent-drivable).
 *
 * The agent opens real pages in the IDE's browser panel (`browser_open`),
 * reads their text through the server proxy (`browser_snapshot`), and
 * manages tabs (`browser_tabs`, `browser_close`). DOM-free registry with a
 * React subscription so the panel updates live. Text extraction itself goes
 * through ctx.webFetch — no new network plumbing needed.
 */

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  openedAt: number;
}

const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `tab_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

function titleFor(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") + (u.pathname !== "/" ? u.pathname.slice(0, 28) : "");
  } catch {
    return url.slice(0, 40);
  }
}

const tabs = new Map<string, BrowserTab>();
let activeId: string | null = null;
let revision = 0;
const listeners = new Set<() => void>();

function emit(): void {
  revision++;
  for (const l of [...listeners]) {
    try {
      l();
    } catch {
      // UI listeners must never break the registry
    }
  }
}

function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (!t) throw new Error("browser_open: url must be non-empty");
  if (!/^https?:\/\//i.test(t)) throw new Error("browser_open: url must be an absolute http(s) URL");
  return t;
}

/** Open a URL in the IDE browser panel. Returns the tab. */
export function openTab(rawUrl: string): BrowserTab {
  const url = normalizeUrl(rawUrl);
  const tab: BrowserTab = { id: uid(), url, title: titleFor(url), openedAt: Date.now() };
  tabs.set(tab.id, tab);
  activeId = tab.id;
  emit();
  return tab;
}

/** Close a tab by id (prefix match allowed). Returns true when removed. */
export function closeTab(idPrefix: string): boolean {
  const hit = [...tabs.values()].find((t) => t.id.startsWith(idPrefix));
  if (!hit) return false;
  tabs.delete(hit.id);
  if (activeId === hit.id) activeId = [...tabs.keys()].pop() ?? null;
  emit();
  return true;
}

export function listTabs(): BrowserTab[] {
  return [...tabs.values()].sort((a, b) => a.openedAt - b.openedAt);
}

export function getActiveTab(): BrowserTab | null {
  if (!activeId) return null;
  return tabs.get(activeId) ?? null;
}

export function setActiveTab(idPrefix: string): BrowserTab | null {
  const hit = [...tabs.values()].find((t) => t.id.startsWith(idPrefix)) ?? null;
  if (hit) {
    activeId = hit.id;
    emit();
  }
  return hit;
}

/** React subscription (useSyncExternalStore). */
export function subscribeTabs(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getTabsRevision(): number {
  return revision;
}

/** Test helper: reset registry. */
export function __resetTabs(): void {
  tabs.clear();
  activeId = null;
  emit();
}
