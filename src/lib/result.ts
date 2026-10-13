import type { ActionResult } from "@/types/social";

export function ok<T>(value: T): ActionResult<T> {
  return { ok: true, value };
}

export function fail<T = undefined>(error: string): ActionResult<T> {
  return { ok: false, error };
}
