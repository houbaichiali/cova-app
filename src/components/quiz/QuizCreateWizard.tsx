"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  ListChecks,
  Plus,
  Radio,
  Settings2,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FieldShell, TextAreaField, TextField } from "@/components/ui/FormField";
import { Switch } from "@/components/ui/Switch";
import { api, getMe } from "@/components/quiz/quiz-client";
import { getSupabase } from "@/lib/supabase/client";
import { useT } from "@/i18n/client";
import { useToast } from "@/components/ui/Toast";
import type { MessageKey } from "@/i18n/translate";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  "Science",
  "Mathematics",
  "Technology",
  "History",
  "Languages",
  "Geography",
  "General Knowledge",
  "Business",
  "Other",
] as const;

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

const QUESTION_COUNTS = [5, 10, 15, 20];
const TIMES = [10, 20, 30, 60];
const STEPS = ["stepInfo", "stepSettings", "stepAdvanced", "stepQuestions"] as const;

type QuestionType = "choice" | "tf" | "multiple";

interface QuestionDraft {
  id: string;
  type: QuestionType;
  text: string;
  choices: string[];
  correct: number[];
  seconds: number | null;
}

function newQuestion(type: QuestionType): QuestionDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    text: "",
    choices: type === "tf" ? ["True", "False"] : ["", "", "", ""],
    correct: [],
    seconds: null,
  };
}

interface SavedQuiz {
  id: string;
  pin: string;
  title: string;
}

