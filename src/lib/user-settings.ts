"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  applyTextSize,
  applyTheme,
  getAppliedTheme,
  getStoredTextSize,
  type TextSize,
  type Theme,
} from "@/lib/theme";
import { getSupabase } from "@/lib/supabase/client";

export type ProfileVisibility = "public" | "private";
export type InfoVisibility = "everyone" | "friends" | "nobody";

/**
 * Everything on the Settings page, saved in Supabase (user_settings, one row per
 * user id) so the same account finds the same values on every device. Supabase
 * is the source of truth; localStorage only caches the appearance for the first
 * paint before sign-in. Realtime streams changes to the owner's other devices.
 */
export interface UserSettings {
  theme: Theme;
  textSize: TextSize;
  notifyMessages: boolean;
  notifyFriendRequests: boolean;
  notifyCommunities: boolean;
  notifyCourses: boolean;
  notifyAssignments: boolean;
  notifyDeadlines: boolean;
  notifyChallenges: boolean;
  profileVisibility: ProfileVisibility;
  infoVisibility: InfoVisibility;
  allowFriendRequests: boolean;
  showOnlineStatus: boolean;
  deactivated: boolean;
  /** True once the row has been fetched for the signed-in user. */
  loaded: boolean;
  signedIn: boolean;
}

interface SettingsRow {
  theme: Theme;
  text_size: TextSize;
  notify_messages: boolean;
  notify_friend_requests: boolean;
  notify_communities: boolean;
  notify_courses: boolean;
  notify_assignments: boolean;
  notify_deadlines: boolean;
  notify_challenges: boolean;
  profile_visibility: ProfileVisibility;
  info_visibility: InfoVisibility;
  allow_friend_requests: boolean;
  show_online_status: boolean;
  deactivated: boolean;
}

const DEFAULTS: UserSettings = {
  theme: "light",
  textSize: "medium",
  notifyMessages: true,
  notifyFriendRequests: true,
  notifyCommunities: true,
  notifyCourses: true,
  notifyAssignments: true,
  notifyDeadlines: true,
  notifyChallenges: true,
  profileVisibility: "public",
  infoVisibility: "everyone",
  allowFriendRequests: true,
  showOnlineStatus: true,
  deactivated: false,
  loaded: false,
  signedIn: false,
};

/* -------------------------------------------------------------------- state */

const listeners = new Set<() => void>();

function deviceAppearance(): Pick<UserSettings, "theme" | "textSize"> {
  if (typeof window === "undefined") return { theme: "light", textSize: "medium" };
  return { theme: getAppliedTheme(), textSize: getStoredTextSize() };
}

let state: UserSettings = { ...DEFAULTS, ...deviceAppearance() };

function commit(patch: Partial<UserSettings>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  ensureStarted();
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): UserSettings {
  return state;
}

function getServerSnapshot(): UserSettings {
  return DEFAULTS;
}

/* ------------------------------------------------------------------ session */

let started = false;
let currentUserId: string | null = null;
let epoch = 0;
let channel: ReturnType<SupabaseClient["channel"]> | null = null;

function ensureStarted(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    const supabase = getSupabase();
    supabase.auth.onAuthStateChange((_event, session) => {
      // Never await Supabase calls inside this callback (supabase-js can deadlock); defer.
      const user = session?.user ?? null;
      setTimeout(() => void handleUser(user), 0);
    });
    void supabase.auth
      .getSession()
      .then(({ data }) => void handleUser(data.session?.user ?? null));
  } catch (error) {
    console.error("[settings] could not start", error);
  }
}

