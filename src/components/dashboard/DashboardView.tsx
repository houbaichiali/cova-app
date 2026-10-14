
"use client";

import { useEffect, useState } from "react";
import { Award, BookOpen, Flame, Trophy } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatCard } from "@/components/dashboard/StatCard";
import { ContinueLearning } from "@/components/dashboard/ContinueLearning";
import { UpcomingAssignments } from "@/components/dashboard/UpcomingAssignments";
import { DailyChallengeCard } from "@/components/dashboard/DailyChallengeCard";
import { SuggestedGroups } from "@/components/dashboard/SuggestedGroups";
import { useDemoState } from "@/lib/demo-store";
import { buildLeaderboard, computeXp, levelFor } from "@/lib/progress";
import { getSupabase } from "@/lib/supabase/client";

type RealProfile = {
  id: string;
  user_code: string | null;
  display_name: string | null;
  xp: number | null;
};

export function DashboardView() {
  const state = useDemoState();
  const [profile, setProfile] = useState<RealProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const supabase = getSupabase();
        const { data: authData, error: authError } =
          await supabase.auth.getUser();

        if (authError || !authData.user) {
          if (active) setProfileLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("id, user_code, display_name, xp")
          .eq("id", authData.user.id)
          .maybeSingle();

        if (error) {
          console.error("Erreur de chargement du profil :", error.message);
          return;
        }

        if (active) {
          setProfile(data as RealProfile | null);
        }
      } catch (error) {
        console.error("Impossible de charger le profil Supabase :", error);
      } finally {
        if (active) setProfileLoading(false);
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, []);

  const demoXp = computeXp(state);
  const xp = profile?.xp ?? demoXp;
  const { level, into, needed } = levelFor(xp);

  const displayName =
    profile?.display_name?.trim() ||
    state.session?.name ||
    state.settings.displayName;

  const firstName = displayName.split(" ")[0];

  const rank =
    buildLeaderboard(xp, displayName).find((r) => r.isMe)?.rank ?? 0;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Here's where you are this week."
      />

      <Card className="mb-6">
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-cova-soft text-xl font-semibold">
            {level}
          </div>

          <div className="flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-semibold">Level {level}</p>
              <p className="text-sm text-cova-mute">
                {into} / {needed} XP to Level {level + 1}
              </p>
            </div>

            <ProgressBar
              value={into}
              max={needed}
              label="Progress to next level"
              className="mt-2"
            />

            {!profileLoading && profile?.user_code && (
              <p className="mt-2 text-sm text-cova-mute">
                Your COVA code: {profile.user_code}
              </p>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Flame}
          label="Total XP"
          value={xp.toLocaleString("en-US")}
        />

        <StatCard
          icon={Trophy}
          label="Leaderboard rank"
          value={`#${rank}`}
          detail="among demo students"
        />

        <StatCard
          icon={BookOpen}
          label="Lessons completed"
          value={String(state.completedLessons.length)}
        />

        <StatCard
          icon={Award}
          label="Challenges done"
          value={String(state.completedChallenges.length)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ContinueLearning
            enrolled={state.enrolledCourses}
            completedLessons={state.completedLessons}
          />
          <UpcomingAssignments state={state} />
        </div>

        <div className="space-y-6">
          <DailyChallengeCard completed={state.completedChallenges} />
          <SuggestedGroups joined={state.joinedGroups} />
        </div>
      </div>
    </>
  );
}