export function QuizCreateWizard() {
  const t = useT();
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("General Knowledge");
  const [mode, setMode] = useState<"live" | "challenge" | "solo">("live");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [targetCount, setTargetCount] = useState(10);
  const [timePerQuestion, setTimePerQuestion] = useState(20);
  const [scoring, setScoring] = useState<"standard" | "fixed">("standard");
  const [deadline, setDeadline] = useState("");
  const [randomize, setRandomize] = useState(false);
  const [nicknames, setNicknames] = useState(true);
  const [music, setMusic] = useState(false);
  const [questions, setQuestions] = useState<QuestionDraft[]>([newQuestion("choice")]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedQuiz | null>(null);
  const [hosting, setHosting] = useState(false);

  const stepTitles = useMemo(
    () => STEPS.map((key) => t(`quiz.${key}` as MessageKey)),
    [t],
  );

  const updateQuestion = useCallback((id: string, patch: Partial<QuestionDraft>) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }, []);

  function moveQuestion(index: number, delta: -1 | 1) {
    setQuestions((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      const a = next[index] as QuestionDraft;
      const b = next[target] as QuestionDraft;
      next[index] = b;
      next[target] = a;
      return next;
    });
  }

  function validateStep(current: number): string | null {
    if (current === 0 && !title.trim()) return t("quiz.needTitle");
    if (current === 3) {
      if (questions.length === 0) return t("quiz.needQuestion");
      for (const q of questions) {
        const emptyChoice = q.type !== "tf" && q.choices.some((choice) => !choice.trim());
        if (!q.text.trim() || q.correct.length === 0 || emptyChoice) return t("quiz.needAnswer");
      }
    }
    return null;
  }

  function goNext() {
    const problem = validateStep(step);
    setValidation(problem);
    if (problem) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function buildQuestionsJson() {
    return questions.map((q) => {
      const base: Record<string, unknown> = {
        q: q.text.trim(),
        choices: q.type === "tf" ? ["True", "False"] : q.choices.map((c) => c.trim()),
        correct: q.type === "multiple" ? [...q.correct].sort((a, b) => a - b) : q.correct[0],
      };
      if (q.type === "multiple") base.multiple = true;
      if (q.seconds !== null) base.seconds = q.seconds;
      return base;
    });
  }

  async function save(): Promise<SavedQuiz | null> {
    const problem = validateStep(3);
    setValidation(problem);
    if (problem) return null;
    setSaving(true);
    try {
      const me = await getMe();
      if (!me) {
        toast.push(t("quiz.errorSignIn"));
        return null;
      }
      const supabase = getSupabase();
      const payload = {
        title: title.trim(),
        description: description.trim(),
        category,
        mode,
        visibility,
        question_count: questions.length,
        time_per_question: timePerQuestion,
        scoring,
        randomize,
        nicknames,
        music,
        questions: buildQuestionsJson(),
        deadline: mode === "challenge" && deadline ? new Date(deadline).toISOString() : null,
      };
      // A fresh random join code; retries if another quiz already owns it.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const pin = String(Math.floor(100000 + Math.random() * 900000));
        const { data, error } = await supabase
          .from("quizzes")
          .insert({ ...payload, pin })
          .select("id,pin,title")
          .single();
        if (!error && data) {
          toast.push(t("quiz.quizSaved"));
          return data as unknown as SavedQuiz;
        }
        const duplicatePin = error?.message.includes("quizzes_pin_key");
        if (!duplicatePin) {
          toast.push(error?.message || t("quiz.errorGeneric"));
          return null;
        }
      }
      toast.push(t("quiz.errorGeneric"));
      return null;
    } catch {
      toast.push(t("quiz.errorGeneric"));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    const result = await save();
    if (result) setSaved(result);
  }

  async function handleHostNow() {
    if (!saved) return;
    setHosting(true);
    const res = await api<{ pin?: string; error?: string }>(`/api/quiz/session/${saved.pin}`, {
      method: "PUT",
      body: JSON.stringify({ quizId: saved.id }),
    });
    setHosting(false);
    if (res.ok && res.data.pin) router.push(`/quiz/play/${res.data.pin}`);
    else toast.push(t("quiz.errorGeneric"));
  }

  // ------------------------------------------------------------ saved view
  if (saved) {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <CardBody className="space-y-5 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cova-pale text-cova-ink">
              <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
            </span>
            <h1 className="text-2xl font-semibold text-cova-ink">{t("quiz.quizCreated")}</h1>
            <p className="text-lg font-semibold text-cova-ink">{saved.title}</p>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-cova-mute">
                {t("quiz.pinLabel")}
              </p>
              <p className="text-3xl font-bold tracking-[0.25em] text-cova-ink">{saved.pin}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => void handleHostNow()} disabled={hosting}>
                <Radio className="h-4 w-4" aria-hidden="true" />
                {hosting ? t("quiz.loading") : t("quiz.hostNow")}
              </Button>
              <Link href="/quiz">
                <Button variant="secondary" className="w-full">
                  {t("quiz.backToDashboard")}
                </Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  // -------------------------------------------------------------- wizard
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* stepper */}
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {STEPS.map((key, index) => (
          <li key={key} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                index === step
                  ? "bg-cova-soft text-cova-ink"
                  : index < step
                    ? "bg-cova-pale text-cova-ink"
                    : "bg-cova-bg text-cova-mute",
              )}
            >
              {index < step ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
            </span>
            <span className={cn("font-medium", index === step ? "text-cova-ink" : "text-cova-mute")}>
              {stepTitles[index]}
            </span>
            {index < STEPS.length - 1 && <span className="text-cova-line">→</span>}
          </li>
        ))}
      </ol>

      {validation && (
        <p role="alert" className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-800">
          {validation}
        </p>
      )}

      {/* step 1 — basic information */}
      {step === 0 && (
        <Card>
          <CardHeader title={t("quiz.stepInfo")} />
          <CardBody className="space-y-4">
            <TextField
              id="quiz-title"
              label={t("quiz.titleLabel")}
              value={title}
              maxLength={200}
              placeholder={t("quiz.titlePlaceholder")}
              onChange={(e) => setTitle(e.target.value)}
            />
            <TextAreaField
              id="quiz-description"
              label={t("quiz.descriptionLabel")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <FieldShell id="quiz-category" label={t("quiz.categoryLabel")}>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                      category === cat
                        ? "bg-cova-soft text-cova-ink"
                        : "bg-cova-bg text-cova-mute hover:text-cova-ink",
                    )}
                  >
                    {t(CATEGORY_KEYS[cat] ?? "quiz.cat.Other")}
                  </button>
                ))}
              </div>
            </FieldShell>
          </CardBody>
        </Card>
      )}

      {/* step 2 — game settings */}
      {step === 1 && (
        <Card>
          <CardHeader title={t("quiz.stepSettings")} />
          <CardBody className="space-y-5">
            <FieldShell id="quiz-mode" label={t("quiz.modeLabel")}>
              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    { value: "live", titleKey: "quiz.modeLive", descKey: "quiz.modeLiveDesc" },
                    { value: "challenge", titleKey: "quiz.modeChallenge", descKey: "quiz.modeChallengeDesc" },
                    { value: "solo", titleKey: "quiz.modeSolo", descKey: "quiz.modeSoloDesc" },
                  ] as const
                ).map(({ value, titleKey, descKey }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    aria-pressed={mode === value}
                    className={cn(
                      "rounded-xl border p-3 text-start transition-colors",
                      mode === value
                        ? "border-cova-muted bg-cova-pale"
                        : "border-cova-line bg-white hover:bg-cova-bg",
                    )}
                  >
                    <p className="text-sm font-semibold text-cova-ink">{t(titleKey)}</p>
                    <p className="mt-1 text-xs text-cova-mute">{t(descKey)}</p>
                  </button>
                ))}
              </div>
            </FieldShell>

            <FieldShell id="quiz-visibility" label={t("quiz.visibilityLabel")}>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    { value: "public", titleKey: "quiz.visibilityPublic", descKey: "quiz.visibilityPublicDesc" },
                    { value: "private", titleKey: "quiz.visibilityPrivate", descKey: "quiz.visibilityPrivateDesc" },
                  ] as const
                ).map(({ value, titleKey, descKey }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setVisibility(value)}
                    aria-pressed={visibility === value}
                    className={cn(
                      "rounded-xl border p-3 text-start transition-colors",
                      visibility === value
                        ? "border-cova-muted bg-cova-pale"
                        : "border-cova-line bg-white hover:bg-cova-bg",
                    )}
                  >
                    <p className="text-sm font-semibold text-cova-ink">{t(titleKey)}</p>
                    <p className="mt-1 text-xs text-cova-mute">{t(descKey)}</p>
                  </button>
                ))}
              </div>
            </FieldShell>

            <FieldShell id="quiz-count" label={t("quiz.questionCountLabel")}>
              <div className="flex flex-wrap gap-1.5">
                {QUESTION_COUNTS.map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setTargetCount(count)}
                    aria-pressed={targetCount === count}
                    className={cn(
                      "h-10 w-14 rounded-lg border text-sm font-semibold transition-colors",
                      targetCount === count
                        ? "border-cova-muted bg-cova-soft text-cova-ink"
                        : "border-cova-line bg-white text-cova-mute hover:bg-cova-bg",
                    )}
                  >
                    {count}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-cova-mute">
                {questions.length}/{targetCount} {t("quiz.questions")}
              </p>
            </FieldShell>

            <FieldShell id="quiz-time" label={t("quiz.timePerQuestionLabel")}>
              <div className="flex flex-wrap gap-1.5">
                {TIMES.map((time) => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => setTimePerQuestion(time)}
                    aria-pressed={timePerQuestion === time}
                    className={cn(
                      "h-10 w-16 rounded-lg border text-sm font-semibold transition-colors",
                      timePerQuestion === time
                        ? "border-cova-muted bg-cova-soft text-cova-ink"
                        : "border-cova-line bg-white text-cova-mute hover:bg-cova-bg",
                    )}
                  >
                    {time}s
                  </button>
                ))}
              </div>
            </FieldShell>

            <FieldShell id="quiz-scoring" label={t("quiz.scoringLabel")}>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    { value: "standard", titleKey: "quiz.scoringStandard", descKey: "quiz.scoringStandardDesc" },
                    { value: "fixed", titleKey: "quiz.scoringFixed", descKey: "quiz.scoringFixedDesc" },
                  ] as const
                ).map(({ value, titleKey, descKey }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setScoring(value)}
                    aria-pressed={scoring === value}
                    className={cn(
                      "rounded-xl border p-3 text-start transition-colors",
                      scoring === value
                        ? "border-cova-muted bg-cova-pale"
                        : "border-cova-line bg-white hover:bg-cova-bg",
                    )}
                  >
                    <p className="text-sm font-semibold text-cova-ink">{t(titleKey)}</p>
                    <p className="mt-1 text-xs text-cova-mute">{t(descKey)}</p>
                  </button>
                ))}
              </div>
            </FieldShell>

            {mode === "challenge" && (
              <TextField
                id="quiz-deadline"
                label={t("quiz.deadlineLabel")}
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            )}
          </CardBody>
        </Card>
      )}

      {/* step 3 — advanced settings */}
      {step === 2 && (
        <Card>
          <CardHeader title={t("quiz.stepAdvanced")} />
          <CardBody className="divide-y divide-cova-line">
            <Switch
              checked={randomize}
              onChange={setRandomize}
              label={t("quiz.randomize")}
            />
            <Switch
              checked={nicknames}
              onChange={setNicknames}
              label={t("quiz.nicknames")}
            />
            <Switch checked={music} onChange={setMusic} label={t("quiz.music")} description={t("quiz.musicHint")} />
          </CardBody>
        </Card>
      )}

      {/* step 4 — question builder */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="inline-flex items-center gap-2 text-base font-semibold text-cova-ink">
              <ListChecks className="h-4 w-4 text-cova-muted" aria-hidden="true" />
              {t("quiz.stepQuestions")} ({questions.length}/{targetCount})
            </h2>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPreviewOpen((v) => !v)}>
                {previewOpen ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
                {t("quiz.preview")}
              </Button>
              <Button size="sm" onClick={() => setQuestions((prev) => [...prev, newQuestion("choice")])}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("quiz.addQuestion")}
              </Button>
            </div>
          </div>

          {previewOpen && (
            <Card className="border-dashed">
              <CardHeader title={t("quiz.preview")} />
              <CardBody>
                <ol className="space-y-2 text-sm">
                  {questions.map((q, index) => (
                    <li key={q.id} className="text-cova-ink">
                      <span className="font-semibold">{index + 1}.</span> {q.text || "—"}
                      <span className="ms-2 text-xs text-cova-mute">
                        [{q.type === "tf" ? t("quiz.typeTrueFalse") : q.type === "multiple" ? t("quiz.typeMultiple") : t("quiz.typeChoice")}]
                      </span>
                    </li>
                  ))}
                </ol>
              </CardBody>
            </Card>
          )}

          {questions.map((q, index) => (
            <QuestionEditor
              key={q.id}
              draft={q}
              index={index}
              total={questions.length}
              onChange={(patch) => updateQuestion(q.id, patch)}
              onDelete={() => setQuestions((prev) => prev.filter((x) => x.id !== q.id))}
              onMove={(delta) => moveQuestion(index, delta)}
            />
          ))}
        </div>
      )}

      {/* navigation */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            setValidation(null);
            setStep((s) => Math.max(s - 1, 0));
          }}
          disabled={step === 0}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("quiz.back")}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={goNext}>
            {t("quiz.next")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button onClick={() => void handleSave()} disabled={saving}>
            <Check className="h-4 w-4" aria-hidden="true" />
            {saving ? t("quiz.saving") : t("quiz.saveQuiz")}
          </Button>
        )}
      </div>
    </div>
  );
}

