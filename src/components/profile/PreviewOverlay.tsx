"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Eye, Monitor, Smartphone, Tablet, Users, X } from "lucide-react";

import { ProfilePageView, type ProfileRenderModel } from "@/components/profile/ProfilePageView";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { Appearance } from "@/lib/appearance";
import {
  fetchSectionData,
  type EarnedBadge,
  type JourneyEvent,
  type LearningStats,
  type ProfileSection,
} from "@/lib/profile-data";

/**
 * Draft preview overlay — shows the profile AS THE STUDENT IS EDITING IT
 * (unsaved changes included), without publishing anything. Distinct from
 * "View public profile", which always shows the saved state.
 *
 * The audience switch previews what a public visitor or a friend would see,
 * using the DRAFT privacy settings. Private information is never fetched for
 * hidden sections (the parent passes only what the chosen audience may see).
 */

type Device = "desktop" | "tablet" | "mobile";
type Audience = "public" | "friends";

const DEVICE_CLASS: Record<Device, string> = {
  desktop: "w-full",
  tablet: "w-[42rem] max-w-full",
  mobile: "w-[24rem] max-w-full",
};

export interface PreviewOverlayProps {
  open: boolean;
  onClose: () => void;
  userCode: string | null;
  appearanceDraft: Appearance;
  /** Draft privacy: which sections the chosen audience may see. */
  visibility: (section: string) => boolean;
  identityDraft: ProfileRenderModel["identity"];
  /** Owner-managed drafts (subjects/goals edited in the editor). */
  subjectsDraft: string[];
  goalsDraft: ProfileRenderModel["data"]["goals"];
}

export function PreviewOverlay({
  open,
  onClose,
  userCode,
  appearanceDraft,
  visibility,
  identityDraft,
  subjectsDraft,
  goalsDraft,
}: PreviewOverlayProps) {
  const t = useT();
  const [device, setDevice] = useState<Device>("desktop");
  const [audience, setAudience] = useState<Audience>("public");
  const [remote, setRemote] = useState<{
    badges: EarnedBadge[] | null;
    stats: LearningStats | null;
    groups: { id: string; name: string; category: string }[] | null;
    journey: JourneyEvent[] | null;
    skills: never[] | null;
  }>({ badges: null, stats: null, groups: null, journey: null, skills: null });

  useEffect(() => {
    if (!open || !userCode) return;
    let active = true;
    void (async () => {
      const wanted: ProfileSection[] = ["badges", "stats", "groups", "journey", "skills"];
      for (const section of wanted) {
        setRemote((current) => ({ ...current, [section]: null }));
      }
      for (const section of wanted) {
        try {
          const data = await fetchSectionData(userCode, section);
          if (!active) return;
          setRemote((current) => ({ ...current, [section]: data as never }));
        } catch {
          if (!active) return;
          setRemote((current) => ({ ...current, [section]: [] as never }));
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [open, userCode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const model: ProfileRenderModel = {
    identity: identityDraft,
    appearance: appearanceDraft,
    // the draft privacy decides what the simulated visitor sees
    visible: Object.fromEntries(
      ["xp", "badges", "stats", "groups", "subjects", "goals", "skills", "projects", "achievements", "journey", "certificates", "portfolio"].map(
        (section) => [section, visibility(section)],
      ),
    ),
    isOwner: true,
    data: {
      badges: remote.badges,
      stats: remote.stats,
      groups: remote.groups,
      journey: remote.journey,
      skills: remote.skills,
      subjects: subjectsDraft,
      goals: goalsDraft,
    },
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("preview.title")}
      className="fixed inset-0 z-50 flex flex-col bg-cova-bg"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cova-line bg-white px-4 py-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Eye className="h-4 w-4" aria-hidden="true" />
          {t("preview.title")}
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            {t("preview.draftBadge")}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-cova-pale p-1">
            <button
              type="button"
              aria-pressed={audience === "public"}
              onClick={() => setAudience("public")}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium",
                audience === "public" ? "bg-white text-cova-ink" : "text-cova-ink/70",
              )}
            >
              <Eye className="me-1 inline h-3.5 w-3.5" aria-hidden="true" />
              {t("preview.audiencePublic")}
            </button>
            <button
              type="button"
              aria-pressed={audience === "friends"}
              onClick={() => setAudience("friends")}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium",
                audience === "friends" ? "bg-white text-cova-ink" : "text-cova-ink/70",
              )}
            >
              <Users className="me-1 inline h-3.5 w-3.5" aria-hidden="true" />
              {t("preview.audienceFriends")}
            </button>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-cova-pale p-1">
            {(
              [
                ["desktop", Monitor],
                ["tablet", Tablet],
                ["mobile", Smartphone],
              ] as const
            ).map(([key, Icon]) => (
              <button
                key={key}
                type="button"
                aria-pressed={device === key}
                aria-label={t(`preview.device.${key}` as Parameters<typeof t>[0])}
                onClick={() => setDevice(key)}
                className={cn(
                  "rounded-md px-2 py-1",
                  device === key ? "bg-white text-cova-ink" : "text-cova-ink/70",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </button>
            ))}
          </div>
          {userCode && (
            <a
              href={`/u/${userCode}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-cova-line px-3 text-xs font-medium hover:bg-cova-pale"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              {t("preview.viewPublic")}
            </a>
          )}
          <Button variant="secondary" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" /> {t("preview.backToEdit")}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className={cn("mx-auto transition-[width]", DEVICE_CLASS[device])}>
          {remote.badges === null && remote.stats === null ? (
            <div className="space-y-4">
              <Skeleton className="h-56 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
          ) : (
            <ProfilePageView model={model} />
          )}
        </div>
      </div>
    </div>
  );
}
