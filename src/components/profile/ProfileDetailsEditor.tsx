"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SelectFilter, TextField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import {
  AUDIENCES,
  EMPTY_DETAILS,
  SOCIAL_PLATFORMS,
  useMyProfileDetails,
  type FieldVisibilityConfig,
  type PrivacyAudience,
  type PrivateDetails,
  type SocialLink,
  type SocialPlatform,
} from "@/lib/profile-details";

const VISIBILITY_FIELDS: Array<{ field: FieldVisibilityConfig["field"]; labelKey: Parameters<ReturnType<typeof useT>>[0] }> = [
  { field: "first_name", labelKey: "profile.details.firstName" },
  { field: "last_name", labelKey: "profile.details.lastName" },
  { field: "gender", labelKey: "profile.details.gender" },
  { field: "university", labelKey: "profile.details.university" },
  { field: "education", labelKey: "profile.details.education" },
];

/**
 * Personal Information + Education + per-field privacy (spec Phases 6.1/6.3/7).
 * Gender is optional: Male / Female / unspecified (left empty) — and its
 * default audience is "me": it is never exposed automatically.
 */
export function ProfileDetailsEditor() {
  const t = useT();
  const toast = useToast();
  const { load, save, saveVisibility } = useMyProfileDetails();
  const [details, setDetails] = useState<PrivateDetails>({ ...EMPTY_DETAILS });
  const [visibility, setVisibility] = useState<Record<string, PrivacyAudience>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await load();
      if (result.ok) {
        setDetails(result.value.details);
        const map: Record<string, PrivacyAudience> = {};
        for (const item of result.value.visibility) map[item.field] = item.audience;
        setVisibility(map);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
  }, []);

  async function onSave() {
    setSaving(true);
    const result = await save(details);
    setSaving(false);
    if (!result.ok) {
      toast.push(t("profile.details.saveError"));
      return;
    }
    toast.push(t("profile.details.saved"));
  }

  async function onVisibilitySave() {
    const config: FieldVisibilityConfig[] = VISIBILITY_FIELDS.map((item) => ({
      field: item.field,
      audience: visibility[item.field] ?? "members",
    }));
    const result = await saveVisibility(config);
    toast.push(result.ok ? t("profile.details.visibilitySaved") : t("profile.details.saveError"));
  }

  if (loading) {
    return (
      <Card>
        <CardBody className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-cova-muted" aria-hidden="true" />
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={t("profile.details.title")} description={t("profile.details.desc")} />
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              id="first-name"
              label={t("profile.details.firstName")}
              autoComplete="given-name"
              maxLength={30}
              value={details.firstName}
              onChange={(e) => setDetails({ ...details, firstName: e.target.value })}
            />
            <TextField
              id="last-name"
              label={t("profile.details.lastName")}
              autoComplete="family-name"
              maxLength={30}
              value={details.lastName}
              onChange={(e) => setDetails({ ...details, lastName: e.target.value })}
            />
          </div>
          {/* Gender: optional — leaving it unspecified is always allowed. */}
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t("profile.details.gender")}</span>
            <span className="sr-only">{t("profile.details.genderOptional")}</span>
            <select
              value={details.gender ?? ""}
              onChange={(e) =>
                setDetails({ ...details, gender: (e.target.value || null) as PrivateDetails["gender"] })
              }
              className="h-10 w-full rounded-lg border border-cova-line bg-white px-3 text-sm dark:bg-cova-ink"
            >
              <option value="">{t("profile.details.genderUnspecified")}</option>
              <option value="male">{t("profile.details.genderMale")}</option>
              <option value="female">{t("profile.details.genderFemale")}</option>
            </select>
          </label>
          <TextField
            id="university"
            label={t("profile.details.university")}
            maxLength={100}
            value={details.university}
            onChange={(e) => setDetails({ ...details, university: e.target.value })}
          />
          <TextField
            id="education"
            label={t("profile.details.education")}
            maxLength={250}
            value={details.education}
            onChange={(e) => setDetails({ ...details, education: e.target.value })}
          />
          <div className="flex justify-end">
            <Button onClick={() => void onSave()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {t("common.save")}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("profile.details.visibilityTitle")}
          description={t("profile.details.visibilityDesc")}
        />
        <CardBody className="space-y-3">
          {VISIBILITY_FIELDS.map((item) => (
            <div key={item.field} className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-cova-ink">{t(item.labelKey)}</span>
              <select
                aria-label={`${t(item.labelKey)} — ${t("profile.details.visibility")}`}
                value={visibility[item.field] ?? "members"}
                onChange={(e) =>
                  setVisibility((current) => ({ ...current, [item.field]: e.target.value as PrivacyAudience }))
                }
                className="h-9 rounded-lg border border-cova-line bg-white px-2 text-sm dark:bg-cova-ink"
              >
                {AUDIENCES.map((audience) => (
                  <option key={audience} value={audience}>
                    {t(`profile.details.audience.${audience}` as Parameters<typeof t>[0])}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="flex justify-end">
            <Button onClick={() => void onVisibilitySave()} disabled={saving}>
              {t("common.save")}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/**
 * Public read of the extended details (spec Phase 7): everything arrives
 * already filtered by the server RPC — the component renders exactly what the
 * owner chose to reveal, and nothing at all when nothing is public.
 */
export function ProfilePublicDetails({ code }: { code: string }) {
  const t = useT();
  const [details, setDetails] = useState<{
    firstName?: string | null;
    lastName?: string | null;
    gender?: string | null;
    university?: string | null;
    education?: string | null;
    social?: Array<{ platform: string; value: string; position: number }>;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      const { getSupabase } = await import("@/lib/supabase/client");
      const { data, error } = await getSupabase().rpc("profile_details_visible", { p_code: code });
      if (!error && data && (data as { found?: boolean }).found) {
        setDetails(data as typeof details);
      }
    })();
  }, [code]);

  if (!details) return null;
  const rows: Array<[string, string]> = [];
  if (details.firstName || details.lastName) {
    rows.push(["profile.details.firstName", [details.firstName, details.lastName].filter(Boolean).join(" ")]);
  }
  if (details.university) rows.push(["profile.details.university", details.university]);
  if (details.education) rows.push(["profile.details.education", details.education]);
  if (details.gender) {
    rows.push([
      "profile.details.gender",
      details.gender === "male"
        ? t("profile.details.genderMale")
        : t("profile.details.genderFemale"),
    ]);
  }

  if (rows.length === 0 && (details.social?.length ?? 0) === 0) return null;

  return (
    <Card>
      <CardHeader title={t("profile.details.title")} />
      <CardBody className="space-y-2">
        {rows.map(([labelKey, value]) => (
          <div key={labelKey} className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs text-cova-mute">{t(labelKey as Parameters<typeof t>[0])}</span>
            <span className="text-sm font-medium text-cova-ink">{value}</span>
          </div>
        ))}
        {(details.social?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {details.social?.map((link) => (
              <a
                key={link.platform}
                href={link.value.startsWith("http") ? link.value : `https://${link.value.replace(/^@/, "")}`}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center rounded-full border border-cova-line px-3 py-1 text-xs font-medium capitalize text-cova-ink hover:bg-cova-pale"
              >
                {link.platform}
              </a>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Social media (spec 6.2): add/edit/remove, display order and an independent
 * visibility per platform. A social link is a profile link — not an auth
 * provider (OAuth is handled separately in the account panel).
 */
export function SocialLinksEditor() {
  const t = useT();
  const toast = useToast();
  const { load, saveLink, removeLink, reorderLinks } = useMyProfileDetails();
  const [links, setLinks] = useState<SocialLink[]>([]);
  const [platform, setPlatform] = useState<SocialPlatform>("instagram");
  const [value, setValue] = useState("");
  const [audience, setAudience] = useState<PrivacyAudience>("members");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await load();
      if (result.ok) setLinks(result.value.links);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
  }, []);

  function usedPlatforms(): SocialPlatform[] {
    return links.map((item) => item.platform);
  }

  async function add() {
    setBusy(true);
    const result = await saveLink({ platform, value, position: links.length, visibility: audience });
    setBusy(false);
    if (!result.ok) {
      toast.push(t("profile.details.saveError"));
      return;
    }
    const reload = await load();
    if (reload.ok) setLinks(reload.value.links);
    setValue("");
  }

  async function remove(item: SocialLink) {
    setBusy(true);
    const result = await removeLink(item.platform);
    setBusy(false);
    if (!result.ok) {
      toast.push(t("profile.details.saveError"));
      return;
    }
    setLinks((current) => current.filter((link) => link.platform !== item.platform));
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= links.length) return;
    const moving = links[index];
    const swapped = links[target];
    if (!moving || !swapped) return;
    const next = [...links];
    next[index] = swapped;
    next[target] = moving;
    setLinks(next);
    const result = await reorderLinks(next.map((link) => link.platform));
    if (!result.ok) toast.push(t("profile.details.saveError"));
  }

  async function changeVisibility(item: SocialLink, next: PrivacyAudience) {
    const result = await saveLink({ ...item, visibility: next });
    if (!result.ok) {
      toast.push(t("profile.details.saveError"));
      return;
    }
    setLinks((current) =>
      current.map((link) => (link.platform === item.platform ? { ...link, visibility: next } : link)),
    );
  }

  const available = SOCIAL_PLATFORMS.filter((candidate) => !usedPlatforms().includes(candidate));

  return (
    <Card>
      <CardHeader title={t("profile.social.title")} description={t("profile.social.desc")} />
      <CardBody className="space-y-4">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-cova-muted" aria-hidden="true" />
        ) : (
          <>
            {links.length === 0 && <p className="text-sm text-cova-mute">{t("profile.social.none")}</p>}
            <ul className="space-y-2">
              {links.map((link, index) => (
                <li
                  key={link.id ?? link.platform}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-cova-line bg-cova-bg px-3 py-2"
                >
                  <span className="text-sm font-semibold capitalize text-cova-ink">{link.platform}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-cova-mute">{link.value}</span>
                  <select
                    aria-label={`${link.platform} — ${t("profile.details.visibility")}`}
                    value={link.visibility}
                    onChange={(e) => void changeVisibility(link, e.target.value as PrivacyAudience)}
                    className="h-8 rounded-lg border border-cova-line bg-white px-1.5 text-xs dark:bg-cova-ink"
                  >
                    {AUDIENCES.map((option) => (
                      <option key={option} value={option}>
                        {t(`profile.details.audience.${option}` as Parameters<typeof t>[0])}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={t("profile.social.moveUp")}
                    onClick={() => void move(index, -1)}
                    disabled={index === 0 || busy}
                    className="rounded p-1 text-cova-mute hover:bg-cova-pale hover:text-cova-ink disabled:opacity-40"
                  >
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("profile.social.moveDown")}
                    onClick={() => void move(index, 1)}
                    disabled={index === links.length - 1 || busy}
                    className="rounded p-1 text-cova-mute hover:bg-cova-pale hover:text-cova-ink disabled:opacity-40"
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("profile.social.remove")}
                    onClick={() => void remove(link)}
                    disabled={busy}
                    className="rounded p-1 text-cova-error hover:bg-cova-pale disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>

            {available.length > 0 && (
              <div className="grid items-end gap-2 border-t border-cova-line pt-3 sm:grid-cols-[10rem_minmax(0,1fr)_12rem_auto]">
                <SelectFilter
                  id="social-platform"
                  label={t("profile.social.platform")}
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as SocialPlatform)}
                  options={available.map((item) => ({ value: item, label: item }))}
                />
                <TextField
                  id="social-value"
                  label={t("profile.social.value")}
                  maxLength={200}
                  placeholder="https://… or @username"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
                <SelectFilter
                  id="social-visibility"
                  label={t("profile.details.visibility")}
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as PrivacyAudience)}
                  options={AUDIENCES.map((item) => ({
                    value: item,
                    label: t(`profile.details.audience.${item}` as Parameters<typeof t>[0]),
                  }))}
                />
                <Button onClick={() => void add()} disabled={busy || value.trim().length === 0}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t("profile.social.add")}
                </Button>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
