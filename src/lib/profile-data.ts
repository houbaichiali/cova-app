"use client";

import { useCallback, useEffect, useState } from "react";

import { fail, ok } from "@/lib/result";

import type { ActionResult } from "@/types/social";

import { getSupabase } from "@/lib/supabase/client";
import {
  DEFAULT_APPEARANCE,
  resolveAppearance,
  type Appearance,
} from "@/lib/appearance";

/**
 * Client data layer for the Profile & Portfolio enhancement.
 *
 * Privacy model reminder: non-owners never read the new tables directly —
 * they go through the security-definer RPCs below, which apply the owner's
 * per-section visibility. Own rows are read/written directly (owner-only RLS).
 */

export interface PublicProfileData {
  profile: {
    id: string;
    user_code: string;
    display_name: string;
    headline: string;
    bio: string;
    domain: string;
    prog_languages: string[] | null;
    spoken_languages: string[] | null;
    avatar_url: string | null;
    location: string | null;
    joined: string;
    xp: number | null;
  };
  appearance: Appearance;
  sections: Record<string, boolean>;
}

export async function fetchPublicProfile(
  code: string,
): Promise<PublicProfileData | null> {
  const { data, error } = await getSupabase().rpc("profile_public_overview", {
    p_code: code,
  });
  if (error) throw error;
  if (!data) return null;
  const raw = data as {
    profile: Omit<PublicProfileData["profile"], "xp"> & { xp?: number | null };
    appearance: unknown;
    sections: Record<string, boolean>;
  };
  if (!raw.sections?.identity) return null;
  return {
    profile: { ...raw.profile, xp: raw.profile.xp ?? null },
    appearance: resolveAppearance(raw.appearance),
    sections: raw.sections,
  };
}

export type ProfileSection =
  | "stats"
  | "badges"
  | "groups"
  | "subjects"
  | "goals"
  | "skills"
  | "projects"
  | "journey"
  | "certificates"
  | "achievements";

export async function fetchSectionData(
  code: string,
  section: ProfileSection,
): Promise<unknown | null> {
  const { data, error } = await getSupabase().rpc("profile_section_data", {
    p_code: code,
    p_section: section,
  });
  if (error) throw error;
  return data ?? null;
}

export interface LearningStats {
  lessons_completed: number;
  minutes_estimated: number;
  courses_enrolled: number;
  courses_completed: number;
  quizzes_finished: number;
  xp: number;
  level: number;
  streak_days: number | null;
  badges_count: number;
}

export interface EarnedBadge {
  badge_key: string;
  name: string;
  description: string;
  rarity: string;
  category: string;
  image_url: string | null;
  awarded_at: string;
  recipient_number: number | null;
  pinned: boolean;
}

export interface GoalItem {
  id: string;
  title: string;
  description: string;
  target_date: string | null;
  progress: number;
  status: "active" | "achieved" | "archived";
}

export interface JourneyEvent {
  kind: "joined" | "badge" | "lesson" | "milestone" | "certificate";
  ref: string | null;
  day: string;
  extra: string | null;
}

export async function fetchPortfolioOverview(code: string): Promise<{
  visible: boolean;
  owner?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  skills?: PortfolioSkillRow[];
  projects?: PortfolioProjectRow[];
  imports?: PortfolioImportRow[];
  certificates?: PortfolioCertificateRow[];
  badges?: EarnedBadge[];
  journey?: JourneyEvent[];
} | null> {
  const { data, error } = await getSupabase().rpc("portfolio_public_overview", {
    p_code: code,
  });
  if (error) throw error;
  return (data as never) ?? null;
}

/* ------------------------------------------------------------------ own rows */

export interface PrivacySettings {
  show_xp: "public" | "friends" | "private";
  show_badges: "public" | "friends" | "private";
  show_stats: "public" | "friends" | "private";
  show_groups: "public" | "friends" | "private";
  show_subjects: "public" | "friends" | "private";
  show_goals: "public" | "friends" | "private";
  show_skills: "public" | "friends" | "private";
  show_projects: "public" | "friends" | "private";
  show_achievements: "public" | "friends" | "private";
  show_journey: "public" | "friends" | "private";
  show_certificates: "public" | "friends" | "private";
  portfolio_visibility: "public" | "friends" | "private";
}

