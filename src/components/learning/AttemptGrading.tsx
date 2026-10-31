"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { TextAreaField, TextField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import type { ChallengeType } from "@/data/challenges";

interface AttemptRow {
  id: string;
  student_id: string;
  attempt_number: number;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  feedback: string;
  status: "in_progress" | "submitted" | "graded";
  answers: Array<number | number[] | string | null>;
  display_name: string | null;
}

interface QuestionRow {
  prompt: string;
  choices?: string[];
  type?: ChallengeType;
  multiple?: boolean;
  shortAnswer?: boolean;
}

/** Teacher view of the interactive attempts: answers per question, auto score,
 *  manual final score + feedback (grade_assignment_attempt RPC). */
export function AttemptGrading({
  assignmentId,
  questions,
  points,
  onGraded,
}: {
  assignmentId: string;
  questions: QuestionRow[];
  points: number;
  onGraded: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [attempts, setAttempts] = useState<AttemptRow[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("assignment_attempts")
        .select("id,student_id,attempt_number,started_at,submitted_at,score,feedback,status,answers")
        .eq("assignment_id", assignmentId)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as AttemptRow[];
      const studentIds = [...new Set(rows.map((row) => row.student_id))];
      const names = new Map<string, string>();
      if (studentIds.length) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id,display_name")
          .in("id", studentIds);
        for (const profile of (profileRows ?? []) as Array<{ id: string; display_name: string | null }>) {
          names.set(profile.id, profile.display_name ?? "—");
        }
      }
      setAttempts(rows.map((row) => ({ ...row, display_name: names.get(row.student_id) ?? "—" })));
    } catch (error) {
      console.error("Unable to load attempts:", error);
      setAttempts([]);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount into component state
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per assignment
  }, [assignmentId]);

  if (!loaded) {
    return <p className="text-sm text-cova-mute">{t("assignments.loading")}</p>;
  }

  async function saveGrade(event: FormEvent, attempt: AttemptRow) {
    event.preventDefault();
    const scoreText = scores[attempt.id] ?? "";
    const score = scoreText === "" ? null : Number(scoreText);
    if (scoreText !== "" && (!Number.isFinite(score) || score! < 0 || score! > points)) return;
    setSavingId(attempt.id);
    try {
      const { error } = await getSupabase().rpc("grade_assignment_attempt", {
        p_attempt_id: attempt.id,
        p_score: score,
        p_feedback: feedbacks[attempt.id] ?? attempt.feedback ?? "",
      });
      if (error) throw error;
      toast.push(t("assignments.detail.gradeSaved"));
      await load();
      onGraded();
    } catch (error) {
      console.error("Unable to grade the attempt:", error);
      toast.push((error as Error).message || t("assignments.detail.gradeError"));
    } finally {
      setSavingId(null);
    }
  }

  function renderAnswer(question: QuestionRow | undefined, answer: number | number[] | string | null): string {
    if (answer === null || answer === undefined) return "—";
    if (Array.isArray(answer)) {
      return answer.map((position) => question?.choices?.[Number(position) - 1] ?? position).join(" → ");
    }
    if (typeof answer === "number") return question?.choices?.[answer] ?? String(answer);
    return answer;
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <h2 className="text-lg font-semibold">{t("assignments.grading.attempts")}</h2>
        {!attempts || attempts.length === 0 ? (
          <p className="text-sm text-cova-mute">{t("assignments.grading.noAttempts")}</p>
        ) : (
          <ul className="space-y-3">
            {attempts.map((attempt) => {
              const isOpen = expanded === attempt.id;
              const durationMinutes = attempt.submitted_at
                ? Math.max(1, Math.round((Date.parse(attempt.submitted_at) - Date.parse(attempt.started_at)) / 60000))
                : null;
              return (
                <li key={attempt.id} className="rounded-xl border border-cova-line">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : attempt.id)}
                    aria-expanded={isOpen}
                    className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-start"
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{attempt.display_name}</span>
                        <Badge tone={attempt.status === "graded" ? "soft" : attempt.status === "submitted" ? "pale" : "outline"}>
                          {t(`assignments.status.${attempt.status === "submitted" ? "submitted" : attempt.status === "graded" ? "graded" : "in-progress"}` as never)}
                        </Badge>
                        {attempt.score !== null && <span className="text-sm font-medium">{attempt.score} / {points}</span>}
                      </span>
                      <span className="mt-1 block text-xs text-cova-mute">
                        {t("assignments.grading.attemptN", { number: attempt.attempt_number })}
                        {attempt.submitted_at && ` · ${new Date(attempt.submitted_at).toLocaleString()}`}
                        {durationMinutes && ` · ${t("assignments.grading.duration", { minutes: durationMinutes })}`}
                      </span>
                    </span>
                    {isOpen ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                  </button>
                  {isOpen && (
                    <div className="space-y-4 border-t border-cova-line p-4">
                      <ol className="space-y-3">
                        {questions.map((question, index) => (
                          <li key={index} className="text-sm">
                            <p className="font-medium">{index + 1}. {question.prompt}</p>
                            <p className="mt-1 whitespace-pre-wrap text-cova-mute">
                              {renderAnswer(question, attempt.answers[index] ?? null)}
                            </p>
                          </li>
                        ))}
                      </ol>
                      {attempt.status !== "in_progress" && (
                        <form className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end" onSubmit={(event) => void saveGrade(event, attempt)}>
                          <TextField
                            id={`attempt-score-${attempt.id}`}
                            type="number"
                            label={t("assignments.detail.gradeLabel", { points })}
                            value={scores[attempt.id] ?? (attempt.score !== null ? String(attempt.score) : "")}
                            onChange={(event) => setScores((current) => ({ ...current, [attempt.id]: event.target.value }))}
                            min={0}
                            max={points}
                            step="0.01"
                          />
                          <TextAreaField
                            id={`attempt-feedback-${attempt.id}`}
                            label={t("assignments.detail.feedbackLabel")}
                            value={feedbacks[attempt.id] ?? attempt.feedback ?? ""}
                            onChange={(event) => setFeedbacks((current) => ({ ...current, [attempt.id]: event.target.value }))}
                            rows={2}
                          />
                          <Button type="submit" disabled={savingId === attempt.id}>
                            {savingId === attempt.id ? t("assignments.detail.savingGrade") : t("assignments.detail.saveGrade")}
                          </Button>
                        </form>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
