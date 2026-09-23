import * as React from "react"

const MOBILE_BREAKPOINT = 768

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function snapshot(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT
}

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, snapshot, () => false)
}