export const PRIVACY_KEYS = [
  "show_xp",
  "show_badges",
  "show_stats",
  "show_groups",
  "show_subjects",
  "show_goals",
  "show_skills",
  "show_projects",
  "show_achievements",
  "show_journey",
  "show_certificates",
  "portfolio_visibility",
] as const;

export const DEFAULT_PRIVACY: PrivacySettings = {
  show_xp: "public",
  show_badges: "public",
  show_stats: "public",
  show_groups: "public",
  show_subjects: "public",
  show_goals: "public",
  show_skills: "public",
  show_projects: "public",
  show_achievements: "public",
  show_journey: "public",
  show_certificates: "public",
  portfolio_visibility: "public",
};

export function useMyProfileWorkspace() {
  const [userCode, setUserCode] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [appearance, setAppearance] = useState<Appearance | null>(null);
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const supabase = getSupabase();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return;
        const [profileRes, appearanceRes, privacyRes, subjectsRes, goalsRes] =
          await Promise.all([
            supabase.from("profiles").select("user_code,location").eq("id", auth.user.id).maybeSingle(),
            supabase.from("profile_appearance").select("*").eq("user_id", auth.user.id).maybeSingle(),
            supabase.from("profile_privacy").select("*").eq("user_id", auth.user.id).maybeSingle(),
            supabase.from("profile_subjects").select("name").eq("user_id", auth.user.id).order("position"),
            supabase
              .from("profile_goals")
              .select("id,title,description,target_date,progress,status")
              .eq("user_id", auth.user.id)
              .order("position"),
          ]);
        if (!active) return;
        const profile = profileRes.data as { user_code: string | null; location: string | null } | null;
        setUserCode(profile?.user_code ?? null);
        setLocation(profile?.location ?? "");
        setAppearance(
          appearanceRes.data ? resolveAppearance(appearanceRes.data) : { ...DEFAULT_APPEARANCE },
        );
        setPrivacy(
          privacyRes.data
            ? ({ ...DEFAULT_PRIVACY, ...(privacyRes.data as object) } as PrivacySettings)
            : { ...DEFAULT_PRIVACY },
        );
        setSubjects((subjectsRes.data ?? []).map((row) => (row as { name: string }).name));
        setGoals((goalsRes.data ?? []) as GoalItem[]);
      } catch (error) {
        console.error("Unable to load the profile workspace:", error);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const saveAppearance = useCallback(async (values: Partial<Appearance>): Promise<ActionResult> => {
    const { error } = await getSupabase().rpc("update_my_appearance", { p: values });
    if (error) return fail(error.message);
    setAppearance((current) => ({ ...(current ?? DEFAULT_APPEARANCE), ...values }));
    return ok(undefined);
  }, []);

  const savePrivacy = useCallback(async (values: PrivacySettings): Promise<ActionResult> => {
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return fail("Sign in first.");
    const payload = Object.fromEntries(
      PRIVACY_KEYS.map((key) => [key, values[key]]),
    );
    const { error } = await supabase
      .from("profile_privacy")
      .upsert({ user_id: auth.user.id, ...payload });
    if (error) return fail(error.message);
    setPrivacy(values);
    return ok(undefined);
  }, []);

  const saveLocation = useCallback(async (value: string): Promise<ActionResult> => {
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return fail("Sign in first.");
    const { error } = await supabase
      .from("profiles")
      .update({ location: value.trim().slice(0, 80) })
      .eq("id", auth.user.id);
    if (error) return fail(error.message);
    setLocation(value.trim().slice(0, 80));
    return ok(undefined);
  }, []);

  const setSubjectsPersisted = useCallback(async (next: string[]): Promise<ActionResult> => {
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return fail("Sign in first.");
    const { error: delError } = await supabase
      .from("profile_subjects")
      .delete()
      .eq("user_id", auth.user.id);
    if (delError) return fail(delError.message);
    if (next.length > 0) {
      const { error } = await supabase.from("profile_subjects").insert(
        next.slice(0, 12).map((name, position) => ({ user_id: auth.user.id, name, position })),
      );
      if (error) return fail(error.message);
    }
    setSubjects(next.slice(0, 12));
    return ok(undefined);
  }, []);

  const upsertGoal = useCallback(async (goal: Omit<GoalItem, "id"> & { id?: string }): Promise<ActionResult> => {
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return fail("Sign in first.");
    const row = {
      user_id: auth.user.id,
      title: goal.title.trim().slice(0, 100),
      description: goal.description.trim().slice(0, 400),
      target_date: goal.target_date || null,
      progress: Math.max(0, Math.min(100, Math.round(goal.progress))),
      status: goal.status,
    };
    const { error } = goal.id
      ? await supabase.from("profile_goals").update(row).eq("id", goal.id)
      : await supabase.from("profile_goals").insert(row);
    if (error) return fail(error.message);
    const { data } = await supabase
      .from("profile_goals")
      .select("id,title,description,target_date,progress,status")
      .eq("user_id", auth.user.id)
      .order("position");
    setGoals((data ?? []) as GoalItem[]);
    return ok(undefined);
  }, []);

  const deleteGoal = useCallback(async (id: string): Promise<ActionResult> => {
    const { error } = await getSupabase().from("profile_goals").delete().eq("id", id);
    if (error) return fail(error.message);
    setGoals((current) => current.filter((goal) => goal.id !== id));
    return ok(undefined);
  }, []);

  return {
    userCode,
    location,
    appearance,
    privacy,
    subjects,
    goals,
    loading,
    setAppearance,
    saveAppearance,
    savePrivacy,
    saveLocation,
    setSubjectsPersisted,
    upsertGoal,
    deleteGoal,
  };
}

