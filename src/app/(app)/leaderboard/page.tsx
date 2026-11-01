import type { Metadata } from "next";
import { LeaderboardPageContent } from "@/components/learning/LeaderboardPageContent";

export const metadata: Metadata = { title: "Leaderboard" };

export default function LeaderboardPage() {
  return <LeaderboardPageContent />;
}
