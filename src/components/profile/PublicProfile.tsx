"use client";

import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";

import { ProfilePageView, type ProfileRenderModel } from "@/components/profile/ProfilePageView";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  fetchPublicProfile,
  fetchSectionData,
  type EarnedBadge,
  type GoalItem,
  type JourneyEvent,
  type LearningStats,
  type ProfileSection,
  type PublicProfileData,
} from "@/lib/profile-data";

/**
 * /u/[code] — the real, saved profile. All data comes from security-definer
 * RPCs that apply the owner's per-section visibility; sections the viewer
 * cannot see simply never reach this component.
 */

const SECTIONS: ProfileSection[] = [
  "stats",
  "badges",
  "groups",
  "subjects",
  "goals",
  "skills",
  "journey",
];

export function PublicProfile({ code, notFoundLabel }: { code: string; notFoundLabel: string }) {
  const [overview, setOverview] = useState<PublicProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [sections, setSections] = useState<ProfileRenderModel["data"]>({});

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await fetchPublicProfile(code);
        if (!active) return;
        if (!data) {
          setMissing(true);
          return;
        }
        setOverview(data);
      } catch (error) {
        console.error("Unable to load the profile:", error);
        if (active) setMissing(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [code]);

  // Load the visible sections one by one; hidden ones are never requested.
  useEffect(() => {
    if (!overview) return;
    let active = true;
    void (async () => {
      for (const section of SECTIONS) {
        if (!overview.sections[section]) continue;
        try {
          const data = await fetchSectionData(code, section);
          if (!active) return;
          setSections((current) => ({ ...current, [section]: data }));
        } catch (error) {
          console.error(`Unable to load section ${section}:`, error);
          if (active) setSections((current) => ({ ...current, [section]: [] }));
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [overview, code]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (missing || !overview) {
    return <EmptyState icon={UserRound} title={notFoundLabel} description={code} />;
  }

  const model: ProfileRenderModel = {
    identity: {
      user_code: overview.profile.user_code,
      display_name: overview.profile.display_name,
      headline: overview.profile.headline,
      bio: overview.profile.bio,
      domain: overview.profile.domain,
      prog_languages: overview.profile.prog_languages ?? [],
      spoken_languages: overview.profile.spoken_languages ?? [],
      avatar_url: overview.profile.avatar_url,
      location: overview.profile.location ?? "",
      joined: overview.profile.joined,
      xp: overview.profile.xp ?? 0,
    },
    appearance: overview.appearance,
    visible: overview.sections,
    isOwner: false,
    data: {
      badges: (sections.badges as EarnedBadge[] | undefined) ?? null,
      stats: (sections.stats as LearningStats | undefined) ?? null,
      subjects: (sections.subjects as string[] | undefined) ?? null,
      goals: (sections.goals as GoalItem[] | undefined) ?? null,
      groups: (sections.groups as { id: string; name: string; category: string }[] | undefined) ?? null,
      journey: (sections.journey as JourneyEvent[] | undefined) ?? null,
      skills: (sections.skills as never) ?? null,
    },
  };

  return <ProfilePageView model={model} />;
}
