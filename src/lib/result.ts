import type { ActionResult } from "@/types/social";
import type { FileIssue } from "@/lib/file-policy";

export function ok<T>(value: T): ActionResult<T> {
  return { ok: true, value };
}

export function fail<T = undefined>(error: string, issue?: FileIssue): ActionResult<T> {
  return issue ? { ok: false, error, issue } : { ok: false, error };
}
