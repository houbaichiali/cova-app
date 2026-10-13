"use client";

import { useMemo, useState } from "react";
import { Check, Clock, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SelectFilter } from "@/components/ui/FormField";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { challenges } from "@/data/challenges";
import { demoActions, useDemoState } from "@/lib/demo-store";
import type { ChallengeKind } from "@/types";

const TABS = ["All", "Daily", "Weekly", "Coding", "Community"] as const satisfies readonly (
  "All" | ChallengeKind
)[];
const ALL = "Any difficulty";

export function ChallengesBoard() {
  const toast = useToast();
  const { completedChallenges } = useDemoState();
  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const [difficulty, setDifficulty] = useState(ALL);
  const [hideDone, setHideDone] = useState(false);

  const results = useMemo(
    () =>
      challenges.filter(
        (c) =>
          (tab === "All" || c.kind === tab) &&
          (difficulty === ALL || c.difficulty === difficulty) &&
          (!hideDone || !completedChallenges.includes(c.id)),
      ),
    [tab, difficulty, hideDone, completedChallenges],
  );

  const earned = challenges
    .filter((c) => completedChallenges.includes(c.id))
    .reduce((s, c) => s + c.points, 0);

  return (
    <>
      <p className="mb-6 rounded-lg bg-cova-pale px-4 py-3 text-sm">
        You&apos;ve completed <strong>{completedChallenges.length}</strong> of {challenges.length}{" "}
        challenges and earned <strong>{earned} XP</strong> from them.
        <span className="block text-xs text-cova-ink/75">
          Demo only: completion is self-reported and saved in this browser.
        </span>
      </p>

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs tabs={TABS} value={tab} onChange={setTab} label="Challenge type" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SelectFilter
            label="Difficulty"
            options={[ALL, "Easy", "Medium", "Hard"]}
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hideDone}
              onChange={(e) => setHideDone(e.target.checked)}
              className="h-4 w-4 accent-cova-muted"
            />
            Hide completed
          </label>
        </div>
      </div>

      {results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No challenges to show"
          description="Try another type or difficulty, or show completed challenges."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setTab("All");
                setDifficulty(ALL);
                setHideDone(false);
              }}
            >
              Reset filters
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((c) => {
            const done = completedChallenges.includes(c.id);
            return (
              <Card key={c.id} className="flex flex-col p-5">
                <div className="flex items-center justify-between">
                  <Badge tone="outline">{c.kind}</Badge>
                  <Badge tone="soft">+{c.points} XP</Badge>
                </div>
                <h2 className="mt-3 font-semibold">{c.title}</h2>
                <p className="mt-1 flex-1 text-sm text-cova-mute">{c.description}</p>
                <p className="mt-4 flex items-center gap-4 text-xs text-cova-mute">
                  <span>{c.difficulty}</span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {c.minutes} min
                  </span>
                </p>
                <Button
                  size="sm"
                  className="mt-4"
                  variant={done ? "secondary" : "primary"}
                  onClick={() => {
                    demoActions.toggleChallenge(c.id);
                    toast.push(
                      done ? "Challenge marked as not done" : `Challenge complete: +${c.points} XP`,
                    );
                  }}
                >
                  {done && <Check className="h-4 w-4" aria-hidden="true" />}
                  {done ? "Completed" : "Mark as complete"}
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
