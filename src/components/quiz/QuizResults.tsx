"use client";

import Link from "next/link";
import { Crown, Medal, Trophy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

export interface ResultPlayer {
  nickname: string;
  score: number;
  correct: number;
  total: number;
  accuracy: number;
  avgMs: number;
  xp: number;
}

interface QuizResultsProps {
  players: ResultPlayer[];
  /** Nickname of the viewer, to highlight their own row. */
  meNickname: string | null;
  onReplay: () => void;
  replaying?: boolean;
}

const PODIUM_ORDER = [1, 0, 2]; // second, first, third
const PODIUM_STYLES = [
  "h-24 bg-cova-soft/70", // 1st
  "h-16 bg-cova-pale", // 2nd
  "h-12 bg-cova-pale", // 3rd
];

function formatMs(ms: number): string {
  if (!ms) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Animated podium, full ranking and per-player stats for a finished game. */
export function QuizResults({ players, meNickname, onReplay, replaying }: QuizResultsProps) {
  const t = useT();
  const podium = players.slice(0, 3);
  const mine = players.find((player) => player.nickname === meNickname) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-center text-2xl font-semibold tracking-tight text-cova-ink">
          {t("quiz.podium")}
        </h2>
        {podium.length === 0 && (
          <p className="mt-2 text-center text-sm text-cova-mute">{t("quiz.emptyGames")}</p>
        )}
        <div className="mt-6 flex items-end justify-center gap-3 sm:gap-6">
          {PODIUM_ORDER.map((slot) => {
            const player = podium[slot];
            if (!player) return <div key={slot} className="w-24 sm:w-32" />;
            const isFirst = slot === 0;
            return (
              <div
                key={slot}
                className={cn(
                  "quiz-rise flex w-24 flex-col items-center sm:w-32",
                  slot === 1 && "quiz-delay-1",
                  slot === 2 && "quiz-delay-2",
                )}
              >
                {isFirst ? (
                  <Crown className="mb-1 h-6 w-6 text-cova-muted" aria-hidden="true" />
                ) : (
                  <Medal
                    className="mb-1 h-5 w-5 text-cova-mute"
                    aria-hidden="true"
                  />
                )}
                <p className="max-w-full truncate text-sm font-semibold text-cova-ink">
                  {player.nickname}
                </p>
                <p className="text-xs font-medium text-cova-mute">{player.score}</p>
                <div
                  className={cn(
                    "mt-2 w-full rounded-t-xl border border-b-0 border-cova-line",
                    PODIUM_STYLES[slot],
                  )}
                  aria-hidden="true"
                />
              </div>
            );
          })}
        </div>
      </div>

      {mine && (
        <Card className="quiz-pop">
          <CardBody className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-cova-mute">
                {t("quiz.totalScore")}
              </p>
              <p className="mt-1 text-xl font-semibold text-cova-ink">{mine.score}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-cova-mute">
                {t("quiz.correctAnswers")}
              </p>
              <p className="mt-1 text-xl font-semibold text-cova-ink">
                {mine.correct}/{mine.total}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-cova-mute">
                {t("quiz.avgTime")}
              </p>
              <p className="mt-1 text-xl font-semibold text-cova-ink">{formatMs(mine.avgMs)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-cova-mute">
                {t("quiz.xpEarned")}
              </p>
              <p className="mt-1 inline-flex items-center gap-1 text-xl font-semibold text-cova-ink">
                <Trophy className="h-4 w-4 text-cova-muted" aria-hidden="true" />+{mine.xp}
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cova-line text-start text-xs uppercase tracking-wide text-cova-mute">
                <th scope="col" className="px-4 py-3 text-start">#</th>
                <th scope="col" className="px-4 py-3 text-start">{t("quiz.players")}</th>
                <th scope="col" className="px-4 py-3 text-end">{t("quiz.totalScore")}</th>
                <th scope="col" className="hidden px-4 py-3 text-end sm:table-cell">
                  {t("quiz.correctAnswers")}
                </th>
                <th scope="col" className="hidden px-4 py-3 text-end sm:table-cell">
                  {t("quiz.accuracy")}
                </th>
                <th scope="col" className="px-4 py-3 text-end">{t("quiz.xp")}</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player, index) => (
                <tr
                  key={`${player.nickname}-${index}`}
                  className={cn(
                    "border-b border-cova-line last:border-0",
                    player.nickname === meNickname && "bg-cova-pale/60",
                  )}
                >
                  <td className="px-4 py-2.5 font-medium text-cova-mute">{index + 1}</td>
                  <td className="px-4 py-2.5 font-medium text-cova-ink">
                    {player.nickname}
                    {player.nickname === meNickname && (
                      <span className="ms-2 text-xs text-cova-muted">({t("quiz.you")})</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-end font-semibold text-cova-ink">{player.score}</td>
                  <td className="hidden px-4 py-2.5 text-end text-cova-mute sm:table-cell">
                    {player.correct}/{player.total}
                  </td>
                  <td className="hidden px-4 py-2.5 text-end text-cova-mute sm:table-cell">
                    {player.accuracy}%
                  </td>
                  <td className="px-4 py-2.5 text-end text-cova-mute">+{player.xp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button onClick={onReplay} disabled={replaying}>
          <Trophy className="h-4 w-4" aria-hidden="true" />
          {replaying ? t("quiz.loading") : t("quiz.replay")}
        </Button>
        <Link href="/quiz" className="sm:ml-2">
          <Button variant="secondary" className="w-full sm:w-auto">
            {t("quiz.backToDashboard")}
          </Button>
        </Link>
      </div>
    </div>
  );
}
