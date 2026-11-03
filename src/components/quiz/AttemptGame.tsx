"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Hourglass,
  LogIn,
  SearchX,
  Timer,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { QuizResults, type ResultPlayer } from "@/components/quiz/QuizResults";
import { getMe } from "@/components/quiz/quiz-client";
import { getSupabase } from "@/lib/supabase/client";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

const ANSWER_COLORS = ["#e21b3c", "#1368ce", "#d89e00", "#26890c"];
const LETTERS = ["A", "B", "C", "D"];

interface AttemptStart {
  attempt_id: string;
  title: string;
  question_count: number;
  time_per_question: number;
  scoring: "standard" | "fixed";
  deadline: string | null;
  mode: string;
  answered: number;
  score: number;
}

interface QuestionPayload {
  q: string;
  choices: string[];
  multiple?: boolean;
  seconds?: number;
}

interface AnswerResult {
  correct: boolean;
  gained: number;
  score: number;
  streak: number;
}

interface AttemptSummary {
  score: number;
  correct: number;
  total: number;
  answered: number;
  accuracy: number;
  avgMs: number;
  bestStreak: number;
  xp: number;
}

type Phase = "loading" | "playing" | "done" | "notFound" | "deadline" | "error" | "signedOut";

/** Challenge & solo practice: a private, server-scored attempt per player. */
export function AttemptGame({ pin, mode }: { pin: string; mode: "challenge" | "solo" }) {
  const t = useT();

  const [phase, setPhase] = useState<Phase>("loading");
  const [attempt, setAttempt] = useState<AttemptStart | null>(null);
  const [question, setQuestion] = useState<QuestionPayload | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [locked, setLocked] = useState<AnswerResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  // Server-anchored deadline for the current question; set together with the
  // question (in async callbacks), read by the countdown interval.
  const [deadlineAt, setDeadlineAt] = useState(0);
  const [summary, setSummary] = useState<AttemptSummary | null>(null);
  const [restarting, setRestarting] = useState(false);
  const attemptRef = useRef<string>("");

  const start = useCallback(async (): Promise<AttemptStart | null> => {
    const me = await getMe();
    if (!me) {
      setPhase("signedOut");
      return null;
    }
    const { data, error } = await getSupabase().rpc("quiz_attempt_start", {
      p_pin: pin,
      p_mode: mode,
    });
    if (error) {
      const message = error.message;
      if (message.includes("Deadline passed")) setPhase("deadline");
      else if (message.includes("PIN not found")) setPhase("notFound");
      else setPhase("error");
      return null;
    }
    const row = (Array.isArray(data) ? data[0] : data) as AttemptStart | undefined;
    if (!row) {
      setPhase("error");
      return null;
    }
    attemptRef.current = row.attempt_id;
    setAttempt(row);
    return row;
  }, [pin, mode]);

  const loadQuestion = useCallback(async (index: number, fallbackSeconds: number) => {
    const { data, error } = await getSupabase().rpc("quiz_attempt_question", {
      p_attempt: attemptRef.current,
      p_index: index,
    });
    if (error || !data) {
      setPhase("error");
      return;
    }
    const payload = data as QuestionPayload;
    const seconds = payload.seconds ?? fallbackSeconds;
    setQuestion(payload);
    setSelected([]);
    setLocked(null);
    setSecondsLeft(seconds);
    setDeadlineAt(Date.now() + seconds * 1000);
  }, []);

  useEffect(() => {
    void (async () => {
      // start() resumes an unfinished attempt, so refreshes keep progress.
      const row = await start();
      if (!row) return;
      if (row.answered >= row.question_count) {
        await finish();
      } else {
        setQuestionIndex(row.answered);
        await loadQuestion(row.answered, row.time_per_question);
        setPhase("playing");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time boot
  }, []);

  async function finish() {
    const { data, error } = await getSupabase().rpc("quiz_attempt_finish", {
      p_attempt: attemptRef.current,
    });
    if (error || !data) {
      setPhase("error");
      return;
    }
    setSummary(data as AttemptSummary);
    setPhase("done");
  }

  async function submit(choice: number[] | null) {
    if (!question || locked || submitting) return;
    setSubmitting(true);
    const { data, error } = await getSupabase().rpc("quiz_attempt_answer", {
      p_attempt: attemptRef.current,
      p_choice: choice === null ? null : question.multiple ? choice : choice[0] ?? null,
    });
    setSubmitting(false);
    if (error) {
      setPhase("error");
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as AnswerResult | undefined;
    if (row) setLocked(row);
  }

  // Local countdown for the current question; expiry submits "no answer".
  // Only the interval callback sets state, so React StrictMode double mounts
  // cannot double-submit an answer.
  useEffect(() => {
    if (phase !== "playing" || locked || !deadlineAt) return;
    const id = window.setInterval(() => {
      const remaining = deadlineAt - Date.now();
      setSecondsLeft(Math.max(0, Math.ceil(remaining / 1000)));
      if (remaining <= 0) {
        window.clearInterval(id);
        void submit(null);
      }
    }, 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- submit is stable per question
  }, [phase, locked, deadlineAt]);

  function handleNext() {
    const next = questionIndex + 1;
    const total = attempt?.question_count ?? 0;
    if (next >= total) {
      void finish();
      return;
    }
    setQuestionIndex(next);
    void loadQuestion(next, attempt?.time_per_question ?? 20);
  }

  async function handleRestart() {
    setRestarting(true);
    setSummary(null);
    setQuestion(null);
    setLocked(null);
    // start() creates a fresh attempt once the previous one is finished.
    const row = await start();
    if (row) {
      if (row.answered >= row.question_count) {
        await finish();
      } else {
        setQuestionIndex(row.answered);
        await loadQuestion(row.answered, row.time_per_question);
        setPhase("playing");
      }
    }
    setRestarting(false);
  }

  if (phase === "loading") {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-8 w-2/3 animate-pulse rounded-lg bg-cova-pale" />
        <div className="h-40 animate-pulse rounded-xl bg-cova-pale" />
      </div>
    );
  }
  if (phase === "signedOut") {
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
  if (phase === "notFound") {
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
  if (phase === "deadline") {
    const deadlineText =
      attempt?.deadline != null
        ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
            new Date(attempt.deadline),
          )
        : "";
    return (
      <EmptyState
        icon={Hourglass}
        title={t("quiz.deadlinePassed")}
        description={deadlineText}
        action={
          <Link href="/quiz">
            <Button variant="secondary">{t("quiz.backToDashboard")}</Button>
          </Link>
        }
      />
    );
  }
  if (phase === "error") {
    return (
      <EmptyState
        icon={XCircle}
        title={t("quiz.errorGeneric")}
        description=""
        action={
          <Link href="/quiz">
            <Button variant="secondary">{t("quiz.backToDashboard")}</Button>
          </Link>
        }
      />
    );
  }
  if (phase === "done" && summary) {
    const players: ResultPlayer[] = [
      {
        nickname: t("quiz.you"),
        score: summary.score,
        correct: summary.correct,
        total: summary.total,
        accuracy: summary.accuracy,
        avgMs: summary.avgMs,
        xp: summary.xp ?? 0,
      },
    ];
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-center text-2xl font-semibold tracking-tight text-cova-ink">
          {t("quiz.finalResults")} — {attempt?.title}
        </h1>
        <QuizResults
          players={players}
          meNickname={t("quiz.you")}
          onReplay={() => void handleRestart()}
          replaying={restarting}
        />
        <p className="mt-4 text-center text-sm text-cova-mute">
          {t("quiz.streak", { n: summary.bestStreak })}
        </p>
      </div>
    );
  }

  if (phase !== "playing" || !question || !attempt) return null;
  const limit = question.seconds ?? attempt.time_per_question;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-cova-mute">
          {t("quiz.questionOf", { n: questionIndex + 1, total: attempt.question_count })}
        </p>
        <p
          className={cn(
            "inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums",
            secondsLeft <= 5 ? "text-red-800" : "text-cova-ink",
          )}
        >
          <Timer className="h-4 w-4" aria-hidden="true" />
          {locked ? "—" : `${secondsLeft}s`}
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-cova-pale" aria-hidden="true">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-1000 ease-linear",
            secondsLeft / limit < 0.2 ? "bg-red-700" : "bg-cova-muted",
          )}
          style={{ width: `${Math.round((secondsLeft / limit) * 100)}%` }}
        />
      </div>

      <Card>
        <CardBody>
          <h1 className="text-center text-xl font-semibold text-cova-ink sm:text-2xl">{question.q}</h1>
          <p className="mt-2 text-center text-xs text-cova-mute">
            {t("quiz.totalScore")}: {locked?.score ?? attempt.score}
          </p>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {question.choices.map((choice, index) => (
          <button
            key={index}
            type="button"
            disabled={!!locked || submitting}
            onClick={() => {
              if (question.multiple) {
                setSelected((prev) =>
                  prev.includes(index) ? prev.filter((x) => x !== index) : [...prev, index],
                );
              } else {
                setSelected([index]);
                void submit([index]);
              }
            }}
            className={cn(
              "quiz-pop flex min-h-16 items-center gap-3 rounded-xl px-4 py-3 text-start text-base font-semibold text-white shadow-sm transition-transform",
              !locked && "hover:scale-[1.02] active:scale-[0.99]",
              locked && selected.includes(index) && "outline outline-4 outline-offset-2 outline-white/70",
              question.multiple && selected.includes(index) && !locked && "ring-4 ring-white/80",
            )}
            style={{ backgroundColor: ANSWER_COLORS[index % ANSWER_COLORS.length] }}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/25 text-sm font-bold">
              {LETTERS[index % LETTERS.length]}
            </span>
            <span className="flex-1">{choice}</span>
            {locked && selected.includes(index) && (
              locked.correct ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <XCircle className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>

      {question.multiple && !locked && (
        <Button
          className="w-full"
          size="lg"
          disabled={selected.length === 0 || submitting}
          onClick={() => void submit([...selected])}
        >
          {submitting ? t("quiz.loading") : t("quiz.confirm")}
        </Button>
      )}

      {locked && (
        <div className="quiz-pop space-y-4 text-center">
          <p className={cn("text-2xl font-bold", locked.correct ? "text-emerald-700" : "text-red-800")}>
            {locked.correct ? t("quiz.correct") : t("quiz.incorrect")}
            {locked.correct && (
              <span className="ms-2">{t("quiz.pointsGained", { points: locked.gained })}</span>
            )}
            {locked.streak > 1 && (
              <span className="ms-2 text-base font-semibold text-cova-muted">
                {t("quiz.streak", { n: locked.streak })}
              </span>
            )}
          </p>
          <Button size="lg" onClick={handleNext}>
            {questionIndex + 1 >= attempt.question_count ? t("quiz.finish") : t("quiz.next")}
          </Button>
        </div>
      )}

      <p className="text-center">
        <Link href="/quiz" className="text-sm text-cova-mute hover:text-cova-ink">
          {t("quiz.backToDashboard")}
        </Link>
      </p>
    </div>
  );
}
