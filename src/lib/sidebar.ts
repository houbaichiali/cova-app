"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "cova-sidebar-change";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

/**
 * Desktop sidebar preference (collapsed rail ↔ expanded push panel),
 * persisted per shell in localStorage and synced across every toggle on the
 * page. The server snapshot is the resting look (collapsed for the student
 * shell); the stored choice applies right after hydration.
 */
export function useSidebarPreference(storageKey: string, defaultCollapsed = true) {
  const collapsed = useSyncExternalStore(
    subscribe,
    () => {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored === "expanded") return false;
        if (stored === "collapsed") return true;
      } catch {
        // Private mode: fall through to the default.
      }
      return defaultCollapsed;
    },
    () => defaultCollapsed,
  );

  const toggle = useCallback(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      const current = stored === "expanded" ? false : stored === "collapsed" ? true : defaultCollapsed;
      localStorage.setItem(storageKey, current ? "expanded" : "collapsed");
    } catch {
      // Private mode: the choice just won't survive the next visit.
    }
    window.dispatchEvent(new Event(EVENT));
  }, [storageKey, defaultCollapsed]);

  return { collapsed, toggle };
}