/* ------------------------------------------------------------------ portfolio */

export interface PortfolioSkillRow {
  id: string;
  name: string;
  category: string;
  highlight: boolean;
  verification_status: "self_declared" | "cova_verified";
}

export interface PortfolioProjectRow {
  id: string;
  title: string;
  short_description: string;
  full_description: string;
  cover_image_url: string | null;
  gallery: { url: string }[];
  category: string;
  project_type: "academic" | "personal" | "professional";
  tools: string[];
  skills: string[];
  project_date: string | null;
  github_url: string | null;
  demo_url: string | null;
  external_url: string | null;
  contributors: string[];
  featured: boolean;
  status: "draft" | "published";
  visibility: "public" | "friends" | "private";
  position?: number;
  source?: "manual" | "cova";
}

export interface PortfolioImportRow {
  id: string;
  source_kind: "assignment" | "challenge";
  source_id: string;
  note: string;
  featured: boolean;
  title: string;
  date: string | null;
  extra: Record<string, unknown>;
}

export interface PortfolioCertificateRow {
  id: string;
  kind: "upload" | "external" | "cova";
  title: string;
  issuer: string;
  issue_date: string | null;
  description: string;
  verification_status: "unverified" | "external_claim" | "cova_issued";
  visibility?: "public" | "friends" | "private";
  has_file: boolean;
  /** Storage object name — only present for viewers allowed to open it. */
  file_path?: string | null;
}

export interface PortfolioSettings {
  mode: "academic" | "professional" | "hybrid";
  about_intro: string;
  about_academic: string;
  about_career: string;
  expertise: string[];
  external_links: { label: string; url: string }[];
  pdf_sections: string[];
  pdf_template: "classic" | "modern";
  pdf_photo: boolean;
}

export const DEFAULT_PORTFOLIO_SETTINGS: PortfolioSettings = {
  mode: "academic",
  about_intro: "",
  about_academic: "",
  about_career: "",
  expertise: [],
  external_links: [],
  pdf_sections: ["about", "skills", "projects", "achievements", "journey", "certificates"],
  pdf_template: "classic",
  pdf_photo: true,
};

const COVER_BUCKET = "profile-covers";
const DOC_BUCKET = "portfolio-documents";
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const DOC_MAX_BYTES = 10 * 1024 * 1024;

