import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ChallengesBoard } from "@/components/learning/ChallengesBoard";

export const metadata: Metadata = { title: "Challenges" };

export default function ChallengesPage() {
  return (
    <>
      <PageHeader
        title="Challenges"
        description="Earn XP with short challenges, from quick daily puzzles to community goals."
      />
      <ChallengesBoard />
    </>
  );
}
