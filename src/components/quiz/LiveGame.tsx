"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Copy,
  LogIn,
  Play,
  SearchX,
  Timer,
  UserMinus,
  Users,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TextField } from "@/components/ui/FormField";
import { QuizResults, type ResultPlayer } from "@/components/quiz/QuizResults";
import { api, useQuizSession, type QuizState } from "@/components/quiz/quiz-client";
import { useT } from "@/i18n/client";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

/** Kahoot-style functional answer colors (shape + color coding). */
const ANSWER_COLORS = ["#e21b3c", "#1368ce", "#d89e00", "#26890c"];
const LETTERS = ["A", "B", "C", "D"];

function LoadingBlock() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-8 w-2/3 animate-pulse rounded-lg bg-cova-pale" />
      <div className="h-40 animate-pulse rounded-xl bg-cova-pale" />
    </div>
  );
}

/** Full live multiplayer game: lobby, questions, reveal, rankings, results. */
export function LiveGame({ pin }: { pin: string }) {
  const { state, status, live, join, act } = useQuizSession(pin);
  const t = useT();
  const router = useRouter();
  const toast = useToast();

  const [nickname, setNickname] = useState("");
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  // Multi-select buffer, scoped to the question it belongs to so a stale
  // selection never leaks into the next question.
  const [selected, setSelected] = useState<{ qIndex: number; choices: number[] }>({
    qIndex: -1,
    choices: [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [copied, setCopied] = useState(false);
  // Interpolated countdown; only the interval callback writes it.
  const [timeLeftMs, setTimeLeftMs] = useState<number | null>(null);

  // Server-driven countdown: every SSE snapshot refreshes the server-computed
  // base value, the local interval only interpolates between snapshots.
  useEffect(() => {
    if (state?.phase !== "question" || !state.question) return;
    const base = state.question.timeLeftMs;
    const receivedAt = Date.now();
    const id = window.setInterval(() => {
      setTimeLeftMs(Math.max(0, base - (Date.now() - receivedAt)));
    }, 200);
    return () => window.clearInterval(id);
  }, [state?.phase, state?.questionStartedAt, state?.question]);

  // The host persists the finished game exactly once.
  const persistedRef = useRef(false);
  useEffect(() => {
    if (state?.phase === "ended" && state.isHost && !persistedRef.current) {
      persistedRef.current = true;
      void act("persist").then((res) => {
        if (!res.ok) toast.push(t("quiz.errorGeneric"));
      });
    }
  }, [state?.phase, state?.isHost, act, toast, t]);

  if (status === "loading") return <LoadingBlock />;
  if (status === "signedOut") {
    return (
      <EmptyState
        icon={LogIn}
        title={t("quiz.errorSignIn")}
        description={t("quiz.joinDescription")}
        action={
          <Link href="/login">
            <Button>{t("quiz.signIn")}</Button>
          </Link>
        }
      />
    );
  }
  if (status === "notFound" || !state) {
    return (
      <EmptyState
        icon={SearchX}
        title={t("quiz.errorNotFound")}
        description={t("quiz.joinDescription")}
        action={
          <Link href="/quiz">
            <Button variant="secondary">{t("quiz.backToDashboard")}</Button>
          </Link>
        }
      />
    );
  }

  const joined = state.players.some((player) => player.isMe);
  const myNickname = state.players.find((player) => player.isMe)?.nickname ?? null;

  async function handleJoin() {
    const clean = nickname.trim();
    if (!clean) {
      setNicknameError(t("quiz.nicknameLabel"));
      return;
    }
    setJoining(true);
    setNicknameError(null);
    const ok = await join(clean);
    setJoining(false);
    if (!ok) setNicknameError(t("quiz.errorNickname"));
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(pin);
      setCopied(true);
      toast.push(t("quiz.pinCopied"));
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.push(t("quiz.errorGeneric"));
    }
  }

  async function handleAnswer(choice: number | number[]) {
    if (!state?.question || state.answered || submitting) return;
    setSubmitting(true);
    const res = await act("answer", { choice });
    setSubmitting(false);
    if (!res.ok) toast.push(t("quiz.errorGeneric"));
  }

  async function handleReplay() {
    if (!state) return;
    if (!state.isHost) {
      router.push("/quiz");
      return;
    }
    setReplaying(true);
    const res = await api<{ pin?: string; error?: string }>(`/api/quiz/session/${pin}`, {
      method: "PUT",
      body: JSON.stringify({ quizId: state.quizId }),
    });
    setReplaying(false);
    if (res.ok && res.data.pin) router.push(`/quiz/play/${res.data.pin}`);
    else toast.push(t("quiz.errorGeneric"));
  }

  // ------------------------------------------------------------- join gate
  if (!joined) {
    if (state.phase !== "lobby") {
      return (
        <EmptyState icon={Timer} title={t("quiz.errorStarted")} description={t("quiz.waitingForHost")} />
      );
    }
    return (
      <Card className="mx-auto max-w-md">
        <CardBody className="space-y-4 text-center">
          <p className="text-3xl font-bold tracking-[0.3em] text-cova-ink">{pin}</p>
          <p className="text-sm text-cova-mute">{t("quiz.waitingForHost")}</p>
          {state.allowNickname && (
            <TextField
              id="quiz-nickname"
              label={t("quiz.nicknameLabel")}
              value={nickname}
              maxLength={20}
              error={nicknameError ?? undefined}
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleJoin();
              }}
            />
          )}
          <Button className="w-full" onClick={() => void handleJoin()} disabled={joining}>
            <LogIn className="h-4 w-4" aria-hidden="true" />
            {joining ? t("quiz.loading") : t("quiz.join")}
          </Button>
        </CardBody>
      </Card>
    );
  }

  // ----------------------------------------------------------------- lobby
  if (state.phase === "lobby") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Card className="text-center">
          <CardBody className="space-y-4">
            <p className="text-sm font-medium text-cova-mute">{t("quiz.sharePin")}</p>
            <p className="text-5xl font-bold tracking-[0.25em] text-cova-ink sm:text-6xl">{pin}</p>
            <Button variant="secondary" onClick={() => void handleCopy()}>
              {copied ? (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              {t("quiz.copyPin")}
            </Button>
            {state.isHost ? (
              <Button
                size="lg"
                className="w-full"
                onClick={() => void act("start")}
                disabled={state.players.length === 0}
              >
                <Play className="h-5 w-5" aria-hidden="true" />
                {t("quiz.start")}
              </Button>
            ) : (
              <p className="text-sm text-cova-mute">{t("quiz.waitingForHost")}</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="inline-flex items-center gap-2 text-base font-semibold text-cova-ink">
                <Users className="h-4 w-4 text-cova-muted" aria-hidden="true" />
                {t("quiz.players")} ({state.players.length})
              </h2>
              {!live && <span className="text-xs text-cova-mute">{t("quiz.loading")}</span>}
            </div>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {state.players.map((player) => (
                <li
                  key={player.nickname}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg border border-cova-line bg-cova-bg px-3 py-2 text-sm font-medium text-cova-ink",
                    player.isMe && "border-cova-soft",
                  )}
                >
                  <span className="truncate">{player.nickname}</span>
                  {state.isHost && !player.isMe && player.userId && (
                    <button
                      type="button"
                      aria-label={`${t("quiz.kick")} ${player.nickname}`}
                      className="rounded p-1 text-cova-mute hover:bg-cova-pale hover:text-red-800"
                      onClick={() => void act("kick", { target: player.userId })}
                    >
                      <UserMinus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    );
  }

  // --------------------------------------------------------------- results
  if (state.phase === "ended") {
    const final = state.final;
    const players: ResultPlayer[] =
      final?.players ??
      state.ranking.map((row) => ({
        nickname: row.nickname,
        score: row.score,
        correct: 0,
        total: 0,
        accuracy: 0,
        avgMs: 0,
        xp: 0,
      }));
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-center text-2xl font-semibold tracking-tight text-cova-ink">
          {t("quiz.finalResults")} — {state.quizTitle}
        </h1>
        <QuizResults
          players={players}
          meNickname={myNickname}
          onReplay={() => void handleReplay()}
          replaying={replaying}
        />
      </div>
    );
  }

  // ------------------------------------------------------ question / reveal
  const question = state.question;
  if (!question) return <LoadingBlock />;
  const reveal = state.phase === "reveal";
  // Countdown keeps running after a player locks their answer in, until the
  // reveal. Derived from state only — pure during render.
  const remainingMs =
    reveal || state.phase !== "question"
      ? 0
      : Math.max(0, timeLeftMs ?? question.timeLeftMs);
  const timeRatio = question.limitMs > 0 ? remainingMs / question.limitMs : 0;
  const activeSelected = selected.qIndex === question.index ? selected.choices : [];
  const correctSet = Array.isArray(question.correct)
    ? question.correct
    : question.correct !== null
      ? [question.correct]
      : [];
  const myRank = state.ranking.find((row) => row.isMe)?.rank ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* header: progress + timer */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-cova-mute">
          {t("quiz.questionOf", { n: question.index, total: question.total })}
        </p>
        <p
          className={cn(
            "inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums",
            remainingMs < 5000 && !reveal ? "text-red-800" : "text-cova-ink",
          )}
        >
          <Timer className="h-4 w-4" aria-hidden="true" />
          {reveal ? "—" : `${Math.ceil(remainingMs / 1000)}s`}
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-cova-pale" aria-hidden="true">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-200 ease-linear",
            timeRatio < 0.2 && !reveal ? "bg-red-700" : "bg-cova-muted",
          )}
          style={{ width: `${Math.round((reveal ? 0 : timeRatio) * 100)}%` }}
        />
      </div>

      <Card>
        <CardBody>
          <h1 className="text-center text-xl font-semibold text-cova-ink sm:text-2xl">{question.q}</h1>
          <p className="mt-2 text-center text-xs text-cova-mute">
            {t("quiz.answered", { count: question.answeredCount })}
            {myRank !== null && <> · {t("quiz.ranking")} #{myRank}</>}
            {" · "}
            {t("quiz.totalScore")}: {state.myScore}
          </p>
        </CardBody>
      </Card>

      {/* answers */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {question.choices.map((choice, index) => {
          const isCorrect = correctSet.includes(index);
          const isMine = Array.isArray(state.myAnswer)
            ? state.myAnswer.includes(index)
            : state.myAnswer === index;
          return (
            <button
              key={index}
              type="button"
              disabled={reveal || state.answered}
              onClick={() => {
                if (question.multiple) {
                  setSelected((prev) =>
                    prev.qIndex === question.index
                      ? {
                          qIndex: question.index,
                          choices: prev.choices.includes(index)
                            ? prev.choices.filter((x) => x !== index)
                            : [...prev.choices, index],
                        }
                      : { qIndex: question.index, choices: [index] },
                  );
                } else {
                  void handleAnswer(index);
                }
              }}
              className={cn(
                "quiz-pop flex min-h-16 items-center gap-3 rounded-xl px-4 py-3 text-start text-base font-semibold text-white shadow-sm transition-transform",
                !reveal && !state.answered && "hover:scale-[1.02] active:scale-[0.99]",
                reveal && isCorrect && "outline outline-4 outline-offset-2 outline-emerald-400",
                reveal && isMine && !isCorrect && "outline outline-4 outline-offset-2 outline-red-300",
                question.multiple && activeSelected.includes(index) && !reveal
                  ? "ring-4 ring-white/80"
                  : "",
              )}
              style={{ backgroundColor: ANSWER_COLORS[index % ANSWER_COLORS.length] }}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/25 text-sm font-bold">
                {LETTERS[index % LETTERS.length]}
              </span>
              <span className="flex-1">{choice}</span>
              {reveal && isCorrect && <CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
              {reveal && isMine && !isCorrect && <XCircle className="h-5 w-5" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {/* submit (multiple select) / locked banner / host controls */}
      {question.multiple && !reveal && !state.answered && (
        <Button
          className="w-full"
          size="lg"
          disabled={activeSelected.length === 0 || submitting}
          onClick={() => void handleAnswer([...activeSelected])}
        >
          {submitting ? t("quiz.loading") : t("quiz.confirm")}
        </Button>
      )}
      {state.answered && !reveal && (
        <p className="text-center text-sm font-semibold text-cova-ink">
          <CheckCircle2 className="me-1 inline h-4 w-4 text-cova-muted" aria-hidden="true" />
          {t("quiz.lockedIn")}
        </p>
      )}
      {reveal && (
        <div className="quiz-pop text-center">
          {state.lastCorrect === true && (
            <p className="text-2xl font-bold text-emerald-700">
              {t("quiz.correct")}
              {state.lastGained !== null && (
                <span className="ms-2">
                  {t("quiz.pointsGained", { points: state.lastGained })}
                </span>
              )}
              {state.myStreak > 1 && (
                <span className="ms-2 text-base font-semibold text-cova-muted">
                  {t("quiz.streak", { n: state.myStreak })}
                </span>
              )}
            </p>
          )}
          {state.lastCorrect === false && (
            <p className="text-2xl font-bold text-red-800">
              {state.answered ? t("quiz.incorrect") : t("quiz.noAnswer")}
            </p>
          )}
        </div>
      )}
      {state.isHost && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {!reveal && (
            <Button variant="secondary" onClick={() => void act("reveal")}>
              {t("quiz.forceReveal")}
            </Button>
          )}
          {reveal && (
            <Button onClick={() => void act("next")}>
              {t("quiz.forceNext")}
            </Button>
          )}
          <Button
            variant="danger"
            onClick={() => {
              if (window.confirm(t("quiz.endGame"))) void act("end");
            }}
          >
            {t("quiz.endGame")}
          </Button>
        </div>
      )}

      {/* ranking */}
      <Card>
        <CardBody>
          <h2 className="mb-3 text-base font-semibold text-cova-ink">{t("quiz.ranking")}</h2>
          <ol className="space-y-1.5">
            {state.ranking.slice(0, 5).map((row) => (
              <li
                key={row.nickname}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2 text-sm",
                  row.isMe ? "bg-cova-pale font-semibold text-cova-ink" : "text-cova-mute",
                )}
              >
                <span className="truncate">
                  {row.rank}. {row.nickname}
                  {row.isMe && <span className="ms-1 text-xs">({t("quiz.you")})</span>}
                </span>
                <span className="tabular-nums font-medium">{row.score}</span>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}

export type { QuizState };
