"use client";

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

export function DashboardView() {
  const state = useDemoState();
  const xp = computeXp(state);
  const { level, into, needed } = levelFor(xp);
  const firstName = (state.session?.name ?? state.settings.displayName).split(" ")[0];
  const rank = buildLeaderboard(xp, state.settings.displayName).find((r) => r.isMe)?.rank ?? 0;

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
          </div>
        </CardBody>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Flame} label="Total XP" value={xp.toLocaleString("en-US")} />
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
