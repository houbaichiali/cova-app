"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Clock3,
  Gamepad2,
  Globe2,
  ListOrdered,
  Lock,
  LogIn,
  Play,
  Plus,
  Radio,
  SearchX,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import {
  api,
  getMe,
  type LeaderRow,
  type MyGameRow,
  type QuizSummary,
} from "@/components/quiz/quiz-client";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n, useT } from "@/i18n/client";
import { useToast } from "@/components/ui/Toast";
import type { MessageKey } from "@/i18n/translate";
import { cn } from "@/lib/utils";

/** Category display names; unknown values fall back to "Other". */
const CATEGORY_KEYS: Record<string, MessageKey> = {
  Science: "quiz.cat.Science",
  Mathematics: "quiz.cat.Mathematics",
  Technology: "quiz.cat.Technology",
  History: "quiz.cat.History",
  Languages: "quiz.cat.Languages",
  Geography: "quiz.cat.Geography",
  "General Knowledge": "quiz.cat.General Knowledge",
  Business: "quiz.cat.Business",
  Other: "quiz.cat.Other",
};

type BoardTab = "global" | "week";

interface DashboardStats {
  games: number;
  best: number;
  accuracy: number;
}

export function QuizDashboard() {
  const t = useT();
  const { formatTag } = useI18n();
  const router = useRouter();
  const toast = useToast();

  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [publicQuizzes, setPublicQuizzes] = useState<QuizSummary[]>([]);
  const [myQuizzes, setMyQuizzes] = useState<QuizSummary[]>([]);
  const [myGames, setMyGames] = useState<MyGameRow[]>([]);
  const [globalBoard, setGlobalBoard] = useState<LeaderRow[]>([]);
  const [weekBoard, setWeekBoard] = useState<LeaderRow[]>([]);
  const [xp, setXp] = useState<number | null>(null);

  const [joinOpen, setJoinOpen] = useState(false);
  const [joinPin, setJoinPin] = useState("");
  const [joinPinError, setJoinPinError] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [hosting, setHosting] = useState<string | null>(null);
  const [boardTab, setBoardTab] = useState<BoardTab>("global");

  useEffect(() => {
    void (async () => {
      const me = await getMe();
      setMe(me);
      if (!me) {
        setReady(true);
        return;
      }
      const select =
        "id,title,description,category,mode,visibility,question_count,time_per_question,scoring,pin,deadline";
      const supabase = getSupabase();
      const [pub, mine, games, board, week, profile] = await Promise.allSettled([
        supabase
          .from("quizzes")
          .select(select)
          .eq("visibility", "public")
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("quizzes")
          .select(select)
          .eq("created_by", me.id)
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("quiz_game_players")
          .select("game_id,nickname,score,correct,total,accuracy,avg_ms,game:quiz_games(played_at,mode)")
          .eq("user_id", me.id)
          .limit(50),
        supabase
          .from("quiz_leaderboard_global")
          .select("*")
          .order("total_score", { ascending: false })
          .limit(5),
        supabase
          .from("quiz_leaderboard_week")
          .select("*")
          .order("total_score", { ascending: false })
          .limit(5),
        supabase.from("profiles").select("xp").eq("id", me.id).maybeSingle(),
      ]);
      if (pub.status === "fulfilled") setPublicQuizzes((pub.value.data ?? []) as QuizSummary[]);
      if (mine.status === "fulfilled") setMyQuizzes((mine.value.data ?? []) as QuizSummary[]);
      if (games.status === "fulfilled") setMyGames((games.value.data ?? []) as unknown as MyGameRow[]);
      if (board.status === "fulfilled") setGlobalBoard((board.value.data ?? []) as LeaderRow[]);
      if (week.status === "fulfilled") setWeekBoard((week.value.data ?? []) as LeaderRow[]);
      if (profile.status === "fulfilled") {
        setXp((profile.value.data as { xp: number | null } | null)?.xp ?? 0);
      }
      const quizzesFailed = pub.status === "rejected" || (pub.status === "fulfilled" && !!pub.value.error);
      const mineFailed = mine.status === "rejected" || (mine.status === "fulfilled" && !!mine.value.error);
      if (quizzesFailed && mineFailed) setError(true);
      setReady(true);
    })();
  }, []);

  const recentGames = useMemo(
    () =>
      [...myGames]
        .sort((a, b) => (b.game?.played_at ?? "").localeCompare(a.game?.played_at ?? ""))
        .slice(0, 5),
    [myGames],
  );

  const stats = useMemo<DashboardStats>(
    () => ({
      games: myGames.length,
      best: myGames.reduce((max, row) => Math.max(max, row.score), 0),
      accuracy:
        myGames.length > 0
          ? Math.round(myGames.reduce((sum, row) => sum + row.accuracy, 0) / myGames.length)
          : 0,
    }),
    [myGames],
  );

  function handleJoin() {
    const clean = joinPin.trim();
    if (!/^\d{6}$/.test(clean)) {
      setJoinPinError(t("quiz.errorNotFound"));
      return;
    }
    setJoinLoading(true);
    router.push(`/quiz/play/${clean}`);
  }

  async function hostQuiz(quiz: QuizSummary) {
    setHosting(quiz.id);
    const res = await api<{ pin?: string; error?: string }>(`/api/quiz/session/${quiz.pin ?? "000000"}`, {
      method: "PUT",
      body: JSON.stringify({ quizId: quiz.id }),
    });
    setHosting(null);
    if (res.ok && res.data.pin) router.push(`/quiz/play/${res.data.pin}`);
    else toast.push(t("quiz.errorGeneric"));
  }

  const dateFormatter = new Intl.DateTimeFormat(formatTag, { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="space-y-10">
      {/* ---------------------------------------------------------- hero */}
      <section className="overflow-hidden rounded-2xl border border-cova-line bg-gradient-to-br from-cova-pale via-white to-cova-soft/40 p-6 sm:p-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cova-ink">
              <Gamepad2 className="h-4 w-4 text-cova-muted" aria-hidden="true" />
              COVA QUIZ
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-cova-ink sm:text-4xl">
              COVA QUIZ
            </h1>
            <p className="mt-2 max-w-md text-sm text-cova-mute sm:text-base">{t("quiz.tagline")}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/quiz/create">
              <Button size="lg" className="w-full sm:w-auto">
                <Plus className="h-5 w-5" aria-hidden="true" />
                {t("quiz.createQuiz")}
              </Button>
            </Link>
            <Button size="lg" variant="secondary" className="w-full sm:w-auto" onClick={() => setJoinOpen(true)}>
              <Play className="h-5 w-5" aria-hidden="true" />
              {t("quiz.joinGame")}
            </Button>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- sign-in gate */}
      {ready && !me && (
        <EmptyState
          icon={LogIn}
          title={t("quiz.errorSignIn")}
          description={t("quiz.tagline")}
          action={
            <Link href="/login">
              <Button>{t("quiz.signIn")}</Button>
            </Link>
          }
        />
      )}

      {ready && me && (
        <>
          {error && (
            <Card className="border-red-200">
              <CardBody className="text-sm font-medium text-red-800">{t("quiz.errorGeneric")}</CardBody>
            </Card>
          )}

          {/* ------------------------------------------------------ stats */}
          <section>
            <h2 className="mb-3 text-base font-semibold text-cova-ink">{t("quiz.stats")}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: t("quiz.xp"), value: xp ?? 0, icon: Trophy },
                { label: t("quiz.gamesPlayed"), value: stats.games, icon: Gamepad2 },
                { label: t("quiz.bestScore"), value: stats.best, icon: ListOrdered },
                { label: t("quiz.accuracy"), value: `${stats.accuracy}%`, icon: Target },
              ].map(({ label, value, icon: Icon }) => (
                <Card key={label}>
                  <CardBody className="flex items-center gap-3 p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cova-pale text-cova-ink">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium uppercase tracking-wide text-cova-mute">
                        {label}
                      </p>
                      <p className="text-xl font-semibold tabular-nums text-cova-ink">{value}</p>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          </section>

          {/* ---------------------------------------------- public quizzes */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-cova-ink">{t("quiz.explorePublic")}</h2>
            </div>
            {publicQuizzes.length === 0 ? (
              <EmptyState icon={SearchX} title={t("quiz.emptyPublic")} description={t("quiz.tagline")} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {publicQuizzes.map((quiz) => (
                  <QuizCard
                    key={quiz.id}
                    quiz={quiz}
                    footer={
                      quiz.pin ? (
                        <Link href={`/quiz/play/${quiz.pin}`} className="w-full">
                          <Button variant="secondary" className="w-full">
                            <Play className="h-4 w-4" aria-hidden="true" />
                            {quiz.mode === "challenge"
                              ? t("quiz.playChallenge")
                              : quiz.mode === "solo"
                                ? t("quiz.playSolo")
                                : t("quiz.joinGame")}
                          </Button>
                        </Link>
                      ) : null
                    }
                  />
                ))}
              </div>
            )}
          </section>

          {/* -------------------------------------------------- my quizzes */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-cova-ink">{t("quiz.myQuizzes")}</h2>
              <Link href="/quiz/create">
                <Button variant="ghost" size="sm">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t("quiz.createQuiz")}
                </Button>
              </Link>
            </div>
            {myQuizzes.length === 0 ? (
              <EmptyState
                icon={Plus}
                title={t("quiz.emptyMine")}
                description={t("quiz.tagline")}
                action={
                  <Link href="/quiz/create">
                    <Button>{t("quiz.createQuiz")}</Button>
                  </Link>
                }
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {myQuizzes.map((quiz) => (
                  <QuizCard
                    key={quiz.id}
                    quiz={quiz}
                    footer={
                      <div className="flex w-full flex-wrap gap-2">
                        <Button
                          className="flex-1"
                          onClick={() => void hostQuiz(quiz)}
                          disabled={hosting === quiz.id}
                        >
                          <Radio className="h-4 w-4" aria-hidden="true" />
                          {hosting === quiz.id ? t("quiz.loading") : t("quiz.host")}
                        </Button>
                        {quiz.pin && (
                          <Link href={`/quiz/play/${quiz.pin}`} className="flex-1">
                            <Button variant="secondary" className="w-full">
                              {quiz.mode === "live" ? t("quiz.playSolo") : t("quiz.playChallenge")}
                            </Button>
                          </Link>
                        )}
                      </div>
                    }
                  />
                ))}
              </div>
            )}
          </section>

          {/* ------------------------------------------------- recent games */}
          <section>
            <h2 className="mb-3 text-base font-semibold text-cova-ink">{t("quiz.recentGames")}</h2>
            {recentGames.length === 0 ? (
              <EmptyState icon={Gamepad2} title={t("quiz.emptyGames")} description={t("quiz.joinDescription")} />
            ) : (
              <Card>
                <CardBody className="p-0">
                  <ul className="divide-y divide-cova-line">
                    {recentGames.map((row) => (
                      <li key={row.game_id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-cova-ink">
                            {row.nickname}
                            <span className="ms-2 text-xs text-cova-mute">
                              {row.game?.mode === "live"
                                ? t("quiz.modeLive")
                                : row.game?.mode === "challenge"
                                  ? t("quiz.modeChallenge")
                                  : t("quiz.modeSolo")}
                            </span>
                          </p>
                          <p className="text-xs text-cova-mute">
                            {row.game?.played_at
                              ? dateFormatter.format(new Date(row.game.played_at))
                              : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3 text-sm">
                          <span className="text-cova-mute">
                            {row.correct}/{row.total} · {row.accuracy}%
                          </span>
                          <span className="font-semibold tabular-nums text-cova-ink">{row.score}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            )}
          </section>

          {/* -------------------------------------------------- leaderboard */}
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-cova-ink">{t("quiz.leaderboard")}</h2>
              <Tabs<BoardTab>
                tabs={["global", "week"] as const}
                value={boardTab}
                onChange={setBoardTab}
                label={t("quiz.leaderboard")}
                labels={{ global: t("quiz.leaderboard"), week: t("quiz.weeklyLeaderboard") }}
              />
            </div>
            {(boardTab === "global" ? globalBoard : weekBoard).length === 0 ? (
              <EmptyState
                icon={Trophy}
                title={t("quiz.emptyLeaderboard")}
                description={t("quiz.tagline")}
              />
            ) : (
              <Card>
                <CardBody className="p-0">
                  <ol className="divide-y divide-cova-line">
                    {(boardTab === "global" ? globalBoard : weekBoard).map((row, index) => (
                      <li
                        key={row.user_id}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3",
                          row.user_id === me.id && "bg-cova-pale/60",
                        )}
                      >
                        <span className="w-6 text-center text-sm font-semibold text-cova-mute">
                          {index + 1}
                        </span>
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cova-pale text-cova-ink">
                          <Users className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-cova-ink">
                          {row.display_name}
                          {row.user_id === me.id && (
                            <span className="ms-1 text-xs text-cova-muted">({t("quiz.you")})</span>
                          )}
                        </span>
                        <span className="text-xs text-cova-mute">
                          {row.games} {t("quiz.gamesPlayed").toLowerCase()}
                        </span>
                        <span className="font-semibold tabular-nums text-cova-ink">
                          {String(row.total_score)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </CardBody>
              </Card>
            )}
          </section>
        </>
      )}

      {/* ------------------------------------------------------- join modal */}
      <Modal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        title={t("quiz.joinGame")}
        description={t("quiz.joinDescription")}
      >
        <div className="space-y-4">
          <input
            aria-label={t("quiz.pinLabel")}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={joinPin}
            onChange={(e) => {
              setJoinPin(e.target.value.replace(/\D/g, "").slice(0, 6));
              setJoinPinError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleJoin();
            }}
            placeholder="000000"
            className="h-14 w-full rounded-xl border border-cova-line bg-white text-center text-2xl font-bold tracking-[0.35em] text-cova-ink placeholder:text-cova-mute/50"
          />
          {joinPinError && (
            <p role="alert" className="text-xs font-medium text-red-800">
              {joinPinError}
            </p>
          )}
          <Button className="w-full" size="lg" onClick={handleJoin} disabled={joinLoading}>
            {joinLoading ? t("quiz.loading") : t("quiz.join")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function QuizCard({ quiz, footer }: { quiz: QuizSummary; footer: ReactNode }) {
  const t = useT();
  return (
    <Card className="flex flex-col">
      <CardHeader
        title={quiz.title}
        description={quiz.description || undefined}
        action={
          <Badge tone={quiz.visibility === "public" ? "pale" : "outline"}>
            {quiz.visibility === "public" ? (
              <>
                <Globe2 className="h-3 w-3" aria-hidden="true" />
                {t("quiz.visibilityPublic")}
              </>
            ) : (
              <>
                <Lock className="h-3 w-3" aria-hidden="true" />
                {t("quiz.visibilityPrivate")}
              </>
            )}
          </Badge>
        }
      />
      <CardBody className="mt-auto space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="soft">{t(CATEGORY_KEYS[quiz.category] ?? "quiz.cat.Other")}</Badge>
          <Badge tone="outline">
            {quiz.mode === "live" ? t("quiz.modeLive") : quiz.mode === "challenge" ? t("quiz.modeChallenge") : t("quiz.modeSolo")}
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-xs text-cova-mute">
          <span>
            {quiz.question_count} {t("quiz.questions")}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            {quiz.time_per_question}s
          </span>
          {quiz.pin && <span className="ms-auto font-mono">#{quiz.pin}</span>}
        </div>
        {footer}
      </CardBody>
    </Card>
  );
}
