"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Flag, Send } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import type { ChallengeType } from "@/data/challenges";

export interface RunnerQuestion {
  prompt: string;
  choices?: string[];
  type?: ChallengeType;
  multiple?: boolean;
  shortAnswer?: boolean;
  language?: string;
  starter?: string;
}

export interface RunnerAssignment {
  id: string;
  title: string;
  description: string;
  points: number;
  due_at: string;
  exercise_type: ChallengeType | "mixed";
  questions: RunnerQuestion[];
  submission_instructions: string;
  time_limit_minutes: number | null;
  attempts_allowed: number;
  randomize_questions: boolean;
  show_results_immediately: boolean;
  allow_review: boolean;
}

interface Attempt {
  id: string;
  attempt_number: number;
  deadline_at: string | null;
  answers: Array<number | number[] | string | null>;
  status: "in_progress" | "submitted" | "graded";
  score: number | null;
  feedback: string;
}

type Answer = number | number[] | string;
type Phase = "brief" | "running" | "done";

type SubmitResult = { score: number | null; points: number; needs_manual: boolean; objective_total: number; correct: number };

function questionType(question: RunnerQuestion, fallback: RunnerAssignment["exercise_type"]): ChallengeType {
  return question.type ?? (fallback === "mixed" ? "written" : fallback);
}

function isAnswered(question: RunnerQuestion, fallback: RunnerAssignment["exercise_type"], answer: Answer | undefined): boolean {
  const type = questionType(question, fallback);
  if (question.choices?.length) {
    if (type === "ordering") return Array.isArray(answer) && answer.length === question.choices.length && answer.every((position) => position > 0);
    if (Array.isArray(answer)) return answer.length > 0;
    return typeof answer === "number" && answer >= 0;
  }
  if (type === "coding") return typeof answer === "string" && answer.trim().length > 0;
  return typeof answer === "string" && answer.trim().length > 0;
}

function initialAnswers(questions: RunnerQuestion[], fallback: RunnerAssignment["exercise_type"], saved: Attempt["answers"]): Answer[] {
  return questions.map((question, index) => {
    const savedAnswer = saved[index];
    if (savedAnswer !== undefined && savedAnswer !== null) return savedAnswer;
    if (question.choices?.length) {
      return questionType(question, fallback) === "ordering" ? question.choices.map(() => 0) : -1;
    }
    return "";
  });
}

/** Shuffles 0..n-1 (display order); answers stay in canonical order. */
function shuffledOrder(length: number): number[] {
  const order = Array.from({ length }, (_, index) => index);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const atI = order[i];
    const atJ = order[j];
    if (atI === undefined || atJ === undefined) continue;
    order[i] = atJ;
    order[j] = atI;
  }
  return order;
}

/**
 * The in-COVA exam experience for interactive assignments. The clock comes
 * from the server (start_assignment_attempt), answers autosave, and the work
 * submits itself when the time is over.
 */