function QuestionEditor({
  draft,
  index,
  total,
  onChange,
  onDelete,
  onMove,
}: {
  draft: QuestionDraft;
  index: number;
  total: number;
  onChange: (patch: Partial<QuestionDraft>) => void;
  onDelete: () => void;
  onMove: (delta: -1 | 1) => void;
}) {
  const t = useT();
  const types: Array<{ value: QuestionType; label: string }> = [
    { value: "choice", label: t("quiz.typeChoice") },
    { value: "tf", label: t("quiz.typeTrueFalse") },
    { value: "multiple", label: t("quiz.typeMultiple") },
  ];

  function setType(type: QuestionType) {
    if (type === draft.type) return;
    if (type === "tf") {
      onChange({ type, choices: ["True", "False"], correct: draft.correct.includes(0) ? [0] : [] });
    } else {
      onChange({
        type,
        choices: draft.type === "tf" ? ["", "", "", ""] : draft.choices,
        correct: draft.correct.slice(0, 1),
      });
    }
  }

  function toggleCorrect(index: number) {
    if (draft.type === "multiple") {
      onChange({
        correct: draft.correct.includes(index)
          ? draft.correct.filter((x) => x !== index)
          : [...draft.correct, index],
      });
    } else {
      onChange({ correct: [index] });
    }
  }

  return (
    <Card>
      <CardHeader
        title={`${t("quiz.questionOf", { n: index + 1, total })}`}
        action={
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => onMove(-1)} disabled={index === 0} aria-label={t("quiz.moveUp")}>
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onMove(1)}
              disabled={index === total - 1}
              aria-label={t("quiz.moveDown")}
            >
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete} aria-label={t("quiz.deleteQuestion")}>
              <Trash2 className="h-4 w-4 text-red-800" aria-hidden="true" />
            </Button>
          </div>
        }
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {types.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              aria-pressed={draft.type === value}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                draft.type === value ? "bg-cova-soft text-cova-ink" : "bg-cova-bg text-cova-mute hover:text-cova-ink",
              )}
            >
              {label}
            </button>
          ))}
          {draft.type === "multiple" && <Badge tone="outline">{t("quiz.multipleHint")}</Badge>}
        </div>

        <TextAreaField
          id={`q-${draft.id}-text`}
          label={t("quiz.questionTextLabel")}
          value={draft.text}
          placeholder={t("quiz.questionTextPlaceholder")}
          onChange={(e) => onChange({ text: e.target.value })}
        />

        <FieldShell id={`q-${draft.id}-answers`} label={t("quiz.answersLabel")}>
          <div className="space-y-2">
            {draft.choices.map((choice, choiceIndex) => (
              <div key={choiceIndex} className="flex items-center gap-2">
                <button
                  type="button"
                  role={draft.type === "multiple" ? "checkbox" : "radio"}
                  aria-checked={draft.correct.includes(choiceIndex)}
                  aria-label={`${t("quiz.answersLabel")} ${choiceIndex + 1}`}
                  onClick={() => toggleCorrect(choiceIndex)}
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
                    draft.correct.includes(choiceIndex)
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-cova-line bg-white text-cova-mute hover:border-cova-muted",
                  )}
                >
                  {draft.correct.includes(choiceIndex) ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    String.fromCharCode(65 + choiceIndex)
                  )}
                </button>
                {draft.type === "tf" ? (
                  <div className="flex h-10 flex-1 items-center rounded-lg border border-cova-line bg-cova-bg px-3 text-sm text-cova-ink">
                    {choiceIndex === 0 ? t("quiz.trueLabel") : t("quiz.falseLabel")}
                  </div>
                ) : (
                  <input
                    value={choice}
                    onChange={(e) => {
                      const next = [...draft.choices];
                      next[choiceIndex] = e.target.value;
                      onChange({ choices: next });
                    }}
                    maxLength={120}
                    className="h-10 w-full rounded-lg border border-cova-line bg-white px-3 text-sm text-cova-ink placeholder:text-cova-mute"
                    placeholder={`${String.fromCharCode(65 + choiceIndex)}`}
                  />
                )}
              </div>
            ))}
          </div>
        </FieldShell>

        <FieldShell id={`q-${draft.id}-seconds`} label={t("quiz.questionTimerLabel")}>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onChange({ seconds: null })}
              aria-pressed={draft.seconds === null}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors",
                draft.seconds === null
                  ? "border-cova-muted bg-cova-soft text-cova-ink"
                  : "border-cova-line bg-white text-cova-mute hover:bg-cova-bg",
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              {t("quiz.timePerQuestionLabel")}
            </button>
            {[10, 20, 30, 60].map((seconds) => (
              <button
                key={seconds}
                type="button"
                onClick={() => onChange({ seconds })}
                aria-pressed={draft.seconds === seconds}
                className={cn(
                  "h-9 w-14 rounded-lg border text-xs font-semibold transition-colors",
                  draft.seconds === seconds
                    ? "border-cova-muted bg-cova-soft text-cova-ink"
                    : "border-cova-line bg-white text-cova-mute hover:bg-cova-bg",
                )}
              >
                {seconds}s
              </button>
            ))}
          </div>
        </FieldShell>

        <p className="inline-flex items-center gap-1.5 text-xs text-cova-mute">
          <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
          {draft.type === "tf"
            ? `${t("quiz.trueLabel")} / ${t("quiz.falseLabel")}`
            : draft.type === "multiple"
              ? t("quiz.typeMultiple")
              : t("quiz.typeChoice")}
        </p>
      </CardBody>
    </Card>
  );
}
