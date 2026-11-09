"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Camera, CircleUserRound, Eye, ExternalLink, Loader2, Save } from "lucide-react";

import type { ProfileRenderModel } from "@/components/profile/ProfilePageView";
import { AppearanceEditor } from "@/components/profile/AppearanceEditor";
import { PreviewOverlay } from "@/components/profile/PreviewOverlay";
import { SectionsEditor } from "@/components/profile/SectionsEditor";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SelectFilter, TextAreaField, TextField } from "@/components/ui/FormField";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { levelFor } from "@/lib/progress";
import { splitTags, useMyProfile, type ProfileFormValues } from "@/lib/profile";
import { DEFAULT_APPEARANCE, type Appearance } from "@/lib/appearance";
import {
  DEFAULT_PRIVACY,
  PRIVACY_KEYS,
  useMyProfileWorkspace,
} from "@/lib/profile-data";
import { useHydrated } from "@/lib/use-hydrated";

type EditorTab = "identity" | "appearance" | "sections" | "privacy";

const SECTION_LABELS: Record<string, string> = {
  show_xp: "profile.privacy.xp",
  show_badges: "profile.privacy.badges",
  show_stats: "profile.privacy.stats",
  show_groups: "profile.privacy.groups",
  show_subjects: "profile.privacy.subjects",
  show_goals: "profile.privacy.goals",
  show_skills: "profile.privacy.skills",
  show_projects: "profile.privacy.projects",
  show_achievements: "profile.privacy.achievements",
  show_journey: "profile.privacy.journey",
  show_certificates: "profile.privacy.certificates",
};

/**
 * The existing profile editor, extended in place: the original identity form,
 * avatar upload and XP block are unchanged; new tabs add appearance
 * customization, sections and privacy, plus a draft preview.
 */