async function handleUser(user: User | null): Promise<void> {
  if (!user) {
    stopRealtime();
    currentUserId = null;
    epoch += 1;
    commit({
      ...DEFAULTS,
      ...deviceAppearance(),
      loaded: false,
      signedIn: false,
    });
    return;
  }
  if (user.id === currentUserId) return;
  currentUserId = user.id;
  const token = ++epoch;
  commit({ signedIn: true, loaded: false });

  const supabase = getSupabase();
  // Create the row on first sign-in, seeding it with this device's cached look.
  const { error: seedError } = await supabase
    .from("user_settings")
    .upsert(
      { user_id: user.id, theme: getAppliedTheme(), text_size: getStoredTextSize() },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
  if (seedError) console.warn("[settings] seed failed", seedError.message);

  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (token !== epoch) return;
  if (error || !data) {
    console.warn("[settings] could not load settings", error?.message);
    commit({ loaded: true });
    return;
  }

  const row = data as SettingsRow;
  commit(fromRow(row));
  applyTheme(row.theme);
  applyTextSize(row.text_size);
  // Presence: "Show online status" works only if last_seen_at stays fresh.
  void supabase
    .from("user_settings")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("user_id", user.id);

  subscribeRealtime(supabase, user.id);
}

function fromRow(row: SettingsRow): UserSettings {
  return {
    theme: row.theme,
    textSize: row.text_size,
    notifyMessages: row.notify_messages,
    notifyFriendRequests: row.notify_friend_requests,
    notifyCommunities: row.notify_communities,
    notifyCourses: row.notify_courses,
    notifyAssignments: row.notify_assignments,
    notifyDeadlines: row.notify_deadlines,
    notifyChallenges: row.notify_challenges,
    profileVisibility: row.profile_visibility,
    infoVisibility: row.info_visibility,
    allowFriendRequests: row.allow_friend_requests,
    showOnlineStatus: row.show_online_status,
    deactivated: row.deactivated,
    loaded: true,
    signedIn: true,
  };
}

function subscribeRealtime(supabase: SupabaseClient, userId: string): void {
  stopRealtime();
  channel = supabase
    .channel(`cova-settings-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "user_settings", filter: `user_id=eq.${userId}` },
      () => {
        // Another device changed a setting: converge on it.
        setTimeout(() => void reload(), 120);
      },
    )
    .subscribe();
}

function stopRealtime(): void {
  if (channel) {
    void getSupabase().removeChannel(channel);
    channel = null;
  }
}

async function reload(): Promise<void> {
  if (!currentUserId) return;
  const { data, error } = await getSupabase()
    .from("user_settings")
    .select("*")
    .eq("user_id", currentUserId)
    .maybeSingle();
  if (error || !data) return;
  const row = data as SettingsRow;
  commit(fromRow(row));
  applyTheme(row.theme);
  applyTextSize(row.text_size);
}

/* -------------------------------------------------------------------- writes */

function toRowPatch(patch: Partial<UserSettings>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.theme !== undefined) row.theme = patch.theme;
  if (patch.textSize !== undefined) row.text_size = patch.textSize;
  if (patch.notifyMessages !== undefined) row.notify_messages = patch.notifyMessages;
  if (patch.notifyFriendRequests !== undefined) row.notify_friend_requests = patch.notifyFriendRequests;
  if (patch.notifyCommunities !== undefined) row.notify_communities = patch.notifyCommunities;
  if (patch.notifyCourses !== undefined) row.notify_courses = patch.notifyCourses;
  if (patch.notifyAssignments !== undefined) row.notify_assignments = patch.notifyAssignments;
  if (patch.notifyDeadlines !== undefined) row.notify_deadlines = patch.notifyDeadlines;
  if (patch.notifyChallenges !== undefined) row.notify_challenges = patch.notifyChallenges;
  if (patch.profileVisibility !== undefined) row.profile_visibility = patch.profileVisibility;
  if (patch.infoVisibility !== undefined) row.info_visibility = patch.infoVisibility;
  if (patch.allowFriendRequests !== undefined) row.allow_friend_requests = patch.allowFriendRequests;
  if (patch.showOnlineStatus !== undefined) row.show_online_status = patch.showOnlineStatus;
  if (patch.deactivated !== undefined) row.deactivated = patch.deactivated;
  return row;
}

/**
 * Applies the change immediately and saves it to Supabase. Signed out, only the
 * device keeps the appearance choices. On a save failure the change is rolled
 * back and `onError` runs.
 */
export function updateSettings(
  patch: Partial<UserSettings>,
  onError?: () => void,
): void {
  const previous = state;
  commit(patch);
  if (patch.theme !== undefined) applyTheme(patch.theme);
  if (patch.textSize !== undefined) applyTextSize(patch.textSize);
  if (!currentUserId) {
    if (onError && (patch.theme === undefined && patch.textSize === undefined)) onError();
    return;
  }
  const row = toRowPatch(patch);
  if (Object.keys(row).length === 0) return;
  void getSupabase()
    .from("user_settings")
    .update(row)
    .eq("user_id", currentUserId)
    .then(({ error }) => {
      if (!error) return;
      console.warn("[settings] save failed", error.message);
      commit({ ...previous });
      if (previous.theme !== state.theme && patch.theme !== undefined) applyTheme(previous.theme);
      if (previous.textSize !== state.textSize && patch.textSize !== undefined) {
        applyTextSize(previous.textSize);
      }
      onError?.();
    });
}

/* ---------------------------------------------------------------------- hook */

export function useUserSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const update = useCallback(
    (patch: Partial<UserSettings>, onError?: () => void) => updateSettings(patch, onError),
    [],
  );
  return { settings, update };
}
