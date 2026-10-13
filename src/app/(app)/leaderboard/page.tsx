import type { Metadata } from "next";
import { LeaderboardTable } from "@/components/learning/LeaderboardTable";

export const metadata: Metadata = { title: "Leaderboard" };

export default function LeaderboardPage() {
  return <LeaderboardTable />;
}