export function ProfileEditor() {
  const t = useT();
  const toast = useToast();
  const hydrated = useHydrated();
  const { profile, loading, saving, save, uploadAvatar, persistAvatar } = useMyProfile();
  const workspace = useMyProfileWorkspace();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<EditorTab>("identity");
  const [uploading, setUploading] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [domain, setDomain] = useState("");
  const [location, setLocation] = useState("");
  const [progRaw, setProgRaw] = useState("");
  const [spokenRaw, setSpokenRaw] = useState("");
  const [bio, setBio] = useState("");

  // Appearance draft: previewed immediately, public only after Save.
  const [appearanceDraft, setAppearanceDraft] = useState<Appearance>({ ...DEFAULT_APPEARANCE });
  const [appearanceDirty, setAppearanceDirty] = useState(false);
  const [savingAppearance, setSavingAppearance] = useState(false);

  // Privacy draft
  const [privacyDraft, setPrivacyDraft] = useState({ ...DEFAULT_PRIVACY });
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);

  // Fill the form once the profile row has loaded.
  useEffect(() => {
    if (!profile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing form fields from the loaded row
    setDisplayName(profile.display_name ?? "");
    setHeadline(profile.headline ?? "");
    setDomain(profile.domain ?? "");
    setLocation(profile.location ?? "");
    setProgRaw((profile.prog_languages ?? []).join(", "));
    setSpokenRaw((profile.spoken_languages ?? []).join(", "));
    setBio(profile.bio ?? "");
  }, [profile]);

  useEffect(() => {
    if (!workspace.appearance) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing editor drafts from the loaded rows
    setAppearanceDraft(workspace.appearance);
    setAppearanceDirty(false);
  }, [workspace.appearance]);

  useEffect(() => {
    if (!workspace.privacy) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing editor drafts from the loaded rows
    setPrivacyDraft(workspace.privacy);
  }, [workspace.privacy]);

  if (!hydrated || loading || workspace.loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!profile) {
    return (
      <EmptyState
        icon={CircleUserRound}
        title={t("page.profile.title")}
        description={t("profile.signin")}
        action={
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-lg border border-cova-line px-4 text-sm font-medium hover:bg-cova-pale"
          >
            {t("common.signin")}
          </Link>
        }
      />
    );
  }

  const level = levelFor(profile.xp ?? 0);

  async function onPhotoPicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    const uploaded = await uploadAvatar(file);
    if (!uploaded.ok) {
      toast.push(uploaded.error);
      setUploading(false);
      return;
    }
    const persisted = await persistAvatar(uploaded.value);
    setUploading(false);
    toast.push(persisted.ok ? t("profile.photoSaved") : persisted.error);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const values: ProfileFormValues = {
      displayName,
      headline,
      domain,
      location,
      progLanguages: splitTags(progRaw),
      spokenLanguages: splitTags(spokenRaw),
      bio,
    };
    const result = await save(values);
    toast.push(result.ok ? t("profile.saved") : result.error);
  }

  async function onSaveAppearance() {
    setSavingAppearance(true);
    const result = await workspace.saveAppearance(appearanceDraft);
    setSavingAppearance(false);
    if (result.ok) {
      setAppearanceDirty(false);
      toast.push(t("appearance.saved"));
    } else {
      toast.push(result.error);
    }
  }

  async function onSavePrivacy() {
    setSavingPrivacy(true);
    const result = await workspace.savePrivacy(privacyDraft);
    setSavingPrivacy(false);
    toast.push(result.ok ? t("profile.privacy.saved") : (result.error ?? ""));
  }

  /** Which sections would the chosen preview audience see (draft privacy)? */
  function previewVisibility(section: string): boolean {
    const key = section === "portfolio" ? "portfolio_visibility" : `show_${section}`;
    const value = String(
      (privacyDraft as unknown as Record<string, string>)[key] ?? "public",
    );
    if (value === "public") return true;
    // In the friends preview, friends-only sections are visible too; in the
    // public preview only public ones are. The owner's own sections always
    // render for themselves on the real page.
    return value === "friends";
  }

  const identityDraft: ProfileRenderModel["identity"] = {
    user_code: workspace.userCode ?? profile.user_code ?? "",
    display_name: displayName,
    headline,
    bio,
    domain,
    prog_languages: splitTags(progRaw),
    spoken_languages: splitTags(spokenRaw),
    avatar_url: profile.avatar_url,
    location,
    joined: "",
    xp: profile.xp ?? 0,
  };

  return (
    <div className="space-y-4">
      {/* action bar: preview + public link */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={["identity", "appearance", "sections", "privacy"] as const}
          value={tab}
          onChange={setTab}
          label={t("profile.editor.tabs")}
          labels={{
            identity: t("profile.editor.tabIdentity"),
            appearance: t("profile.editor.tabAppearance"),
            sections: t("profile.editor.tabSections"),
            privacy: t("profile.editor.tabPrivacy"),
          }}
        />
        <div className="flex items-center gap-2">
          <Button onClick={() => setPreviewOpen(true)}>
            <Eye className="h-4 w-4" aria-hidden="true" /> {t("profile.preview")}
          </Button>
          {workspace.userCode && (
            <Link
              href={`/u/${workspace.userCode}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-cova-line px-4 text-sm font-medium hover:bg-cova-pale"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {t("profile.viewPublic")}
            </Link>
          )}
        </div>
      </div>

      {tab === "identity" && (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr] lg:items-start">
          <Card>
            <CardBody className="flex flex-col items-center gap-3 text-center">
              <div className="relative">
                <Avatar
                  name={displayName || "Student"}
                  src={profile.avatar_url}
                  tone="soft"
                  size="lg"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  aria-label={t("profile.changePhoto")}
                  className="absolute -bottom-1 -end-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-cova-soft text-cova-ink hover:bg-cova-muted"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Camera className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={onPhotoPicked}
                className="hidden"
              />
              <div className="min-w-0">
                <p className="truncate font-semibold">{displayName || "Student"}</p>
                <p className="truncate text-sm text-cova-mute">{headline || profile.user_code}</p>
                <p className="mt-1 font-mono text-xs text-cova-mute">{profile.user_code}</p>
              </div>
              <div className="w-full pt-1">
                <div className="flex items-baseline justify-between gap-2 text-xs text-cova-mute">
                  <span>
                    {t("profile.level", { level: level.level })}
                  </span>
                  <span>
                    {t("profile.xpLabel", { xp: (profile.xp ?? 0).toLocaleString() })}
                  </span>
                </div>
                <ProgressBar value={level.into} max={level.needed} label={t("profile.level", { level: level.level })} className="mt-1.5" />
              </div>
              <p className="text-[11px] text-cova-mute">{t("profile.photoHint")}</p>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <form onSubmit={onSubmit} className="space-y-4">
                <TextField
                  id="profile-display-name"
                  label={t("profile.displayName")}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={60}
                  required
                />
                <TextField
                  id="profile-headline"
                  label={t("profile.headline")}
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  maxLength={120}
                  placeholder={t("profile.headlinePlaceholder")}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    id="profile-domain"
                    label={t("profile.domain")}
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    maxLength={80}
                    placeholder={t("profile.domainPlaceholder")}
                  />
                  <TextField
                    id="profile-location"
                    label={t("profile.location")}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    maxLength={80}
                    placeholder={t("profile.locationPlaceholder")}
                  />
                </div>
                <TextField
                  id="profile-prog-languages"
                  label={t("profile.progLanguages")}
                  value={progRaw}
                  onChange={(e) => setProgRaw(e.target.value)}
                  placeholder="Python, JavaScript, C++"
                  hint={t("profile.tagsHint")}
                />
                <TextField
                  id="profile-spoken-languages"
                  label={t("profile.spokenLanguages")}
                  value={spokenRaw}
                  onChange={(e) => setSpokenRaw(e.target.value)}
                  placeholder="English, Français, العربية"
                  hint={t("profile.tagsHint")}
                />
                <TextAreaField
                  id="profile-bio"
                  label={t("profile.bio")}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={500}
                  rows={4}
                  placeholder={t("profile.bioPlaceholder")}
                />
                <div className="flex items-center justify-between gap-3">
                  {workspace.userCode && (
                    <Link
                      href={`/profile/portfolio`}
                      className="text-sm font-medium underline underline-offset-2 hover:underline"
                    >
                      {t("profile.editPortfolio")}
                    </Link>
                  )}
                  <Button type="submit" disabled={saving}>
                    {saving ? t("profile.saving") : t("profile.save")}
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "appearance" && (
        <div className="space-y-4">
          <AppearanceEditor draft={appearanceDraft} onChange={(next) => { setAppearanceDraft(next); setAppearanceDirty(true); }} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setAppearanceDraft(workspace.appearance ?? { ...DEFAULT_APPEARANCE });
                setAppearanceDirty(false);
              }}
              disabled={!appearanceDirty}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void onSaveAppearance()} disabled={savingAppearance || !appearanceDirty}>
              {savingAppearance ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              {t("profile.save")}
            </Button>
          </div>
        </div>
      )}

      {tab === "sections" && (
        <SectionsEditor
          subjects={workspace.subjects}
          goals={workspace.goals}
          onSubjectsChange={workspace.setSubjectsPersisted}
          onGoalUpsert={workspace.upsertGoal}
          onGoalDelete={workspace.deleteGoal}
        />
      )}

      {tab === "privacy" && (
        <Card>
          <CardBody className="space-y-4">
            <p className="text-sm text-cova-mute">{t("profile.privacy.hint")}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PRIVACY_KEYS.filter((key) => key !== "portfolio_visibility").map((key) => (
                <SelectFilter
                  key={key}
                  id={`privacy-${key}`}
                  label={t(SECTION_LABELS[key] as Parameters<typeof t>[0])}
                  options={[
                    { value: "public", label: t("profile.privacy.public") },
                    { value: "friends", label: t("profile.privacy.friends") },
                    { value: "private", label: t("profile.privacy.private") },
                  ]}
                  value={privacyDraft[key]}
                  onChange={(event) =>
                    setPrivacyDraft({ ...privacyDraft, [key]: event.target.value })
                  }
                />
              ))}
            </div>
            <div className="rounded-lg border border-cova-line p-3">
              <Switch
                checked={privacyDraft.portfolio_visibility !== "private"}
                onChange={(checked) =>
                  setPrivacyDraft({
                    ...privacyDraft,
                    portfolio_visibility: checked ? "public" : "private",
                  })
                }
                label={t("profile.privacy.portfolio")}
                description={t("profile.privacy.portfolioHint")}
              />
            </div>
            <p className="text-[11px] text-cova-mute">{t("profile.privacy.serverNote")}</p>
            <div className="flex justify-end">
              <Button onClick={() => void onSavePrivacy()} disabled={savingPrivacy}>
                {savingPrivacy ? t("profile.saving") : t("profile.privacy.save")}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <PreviewOverlay
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        userCode={workspace.userCode}
        appearanceDraft={appearanceDraft}
        visibility={previewVisibility}
        identityDraft={identityDraft}
        subjectsDraft={workspace.subjects}
        goalsDraft={workspace.goals}
      />
    </div>
  );
}