export function useMyPortfolio() {
  const [settings, setSettings] = useState<PortfolioSettings | null>(null);
  const [skills, setSkills] = useState<PortfolioSkillRow[]>([]);
  const [projects, setProjects] = useState<PortfolioProjectRow[]>([]);
  const [imports, setImports] = useState<PortfolioImportRow[]>([]);
  const [certificates, setCertificates] = useState<PortfolioCertificateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const [settingsRes, skillsRes, projectsRes, importsRes, certsRes] = await Promise.all([
      supabase.from("portfolio_settings").select("*").eq("user_id", auth.user.id).maybeSingle(),
      supabase.from("portfolio_skills").select("*").eq("user_id", auth.user.id).order("position"),
      supabase.from("portfolio_projects").select("*").eq("user_id", auth.user.id).order("position"),
      supabase.from("portfolio_imports").select("*").eq("user_id", auth.user.id).order("position"),
      supabase.from("portfolio_certificates").select("*").eq("user_id", auth.user.id).order("created_at", { ascending: false }),
    ]);
    const s = settingsRes.data as Record<string, unknown> | null;
    setSettings(
      s
        ? {
            mode: (s.mode as PortfolioSettings["mode"]) ?? "academic",
            about_intro: (s.about_intro as string) ?? "",
            about_academic: (s.about_academic as string) ?? "",
            about_career: (s.about_career as string) ?? "",
            expertise: (s.expertise as string[]) ?? [],
            external_links: (s.external_links as { label: string; url: string }[]) ?? [],
            pdf_sections: (s.pdf_sections as string[]) ?? DEFAULT_PORTFOLIO_SETTINGS.pdf_sections,
            pdf_template: (s.pdf_template as PortfolioSettings["pdf_template"]) ?? "classic",
            pdf_photo: s.pdf_photo !== false,
          }
        : { ...DEFAULT_PORTFOLIO_SETTINGS },
    );
    setSkills((skillsRes.data ?? []) as PortfolioSkillRow[]);
    setProjects(
      ((projectsRes.data ?? []) as PortfolioProjectRow[]).map((p) => ({
        ...p,
        gallery: Array.isArray(p.gallery) ? p.gallery : [],
      })),
    );
    setImports(
      ((importsRes.data ?? []) as PortfolioImportRow[]).map((row) => ({
        ...row,
        title: "",
        date: null,
        extra: {},
      })),
    );
    setCertificates((certsRes.data ?? []) as PortfolioCertificateRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount into component state
    void reload();
  }, [reload]);

  // Imported rows only store the reference; resolve titles from the RPC that
  // joins the original records (authenticity preserved).
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await getSupabase().rpc("portfolio_import_options");
      if (error || !active) return;
      const options = data as {
        assignments: { source_id: string; title: string; submitted_at: string }[];
        challenges: { source_id: string; title: string; submitted_at: string }[];
      };
      setImports((current) =>
        current.map((row) => {
          const source = (row.source_kind === "assignment" ? options.assignments : options.challenges)
            ?.find((o) => o.source_id === row.source_id);
          return source
            ? { ...row, title: source.title, date: source.submitted_at }
            : { ...row, title: row.source_kind === "assignment" ? "Assignment" : "Challenge" };
        }),
      );
    })();
    return () => {
      active = false;
    };
  }, [imports.length]);

  const saveSettings = useCallback(async (values: PortfolioSettings): Promise<ActionResult> => {
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return fail("Sign in first.");
    const { error } = await supabase
      .from("portfolio_settings")
      .upsert({ user_id: auth.user.id, ...values });
    if (error) return fail(error.message);
    setSettings(values);
    return ok(undefined);
  }, []);

  const uploadImage = useCallback(
    async (bucket: typeof COVER_BUCKET, file: File): Promise<ActionResult<string>> => {
      const supabase = getSupabase();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return fail("Sign in first.");
      if (file.size > IMAGE_MAX_BYTES) return fail("Images must be 4 MB or smaller.");
      if (!/^image\/(png|jpeg|webp)$/.test(file.type))
        return fail("Images must be PNG, JPG or WebP.");
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${auth.user.id}/cover-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) return fail(error.message);
      return ok(supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl);
    },
    [],
  );

  const uploadDocument = useCallback(async (file: File): Promise<ActionResult<string>> => {
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return fail("Sign in first.");
    if (file.size > DOC_MAX_BYTES) return fail("Documents must be 10 MB or smaller.");
    if (!/^(application\/pdf|image\/(png|jpeg|webp))$/.test(file.type))
      return fail("Documents must be a PDF or an image (PNG, JPG, WebP).");
    const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
    const path = `${auth.user.id}/doc-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(DOC_BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) return fail(error.message);
    return ok(path);
  }, []);

  const certificateFileUrl = useCallback(async (filePath: string): Promise<ActionResult<string>> => {
    const { data, error } = await getSupabase()
      .storage.from(DOC_BUCKET)
      .createSignedUrl(filePath, 3600);
    if (error || !data) return fail("Could not open the document.");
    return ok(data.signedUrl);
  }, []);

  return {
    settings,
    skills,
    projects,
    imports,
    certificates,
    loading,
    reload,
    saveSettings,
    uploadImage: (file: File) => uploadImage(COVER_BUCKET, file),
    uploadDocument,
    certificateFileUrl,
  };
}