export function AssignmentRunner({ assignment, onDone }: { assignment: RunnerAssignment; onDone: () => void }) {
  const t = useT();
  const toast = useToast();

  const [phase, setPhase] = useState<Phase>("brief");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [current, setCurrent] = useState(0);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [serverOffset, setServerOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [starting, setStarting] = useState(false);

  const questions = assignment.questions;
  const saveTimer = useRef<number | null>(null);
  const submittingRef = useRef(false);

  const displayOrder = useMemo(
    () => (assignment.randomize_questions ? shuffledOrder(questions.length) : Array.from({ length: questions.length }, (_, index) => index)),
    // Stable for the whole attempt on purpose: the order is drawn once.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- order frozen per assignment
    [assignment.id, assignment.randomize_questions, questions.length],
  );

  const remainingMs = attempt?.deadline_at ? Date.parse(attempt.deadline_at) - (now + serverOffset) : null;
  const answeredCount = questions.reduce(
    (count, question, index) => count + (isAnswered(question, assignment.exercise_type, answers[index]) ? 1 : 0),
    0,
  );

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const submitAttempt = useCallback(
    async (auto: boolean, currentAnswers: Answer[]) => {
      if (!attempt || submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      try {
        const { data, error } = await getSupabase()
          .rpc("submit_assignment_attempt", { p_attempt_id: attempt.id, p_answers: currentAnswers });
        if (error) throw error;
        setResult((data ?? null) as SubmitResult | null);
        setPhase("done");
        setConfirmOpen(false);
        if (!auto) onDone();
      } catch (error) {
        console.error("Unable to submit the attempt:", error);
        if (!auto) toast.push(t("assignments.runner.submitError"));
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [attempt, onDone, t, toast],
  );

  // Server clock heartbeat + automatic submission when time is over.
  useEffect(() => {
    if (phase !== "running" || !attempt) return;
    const remaining = attempt.deadline_at ? Date.parse(attempt.deadline_at) - (now + serverOffset) : null;
    if (remaining !== null && remaining <= 0 && !submittingRef.current) {
      const id = window.setTimeout(() => void submitAttempt(true, answers), 0);
      return () => window.clearTimeout(id);
    }
  }, [phase, attempt, now, serverOffset, submitAttempt, answers]);

  // Autosave (debounced): answers land on the server every few seconds.
  useEffect(() => {
    if (phase !== "running" || !attempt) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      setSaveState("saving");
      void getSupabase()
        .rpc("save_assignment_attempt", { p_attempt_id: attempt.id, p_answers: answers })
        .then(({ error }) => setSaveState(error ? "idle" : "saved"));
    }, 4000);
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, [answers, phase, attempt]);

  async function start() {
    setStarting(true);
    try {
      const { data, error } = await getSupabase()
        .rpc("start_assignment_attempt", { p_assignment_id: assignment.id });
      if (error) throw error;
      const payload = (data ?? {}) as { attempt: Attempt; server_time: string };
      setAttempt(payload.attempt);
      setServerOffset(Date.parse(payload.server_time) - Date.now());
      setAnswers(initialAnswers(questions, assignment.exercise_type, payload.attempt.answers ?? []));
      setNow(Date.now());
      setPhase("running");
    } catch (error) {
      console.error("Unable to start the assignment:", error);
      toast.push((error as Error).message || t("assignments.runner.startError"));
    } finally {
      setStarting(false);
    }
  }

  async function checkAttempts() {
    try {
      const { data } = await getSupabase()
        .from("assignment_attempts")
        .select("attempt_number,status")
        .eq("assignment_id", assignment.id);
      const rows = (data ?? []) as Array<{ attempt_number: number; status: string }>;
      setAttemptsUsed(rows.length);
    } catch {
      setAttemptsUsed(0);
    }
  }

  useEffect(() => {
    const id = window.setTimeout(() => void checkAttempts(), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- count attempts once per assignment view
  }, [assignment.id]);

  const setAnswer = (index: number, value: Answer) =>
    setAnswers((currentAnswers) => currentAnswers.map((item, itemIndex) => (itemIndex === index ? value : item)));

  function moveOrdering(questionIndex: number, displayPosition: number, direction: -1 | 1) {
    const answer = answers[questionIndex];
    if (!Array.isArray(answer)) return;
    const target = displayPosition + direction;
    if (target < 0 || target >= answer.length) return;
    const next = [...answer];
    const moving = next[displayPosition];
    const swapped = next[target];
    if (moving === undefined || swapped === undefined) return;
    next[displayPosition] = swapped;
    next[target] = moving;
    setAnswer(questionIndex, next);
  }

  if (phase === "brief") {
    const timeLimit = assignment.time_limit_minutes;
    return (
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="soft">{t("assignments.runner.interactive")}</Badge>
            <Badge tone="outline">{t("assignments.create.totalPointsValue", { points: assignment.points })}</Badge>
            {timeLimit && <Badge tone="outline">{t("assignments.runner.timeLimit", { minutes: timeLimit })}</Badge>}
            <Badge tone="outline">{t("assignments.create.attempts")}: {assignment.attempts_allowed}</Badge>
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{assignment.title}</h1>
            {assignment.description && <p className="mt-2 whitespace-pre-wrap text-sm text-cova-mute">{assignment.description}</p>}
          </div>
          <dl className="grid gap-x-6 gap-y-2 rounded-lg bg-cova-bg p-4 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-3"><dt className="text-cova-mute">{t("assignments.runner.exercises")}</dt><dd className="font-medium">{questions.length}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-cova-mute">{t("assignments.deadlineLabel")}</dt><dd className="font-medium">{new Date(assignment.due_at).toLocaleString()}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-cova-mute">{t("assignments.create.attempts")}</dt><dd className="font-medium">{attemptsUsed} / {assignment.attempts_allowed}</dd></div>
            {assignment.submission_instructions && (
              <div className="sm:col-span-2"><dt className="text-cova-mute">{t("assignments.create.submissionInstructions")}</dt><dd className="mt-1 whitespace-pre-wrap">{assignment.submission_instructions}</dd></div>
            )}
          </dl>
          <p className="flex items-start gap-2 rounded-lg bg-cova-pale p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-cova-muted" aria-hidden="true" />
            {t("assignments.runner.briefWarning")}
          </p>
          <div className="flex justify-end">
            <Button onClick={() => void start()} disabled={starting || attemptsUsed >= assignment.attempts_allowed || new Date(assignment.due_at).getTime() <= now}>
              {starting ? t("assignments.runner.starting") : t("assignments.runner.start")}
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (phase === "done") {
    const showScore = assignment.show_results_immediately && result !== null;
    return (
      <Card>
        <CardBody className="space-y-4 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-cova-pale">
            <CheckCircle2 className="h-6 w-6 text-cova-muted" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-semibold">{t("assignments.runner.submitted")}</h1>
          {showScore && result && (
            <p className="text-3xl font-semibold">
              {t("assignments.runner.scoreOf", { score: result.score ?? 0, points: result.points })}
            </p>
          )}
          {result?.needs_manual && <p className="text-sm text-cova-mute">{t("assignments.runner.manualPending")}</p>}
          {!assignment.show_results_immediately && <p className="text-sm text-cova-mute">{t("assignments.runner.resultsHidden")}</p>}
          {assignment.allow_review && (
            <div className="mt-2 space-y-3 text-start">
              <h2 className="text-sm font-semibold">{t("assignments.runner.yourAnswers")}</h2>
              {questions.map((question, index) => {
                const displayIndex = displayOrder.indexOf(index);
                const type = questionType(question, assignment.exercise_type);
                const answer = answers[index];
                const text = Array.isArray(answer)
                  ? answer.map((position) => question.choices?.[position - 1] ?? position).join(" → ")
                  : typeof answer === "number" && question.choices ? question.choices[answer] ?? "—" : String(answer ?? "—");
                return (
                  <div key={index} className="rounded-lg border border-cova-line p-3 text-sm">
                    <p className="font-medium">{displayIndex + 1}. {question.prompt}</p>
                    {type !== "written" && type !== "coding" && <p className="mt-1 text-cova-mute">{text}</p>}
                    {type === "written" && <p className="mt-1 whitespace-pre-wrap text-cova-mute">{String(answer ?? "—")}</p>}
                    {type === "coding" && <pre className="mt-1 overflow-x-auto rounded bg-cova-bg p-2 text-xs">{String(answer ?? "—")}</pre>}
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex justify-center">
            <Button variant="secondary" onClick={onDone}>{t("assignments.runner.backToList")}</Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  const displayIndex = current;
  const canonicalIndex = displayOrder[displayIndex] ?? 0;
  const question = questions[canonicalIndex];
  if (!question) return null;
  const type = questionType(question, assignment.exercise_type);
  const answer = answers[canonicalIndex];
  const remainingMinutes = remainingMs !== null ? Math.max(0, Math.floor(remainingMs / 60000)) : null;
  const remainingSeconds = remainingMs !== null ? Math.max(0, Math.floor((remainingMs % 60000) / 1000)) : null;
  const timeCritical = remainingMs !== null && remainingMs < 5 * 60_000;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge tone="soft">{t("assignments.runner.questionOf", { current: displayIndex + 1, total: questions.length })}</Badge>
              {saveState === "saving" && <span className="text-xs text-cova-mute">{t("assignments.runner.saving")}</span>}
              {saveState === "saved" && <span className="text-xs text-cova-mute">{t("assignments.runner.saved")}</span>}
            </div>
            {remainingMs !== null && (
              <p className={`flex items-center gap-1.5 font-mono text-lg font-semibold ${timeCritical ? "text-red-700" : ""}`} aria-live="off">
                {String(remainingMinutes).padStart(2, "0")}:{String(remainingSeconds).padStart(2, "0")}
              </p>
            )}
          </div>
          <ProgressBar value={answeredCount} max={Math.max(1, questions.length)} label={t("assignments.runner.progress")} />
          <div className="flex flex-wrap gap-1.5" role="list" aria-label={t("assignments.runner.questionNav")}>
            {displayOrder.map((canonical, position) => {
              const canonicalQuestion = questions[canonical];
              const answered = canonicalQuestion ? isAnswered(canonicalQuestion, assignment.exercise_type, answers[canonical]) : false;
              return (
                <button
                  key={canonical}
                  type="button"
                  role="listitem"
                  onClick={() => setCurrent(position)}
                  aria-current={position === displayIndex ? "true" : undefined}
                  className={`h-8 w-8 rounded-lg border text-xs font-medium ${
                    position === displayIndex ? "border-cova-muted bg-cova-soft text-cova-ink"
                      : answered ? "border-cova-line bg-cova-pale text-cova-ink"
                        : "border-cova-line bg-white text-cova-mute"
                  }`}
                >
                  {marked.has(position) ? <Flag className="mx-auto h-3.5 w-3.5" aria-hidden="true" /> : position + 1}
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <h2 className="text-lg font-semibold">{question.prompt}</h2>
          {question.choices?.length ? (
            <div className="space-y-2">
              {question.choices.map((choice, choiceIndex) => {
                if (type === "matching") {
                  return (
                    <label key={choiceIndex} className="flex items-center justify-between gap-3 rounded-lg border border-cova-line p-3 text-sm">
                      <span className="font-medium">{choice}</span>
                      <select
                        value={typeof answer === "number" && answer === choiceIndex ? choiceIndex : typeof answer === "number" && answer >= 0 ? answer : ""}
                        onChange={(event) => setAnswer(canonicalIndex, event.target.value === "" ? -1 : Number(event.target.value))}
                        className="h-9 max-w-[60%] rounded-lg border border-cova-line bg-white px-2 text-sm"
                        aria-label={t("assignments.runner.matchWith")}
                      >
                        <option value="">—</option>
                        {question.choices?.map((option, optionIndex) => <option key={optionIndex} value={optionIndex}>{option}</option>)}
                      </select>
                    </label>
                  );
                }
                if (type === "ordering") {
                  return (
                    <div key={choiceIndex} className="flex items-center justify-between gap-2 rounded-lg border border-cova-line p-2.5 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cova-pale text-xs font-medium">{choiceIndex + 1}</span>
                        {choice}
                      </span>
                      <span className="flex gap-1">
                        <Button type="button" size="sm" variant="ghost" aria-label={t("assignments.runner.moveUp")} disabled={choiceIndex === 0} onClick={() => moveOrdering(canonicalIndex, choiceIndex, -1)}>
                          <ChevronLeft className="h-4 w-4 rotate-90" aria-hidden="true" />
                        </Button>
                        <Button type="button" size="sm" variant="ghost" aria-label={t("assignments.runner.moveDown")} disabled={choiceIndex === question.choices!.length - 1} onClick={() => moveOrdering(canonicalIndex, choiceIndex, 1)}>
                          <ChevronRight className="h-4 w-4 rotate-90" aria-hidden="true" />
                        </Button>
                      </span>
                    </div>
                  );
                }
                const selected = question.multiple
                  ? Array.isArray(answer) && answer.includes(choiceIndex)
                  : answer === choiceIndex;
                return (
                  <label key={choiceIndex} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${selected ? "border-cova-muted bg-cova-pale/60" : "border-cova-line hover:bg-cova-bg"}`}>
                    <input
                      type={question.multiple ? "checkbox" : "radio"}
                      name={`q-${canonicalIndex}`}
                      checked={selected}
                      onChange={() => {
                        if (question.multiple) {
                          const currentList = Array.isArray(answer) ? [...answer] : [];
                          setAnswer(canonicalIndex, currentList.includes(choiceIndex)
                            ? currentList.filter((value) => value !== choiceIndex).sort((a, b) => a - b)
                            : [...currentList, choiceIndex].sort((a, b) => a - b));
                        } else {
                          setAnswer(canonicalIndex, choiceIndex);
                        }
                      }}
                      className="h-4 w-4"
                    />
                    {choice}
                  </label>
                );
              })}
            </div>
          ) : type === "coding" ? (
            <textarea
              value={typeof answer === "string" ? answer : question.starter ?? ""}
              onChange={(event) => setAnswer(canonicalIndex, event.target.value)}
              rows={10}
              spellCheck={false}
              className="w-full rounded-lg border border-cova-line bg-cova-bg p-3 font-mono text-sm"
              aria-label={t("assignments.runner.codeAnswer")}
              placeholder={question.starter || t("assignments.runner.codeAnswer")}
            />
          ) : question.shortAnswer ? (
            <input
              type="text"
              value={typeof answer === "string" ? answer : ""}
              onChange={(event) => setAnswer(canonicalIndex, event.target.value)}
              className="h-10 w-full rounded-lg border border-cova-line bg-white px-3 text-sm"
              aria-label={t("assignments.runner.shortAnswer")}
            />
          ) : (
            <textarea
              value={typeof answer === "string" ? answer : ""}
              onChange={(event) => setAnswer(canonicalIndex, event.target.value)}
              rows={6}
              className="w-full rounded-lg border border-cova-line bg-white p-3 text-sm"
              aria-label={t("assignments.runner.writtenAnswer")}
            />
          )}
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" disabled={displayIndex === 0} onClick={() => setCurrent((value) => Math.max(0, value - 1))}>
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /> {t("assignments.runner.previous")}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setMarked((currentMarks) => {
            const next = new Set(currentMarks);
            if (next.has(displayIndex)) next.delete(displayIndex);
            else next.add(displayIndex);
            return next;
          })}
        >
          <Flag className="h-4 w-4" aria-hidden="true" /> {marked.has(displayIndex) ? t("assignments.runner.unmark") : t("assignments.runner.mark")}
        </Button>
        {displayIndex < questions.length - 1 ? (
          <Button onClick={() => setCurrent((value) => Math.min(questions.length - 1, value + 1))}>
            {t("assignments.runner.next")} <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          </Button>
        ) : (
          <Button onClick={() => setConfirmOpen(true)}>
            <Send className="h-4 w-4" aria-hidden="true" /> {t("assignments.runner.submit")}
          </Button>
        )}
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => !submitting && setConfirmOpen(false)}
        title={t("assignments.runner.confirmTitle")}
        description={t("assignments.runner.confirmBody", { answered: answeredCount, unanswered: questions.length - answeredCount })}
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>{t("assignments.runner.keepWorking")}</Button>
          <Button onClick={() => { setConfirmOpen(false); void submitAttempt(false, answers); }} disabled={submitting}>
            {submitting ? t("settings.saving") : t("assignments.runner.submit")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
