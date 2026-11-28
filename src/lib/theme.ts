"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_PALETTE,
  PALETTE_STORAGE_KEY,
  isPalette,
  type Palette,
} from "@/lib/palettes";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "cova-theme";

const CHANGE_EVENT = "cova-theme-change";
const PALETTE_EVENT = "cova-palette-change";

export type { Palette };
export { PALETTE_STORAGE_KEY, DEFAULT_PALETTE };

/** The theme currently applied to <html> (set before paint by the head script). */
export function getAppliedTheme(): Theme {
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

/* ---------------------------------------------------------------- text size */

export type TextSize = "small" | "medium" | "large";

export const TEXT_SIZE_STORAGE_KEY = "cova-text-size";

/** Applies the choice globally: rem-based utilities scale with the root size. */
export function applyTextSize(size: TextSize): void {
  if (size === "medium") delete document.documentElement.dataset.textSize;
  else document.documentElement.dataset.textSize = size;
  try {
    localStorage.setItem(TEXT_SIZE_STORAGE_KEY, size);
  } catch {
    // Private mode: the choice just won't survive the next visit.
  }
}

export function getStoredTextSize(): TextSize {
  try {
    const stored = localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
    if (stored === "small" || stored === "large") return stored;
  } catch {
    // Ignore.
  }
  return "medium";
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

/* ------------------------------------------------------------------ palette */

/** The palette currently applied to <html> (set before paint by the head script). */
export function getAppliedPalette(): Palette {
  const value = document.documentElement.dataset.palette;
  return isPalette(value) ? value : DEFAULT_PALETTE;
}

export function getStoredPalette(): Palette {
  try {
    const stored = localStorage.getItem(PALETTE_STORAGE_KEY);
    if (isPalette(stored)) return stored;
  } catch {
    // Ignore.
  }
  return DEFAULT_PALETTE;
}

/** Applies the palette globally (html[data-palette]) and remembers the choice. */
export function applyPalette(palette: Palette): void {
  document.documentElement.dataset.palette = palette;
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, palette);
  } catch {
    // Private mode: the choice just won't survive the next visit.
  }
  window.dispatchEvent(new Event(PALETTE_EVENT));
}

function subscribePalette(onChange: () => void): () => void {
  window.addEventListener(PALETTE_EVENT, onChange);
  return () => window.removeEventListener(PALETTE_EVENT, onChange);
}

function getPaletteSnapshot(): Palette {
  return getAppliedPalette();
}

function getPaletteServerSnapshot(): Palette {
  return DEFAULT_PALETTE;
}

/**
 * Current palette, synced across every picker on the page. The pre-hydration
 * script (src/app/layout.tsx) applies the saved palette before first paint;
 * the choice is remembered in localStorage and (for signed-in users) in
 * Supabase user_settings so every device converges on the same look.
 */
export function usePalette() {
  const palette = useSyncExternalStore(subscribePalette, getPaletteSnapshot, getPaletteServerSnapshot);

  const setPalette = useCallback((next: Palette) => {
    applyPalette(next);
  }, []);

  return { palette, setPalette };
}
