"use client";

import { getSupabase } from "@/lib/supabase/client";
import { fail, ok } from "@/lib/result";
import type { ActionResult } from "@/types/social";
import { validateOptionalText, validateText } from "@/lib/validation";

/**
 * Extended profile details (spec Phases 6 & 7): personal information, social
 * links and the per-field privacy configuration. The owner writes through
 * owner-only RLS; everyone else reads ONLY through the
 * profile_details_visible RPC, which applies each field's audience
 * (everyone / members / friends / me) using the real friendship graph.
 */

export type PrivacyAudience = "everyone" | "members" | "friends" | "me";

export const AUDIENCES: PrivacyAudience[] = ["everyone", "members", "friends", "me"];

export type SocialPlatform = "instagram" | "facebook" | "x" | "linkedin" | "github" | "discord";

export const SOCIAL_PLATFORMS: SocialPlatform[] = ["instagram", "facebook", "x", "linkedin", "github", "discord"];

export interface PrivateDetails {
  firstName: string;
  lastName: string;
  /** 'male' | 'female' | null — optional, never exposed automatically. */
  gender: "male" | "female" | null;
  university: string;
  education: string;
}

export interface SocialLink {
  id?: string;
  platform: SocialPlatform;
  value: string;
  position: number;
  visibility: PrivacyAudience;
}

export interface FieldVisibilityConfig {
  field: "first_name" | "last_name" | "gender" | "university" | "education";
  audience: PrivacyAudience;
}

export const EMPTY_DETAILS: PrivateDetails = {
  firstName: "",
  lastName: "",
  gender: null,
  university: "",
  education: "",
};

const EMPTY = "";
function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function useMyProfileDetails() {
  /** Owner read (RLS owner-only policy); missing row = empty defaults. */
  async function load(): Promise<ActionResult<{ details: PrivateDetails; links: SocialLink[]; visibility: FieldVisibilityConfig[] }>> {
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return fail("Sign in to edit your profile.");

    const [detailsResult, linksResult, visibilityResult] = await Promise.all([
      supabase.from("profile_private_details").select("*").eq("user_id", auth.user.id).maybeSingle(),
      supabase.from("profile_social_links").select("*").eq("user_id", auth.user.id).order("position"),
      supabase.from("profile_field_visibility").select("*").eq("user_id", auth.user.id),
    ]);

    const row = detailsResult.data as Record<string, string | null> | null;
    const details: PrivateDetails = row
      ? {
          firstName: row.first_name ?? EMPTY,
          lastName: row.last_name ?? EMPTY,
          gender: (row.gender as PrivateDetails["gender"] | null) ?? null,
          university: row.university ?? EMPTY,
          education: row.education ?? EMPTY,
        }
      : { ...EMPTY_DETAILS };

    const links = ((linksResult.data ?? []) as Array<Record<string, unknown>>).map((item) => ({
      id: item.id as string,
      platform: item.platform as SocialPlatform,
      value: item.value as string,
      position: item.position as number,
      visibility: item.visibility as PrivacyAudience,
    }));

    const visibility = ((visibilityResult.data ?? []) as Array<Record<string, unknown>>).map((item) => ({
      field: item.field as FieldVisibilityConfig["field"],
      audience: item.audience as PrivacyAudience,
    }));

    return ok({ details, links, visibility });
  }

  /** Validates then upserts the private details (spec 3.1 limits). */
  async function save(details: PrivateDetails): Promise<ActionResult> {
    const checks: Array<[string, ReturnType<typeof validateOptionalText>]> = [
      ["first_name", validateOptionalText("firstName", details.firstName)],
      ["last_name", validateOptionalText("lastName", details.lastName)],
      ["university", validateOptionalText("title", details.university)],
      ["education", validateOptionalText("shortDescription", details.education)],
    ];
    for (const [field, check] of checks) {
      if (!check.ok) return fail(`${field}: ${check.error.key}`);
    }
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return fail("Sign in to edit your profile.");
    const { error } = await supabase.from("profile_private_details").upsert({
      user_id: auth.user.id,
      first_name: emptyToNull(details.firstName),
      last_name: emptyToNull(details.lastName),
      gender: details.gender,
      university: emptyToNull(details.university),
      education: emptyToNull(details.education),
      updated_at: new Date().toISOString(),
    });
    if (error) return fail(error.message);
    return ok(undefined);
  }

  /** One audience per identity field (spec Phase 7). */
  async function saveVisibility(config: FieldVisibilityConfig[]): Promise<ActionResult> {
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return fail("Sign in to edit your profile.");
    const { error } = await supabase
      .from("profile_field_visibility")
      .upsert(
        config.map((item) => ({ user_id: auth.user!.id, field: item.field, audience: item.audience })),
      );
    if (error) return fail(error.message);
    return ok(undefined);
  }

  /** Adds or replaces one social link (validated: HTTPS URL or @username). */
  async function saveLink(link: SocialLink): Promise<ActionResult> {
    if (!SOCIAL_PLATFORMS.includes(link.platform)) return fail("Unknown platform.");
    const check = validateText("title", link.value);
    if (!check.ok) return fail(check.error.key);
    if (link.value.length > 200) return fail("validation.shortDesc.max");
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return fail("Sign in to edit your profile.");
    const { error } = await supabase.from("profile_social_links").upsert(
      {
        user_id: auth.user.id,
        platform: link.platform,
        value: link.value.trim(),
        position: link.position,
        visibility: link.visibility,
      },
      { onConflict: "user_id,platform" },
    );
    if (error) return fail(error.message);
    return ok(undefined);
  }

  async function removeLink(platform: SocialPlatform): Promise<ActionResult> {
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return fail("Sign in to edit your profile.");
    const { error } = await supabase
      .from("profile_social_links")
      .delete()
      .eq("user_id", auth.user.id)
      .eq("platform", platform);
    if (error) return fail(error.message);
    return ok(undefined);
  }

  /** Reorders by writing the new position per platform. */
  async function reorderLinks(order: SocialPlatform[]): Promise<ActionResult> {
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return fail("Sign in to edit your profile.");
    for (let index = 0; index < order.length; index++) {
      const { error } = await supabase
        .from("profile_social_links")
        .update({ position: index })
        .eq("user_id", auth.user.id)
        .eq("platform", order[index]);
      if (error) return fail(error.message);
    }
    return ok(undefined);
  }

  return { load, save, saveVisibility, saveLink, removeLink, reorderLinks };
}

/** Public read: the ONLY door — each field arrives only if its audience
 * allows the caller (server-enforced by the security-definer RPC). */
export async function fetchPublicDetails(
  code: string,
): Promise<ActionResult<{ found: boolean; firstName?: string | null; lastName?: string | null; gender?: string | null; university?: string | null; education?: string | null; social?: Array<{ platform: string; value: string; position: number }> }>> {
  const { data, error } = await getSupabase().rpc("profile_details_visible", { p_code: code });
  if (error) return fail(error.message);
  return ok(data as { found: boolean } & Record<string, unknown> as never);
}
