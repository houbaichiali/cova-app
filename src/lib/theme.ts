"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "cova-theme";

const CHANGE_EVENT = "cova-theme-change";

/** The theme currently applied to <html> (set before paint by the head script). */
function getAppliedTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode: the choice just won't survive the next visit.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

function getClientSnapshot(): Theme {
  return getAppliedTheme();
}

function getServerSnapshot(): Theme {
  return "light";
}

/**
 * Current theme, synced across every toggle on the page. The pre-hydration
 * script (src/app/layout.tsx) applies the saved theme (or the system
 * preference) before first paint; the choice is remembered in localStorage.
 */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
  }, []);

  const toggle = useCallback(() => {
    applyTheme(getAppliedTheme() === "dark" ? "light" : "dark");
  }, []);

  return { theme, setTheme, toggle };
}
