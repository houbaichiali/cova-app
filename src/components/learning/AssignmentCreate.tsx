"use client";

import { useMemo, useState, type FormEvent } from "react";
import { FileUp, Gamepad2, Paperclip, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { TextAreaField, TextField } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import type { ChallengeType } from "@/data/challenges";

const ATTACHMENT_BUCKET = "assignment-attachments";

export interface CourseOption {
  id: string;
  title: string;
}

type ExerciseBlock = {
  id: string;
  type: ChallengeType;
  prompt: string;
  optionsText: string;
  correctIndex: number;
  multiple: boolean;
  correctIndexes: number[];
  pairsText: string;
  language: string;
  starterCode: string;
  expectedAnswer: string;
  answerVariants: string;
};

function newExercise(): ExerciseBlock {
  return {
    id: crypto.randomUUID(),
    type: "quiz",
    prompt: "",
    optionsText: "",
    correctIndex: 0,
    multiple: false,
    correctIndexes: [],
    pairsText: "",
    language: "python",
    starterCode: "",
    expectedAnswer: "",
    answerVariants: "",
  };
}

const SUBMISSION_FORMATS = ["PDF", "DOC/DOCX", "ZIP", "Images", "Other"] as const;

/**
 * "Create Assignment" flow: pick External (file drop) or Interactive (in-COVA
 * exam builder), fill the shared details, then save as draft or publish.
 */
export function AssignmentCreate({
  open,
  onClose,
  courses,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  courses: CourseOption[];
  onCreated: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [step, setStep] = useState<"choose" | "form">("choose");
  const [mode, setMode] = useState<"external" | "interactive">("external");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [level, setLevel] = useState("");
  const [courseId, setCourseId] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
  const [sectionTitle, setSectionTitle] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [availableFrom, setAvailableFrom] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [points, setPoints] = useState(100);

  const [formats, setFormats] = useState<string[]>(["PDF"]);
  const [maxFileMb, setMaxFileMb] = useState(20);
  const [submissionInstructions, setSubmissionInstructions] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);

  const [exercises, setExercises] = useState<ExerciseBlock[]>([newExercise()]);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState("");
  const [attemptsAllowed, setAttemptsAllowed] = useState(1);
  const [randomize, setRandomize] = useState(false);
  const [showResults, setShowResults] = useState(true);
  const [allowReview, setAllowReview] = useState(true);

  const totalPoints = useMemo(
    () => (mode === "interactive" ? exercises.reduce((sum, e) => sum + exercisePoints(e), 0) : points),
    [mode, exercises, points],
  );
  const questionCount = useMemo(
    () => (mode === "interactive" ? exercises.reduce((sum, e) => sum + exerciseQuestionCount(e), 0) : 0),
    [mode, exercises],
  );

  function reset() {
    setStep("choose");
    setTitle("");
    setSummary("");
    setDescription("");
    setCategory("");
    setSubject("");
    setLevel("");
    setCourseId("");
    setLessonTitle("");
    setSectionTitle("");
    setDifficulty("");
    setEstimatedMinutes("");
    setAvailableFrom("");
    setDueAt("");
    setPoints(100);
    setFormats(["PDF"]);
    setMaxFileMb(20);
    setSubmissionInstructions("");
    setAttachment(null);
    setExercises([newExercise()]);
    setTimeLimitMinutes("");
    setAttemptsAllowed(1);
    setRandomize(false);
    setShowResults(true);
    setAllowReview(true);
  }

  function close() {
    if (saving) return;
    setConfirmOpen(false);
    onClose();
    reset();
  }

  async function create(publish: boolean) {
    if (saving) return;
    const supabase = getSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) {
      toast.push(t("assignments.create.needSignin"));
      return;
    }
    if (title.trim().length < 3) {
      toast.push(t("assignments.create.titleMin"));
      return;
    }
    if (!courseId) {
      toast.push(t("assignments.create.courseRequired"));
      return;
    }
    const due = new Date(dueAt).getTime();
    if (publish && (!due || due <= Date.now())) {
      toast.push(t("assignments.deadlineFutureError"));
      return;
    }
    if (attachment && attachment.size > maxFileMb * 1024 * 1024) {
      toast.push(t("assignments.fileSizeError"));
      return;
    }

    const questions: Array<Record<string, unknown>> = [];
    const answerKey: Array<number | number[] | string | null> = [];
    if (mode === "interactive") {
      for (const exercise of exercises) {
        const built = buildExercise(exercise);
        questions.push(...built.questions);
        answerKey.push(...built.key);
      }
      if (questions.length === 0) {
        toast.push(t("assignments.create.exerciseRequired"));
        return;
      }
    }

    setSaving(true);
    const assignmentId = crypto.randomUUID();
    let uploadedPath: string | null = null;
    try {
      const exerciseTypes = mode === "interactive" ? [...new Set(exercises.map((e) => e.type))] : [];
      const { error } = await supabase
        .from("assignments")
        .insert({
          id: assignmentId,
          course_id: courseId,
          created_by: userId,
          title: title.trim(),
          description: description.trim(),
          due_at: publish ? new Date(dueAt).toISOString() : dueAt ? new Date(dueAt).toISOString() : null,
          points: Math.max(1, totalPoints),
          kind: exerciseTypes.includes("coding") ? "coding" : "general",
          exercise_type: mode === "interactive" ? (exerciseTypes.length === 1 ? exerciseTypes[0] : "mixed") : "file",
          questions: mode === "interactive" ? questions : [],
          mode,
          status: publish ? "published" : "draft",
          summary: summary.trim(),
          category: category.trim(),
          subject: subject.trim(),
          level: level.trim(),
          difficulty: difficulty || null,
          estimated_minutes: estimatedMinutes ? Number(estimatedMinutes) : null,
          available_from: availableFrom ? new Date(availableFrom).toISOString() : null,
          submission_formats: mode === "external" ? formats : [],
          max_file_mb: mode === "external" ? maxFileMb : null,
          submission_instructions: submissionInstructions.trim(),
          lesson_title: lessonTitle.trim(),
          section_title: sectionTitle.trim(),
          time_limit_minutes: mode === "interactive" && timeLimitMinutes ? Number(timeLimitMinutes) : null,
          attempts_allowed: mode === "interactive" ? attemptsAllowed : 1,
          randomize_questions: mode === "interactive" ? randomize : false,
          show_results_immediately: mode === "interactive" ? showResults : true,
          allow_review: mode === "interactive" ? allowReview : true,
        });
      if (error) throw error;

      if (mode === "interactive" && answerKey.some((key) => key !== null)) {
        const { error: keyError } = await supabase
          .from("assignment_answer_keys")
          .insert({ assignment_id: assignmentId, answer_key: answerKey });
        if (keyError) throw keyError;
      }

      const file = mode === "external" ? attachment : null;
      if (file) {
        const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, "-");
        uploadedPath = `${userId}/${assignmentId}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from(ATTACHMENT_BUCKET)
          .upload(uploadedPath, file, { contentType: file.type || "application/octet-stream", upsert: false });
        if (uploadError) throw uploadError;
        const pathColumn = mode === "external" ? "attachment_path" : "thumbnail_path";
        const nameColumn = mode === "external" ? "attachment_name" : null;
        const { error: updateError } = await supabase.from("assignments").update(
          nameColumn ? { [pathColumn]: uploadedPath, [nameColumn]: file.name } : { [pathColumn]: uploadedPath },
        ).eq("id", assignmentId);
        if (updateError) throw updateError;
      }

      toast.push(publish ? t("assignments.create.published") : t("assignments.create.draftSaved"));
      onCreated();
      close();
    } catch (error) {
      console.error("Unable to create the assignment:", error);
      if (uploadedPath) {
        try {
          await supabase.storage.from(ATTACHMENT_BUCKET).remove([uploadedPath]);
        } catch {
          // The orphan file is harmless; the row is the source of truth.
        }
      }
      try {
        await supabase.from("assignments").delete().eq("id", assignmentId);
      } catch {
        // Same: leave nothing half-cleaned silently fails only in the worst case.
      }
      toast.push(t("assignments.createError"));
    } finally {
      setSaving(false);
    }
  }

  function submitExternal(event: FormEvent) {
    event.preventDefault();
    setMode("external");
    setConfirmOpen(true);
  }

  if (step === "choose") {
    return (
      <Modal open={open} onClose={close} title={t("assignments.create.title")} description={t("assignments.create.chooseDescription")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <button type="button" onClick={() => { setMode("external"); setStep("form"); }}
            className="flex flex-col items-start gap-3 rounded-xl border-2 border-cova-line p-5 text-start transition-colors hover:border-cova-muted hover:bg-cova-pale/40">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-cova-pale">
              <FileUp className="h-5 w-5 text-cova-muted" aria-hidden="true" />
            </span>
            <span className="font-semibold">{t("assignments.create.externalTitle")}</span>
            <span className="text-sm text-cova-mute">{t("assignments.create.externalDescription")}</span>
          </button>
          <button type="button" onClick={() => { setMode("interactive"); setStep("form"); }}
            className="flex flex-col items-start gap-3 rounded-xl border-2 border-cova-line p-5 text-start transition-colors hover:border-cova-muted hover:bg-cova-pale/40">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-cova-pale">
              <Gamepad2 className="h-5 w-5 text-cova-muted" aria-hidden="true" />
            </span>
            <span className="font-semibold">{t("assignments.create.interactiveTitle")}</span>
            <span className="text-sm text-cova-mute">{t("assignments.create.interactiveDescription")}</span>
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <>
      <Modal open={open} onClose={close} title={mode === "external" ? t("assignments.create.externalTitle") : t("assignments.create.interactiveTitle")}>
        <form onSubmit={mode === "external" ? submitExternal : (event) => { event.preventDefault(); setConfirmOpen(true); }} className="space-y-5">
          <Card>
            <CardBody className="space-y-4">
              <h3 className="text-sm font-semibold">{t("assignments.create.sectionGeneral")}</h3>
              <TextField id="create-title" label={t("assignments.titleLabel")} value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} />
              <TextField id="create-summary" label={t("assignments.create.summary")} value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={200} />
              <TextAreaField id="create-description" label={t("assignments.instructionsLabel")} value={description} onChange={(event) => setDescription(event.target.value)} required maxLength={10000} />
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField id="create-category" label={t("assignments.create.category")} value={category} onChange={(event) => setCategory(event.target.value)} />
                <TextField id="create-subject" label={t("assignments.create.subject")} value={subject} onChange={(event) => setSubject(event.target.value)} />
                <TextField id="create-level" label={t("assignments.create.level")} value={level} onChange={(event) => setLevel(event.target.value)} />
              </div>
              <div>
                <label htmlFor="create-course" className="mb-1.5 block text-sm font-medium">{t("assignments.courseLabel")}</label>
                <select id="create-course" value={courseId} onChange={(event) => setCourseId(event.target.value)} required className="h-10 w-full rounded-lg border border-cova-line bg-white px-3 text-sm">
                  <option value="">{t("assignments.coursePlaceholder")}</option>
                  {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField id="create-lesson" label={t("assignments.create.lesson")} value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} />
                <TextField id="create-section" label={t("assignments.create.section")} value={sectionTitle} onChange={(event) => setSectionTitle(event.target.value)} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-4">
              <h3 className="text-sm font-semibold">{t("assignments.create.sectionParams")}</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                {mode === "external" && (
                  <TextField id="create-points" type="number" label={t("assignments.pointsLabel")} value={points} onChange={(event) => setPoints(Number(event.target.value))} min={1} max={10000} required />
                )}
                {mode === "interactive" && (
                  <TextField id="create-total" type="number" label={t("assignments.create.totalPoints")} value={totalPoints} readOnly />
                )}
                <div>
                  <label htmlFor="create-difficulty" className="mb-1.5 block text-sm font-medium">{t("assignments.create.difficulty")}</label>
                  <select id="create-difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="h-10 w-full rounded-lg border border-cova-line bg-white px-3 text-sm">
                    <option value="">{t("assignments.create.none")}</option>
                    <option value="easy">{t("assignments.create.easy")}</option>
                    <option value="medium">{t("assignments.create.medium")}</option>
                    <option value="hard">{t("assignments.create.hard")}</option>
                  </select>
                </div>
                <TextField id="create-duration" type="number" label={t("assignments.create.estimatedDuration")} value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(event.target.value)} min={1} max={10000} />
              </div>
              {mode === "interactive" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField id="create-time-limit" type="number" label={t("assignments.create.timeLimit")} hint={t("assignments.create.timeLimitHint")} value={timeLimitMinutes} onChange={(event) => setTimeLimitMinutes(event.target.value)} min={1} max={600} />
                  <TextField id="create-attempts" type="number" label={t("assignments.create.attempts")} value={attemptsAllowed} onChange={(event) => setAttemptsAllowed(Math.max(1, Math.min(10, Number(event.target.value) || 1)))} min={1} max={10} required />
                </div>
              )}
            </CardBody>
          </Card>

          {mode === "interactive" && (
            <Card>
              <CardBody className="space-y-3">
                <h3 className="text-sm font-semibold">{t("assignments.create.exercises")}</h3>
                {exercises.map((exercise, index) => {
                  const choices = exercise.optionsText.split("\n").filter((line) => line.trim());
                  const update = (patch: Partial<ExerciseBlock>) => setExercises((current) => current.map((item) => item.id === exercise.id ? { ...item, ...patch } : item));
                  const toggleCorrect = (choiceIndex: number) =>
                    update({
                      correctIndexes: exercise.correctIndexes.includes(choiceIndex)
                        ? exercise.correctIndexes.filter((value) => value !== choiceIndex)
                        : [...exercise.correctIndexes, choiceIndex].sort((a, b) => a - b),
                    });
                  return (
                    <div key={exercise.id} className="space-y-3 rounded-xl border border-cova-line p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">
                          {t("assignments.create.exerciseNumber", { number: index + 1 })} · {exercisePoints(exercise)} {t("assignments.pointsShort")}
                        </p>
                        {exercises.length > 1 && (
                          <Button type="button" size="sm" variant="ghost" onClick={() => setExercises((current) => current.filter((item) => item.id !== exercise.id))} aria-label={t("assignments.create.removeExercise")}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                      <label className="block text-sm font-medium">
                        {t("challenges.exerciseType")}
                        <select value={exercise.type} onChange={(event) => update({ type: event.target.value as ChallengeType })} className="mt-1.5 h-10 w-full rounded-lg border border-cova-line bg-white px-3 text-sm">
                          {(["quiz", "matching", "intruder", "ordering", "written", "coding"] as const).map((item) => (
                            <option key={item} value={item}>{t(`challenges.type.${item}` as never)}</option>
                          ))}
                        </select>
                      </label>
                      {exercise.type === "matching" ? (
                        <TextAreaField id={`${exercise.id}-pairs`} label={t("challenges.matchingPairs")} hint={t("challenges.matchingHint")} placeholder={t("challenges.matchingPlaceholder")} value={exercise.pairsText} onChange={(event) => update({ pairsText: event.target.value })} required />
                      ) : (
                        <TextAreaField id={`${exercise.id}-prompt`} label={t("challenges.questionLabel")} value={exercise.prompt} onChange={(event) => update({ prompt: event.target.value })} required />
                      )}
                      {["quiz", "intruder", "ordering"].includes(exercise.type) && (
                        <>
                          <TextAreaField id={`${exercise.id}-options`} label={exercise.type === "ordering" ? t("challenges.stepsLabel") : t("challenges.optionsLabel")} hint={exercise.type === "ordering" ? t("challenges.orderHint") : t("challenges.optionsHint")} value={exercise.optionsText} onChange={(event) => update({ optionsText: event.target.value })} required />
                          {exercise.type === "quiz" && (
                            <label className="flex items-center gap-2 text-sm font-medium">
                              <input type="checkbox" checked={exercise.multiple} onChange={(event) => update({ multiple: event.target.checked, correctIndexes: [] })} className="h-4 w-4" />
                              {t("assignments.create.multipleAnswers")}
                            </label>
                          )}
                          {exercise.type === "quiz" && exercise.multiple ? (
                            <fieldset className="space-y-1.5">
                              <legend className="text-sm font-medium">{t("assignments.create.correctChoices")}</legend>
                              {choices.map((choice, choiceIndex) => (
                                <label key={choiceIndex} className="flex items-center gap-2 text-sm">
                                  <input type="checkbox" checked={exercise.correctIndexes.includes(choiceIndex)} onChange={() => toggleCorrect(choiceIndex)} className="h-4 w-4" />
                                  {choice}
                                </label>
                              ))}
                            </fieldset>
                          ) : exercise.type !== "ordering" ? (
                            <TextField id={`${exercise.id}-correct`} label={t("challenges.correctIndex")} type="number" min={1} max={Math.max(2, choices.length)} value={exercise.correctIndex + 1} onChange={(event) => update({ correctIndex: Number(event.target.value) - 1 })} required />
                          ) : null}
                        </>
                      )}
                      {exercise.type === "written" && (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <TextField id={`${exercise.id}-expected`} label={t("assignments.create.expectedAnswer")} hint={t("assignments.create.expectedHint")} value={exercise.expectedAnswer} onChange={(event) => update({ expectedAnswer: event.target.value })} />
                          <TextField id={`${exercise.id}-variants`} label={t("assignments.create.answerVariants")} hint={t("assignments.create.variantsHint")} value={exercise.answerVariants} onChange={(event) => update({ answerVariants: event.target.value })} />
                        </div>
                      )}
                      {exercise.type === "coding" && (
                        <div className="space-y-3">
                          <label className="block text-sm font-medium">
                            {t("assignments.create.language")}
                            <select value={exercise.language} onChange={(event) => update({ language: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-cova-line bg-white px-3 text-sm">
                              {["python", "javascript", "sql", "java", "c"].map((item) => <option key={item} value={item}>{item}</option>)}
                            </select>
                          </label>
                          <TextAreaField id={`${exercise.id}-starter`} label={t("assignments.create.starterCode")} value={exercise.starterCode} onChange={(event) => update({ starterCode: event.target.value })} />
                        </div>
                      )}
                    </div>
                  );
                })}
                <Button type="button" variant="secondary" onClick={() => setExercises((current) => [...current, newExercise()])}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> {t("assignments.create.addExercise")}
                </Button>
                <div className="grid gap-3 rounded-lg bg-cova-bg p-3 text-sm sm:grid-cols-2">
                  <span>{t("assignments.create.totalQuestions", { count: questionCount })}</span>
                  <span>{t("assignments.create.totalPointsValue", { points: totalPoints })}</span>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={randomize} onChange={(event) => setRandomize(event.target.checked)} className="h-4 w-4" />
                  {t("assignments.create.randomize")}
                </label>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={showResults} onChange={(event) => setShowResults(event.target.checked)} className="h-4 w-4" />
                  {t("assignments.create.showResults")}
                </label>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={allowReview} onChange={(event) => setAllowReview(event.target.checked)} className="h-4 w-4" />
                  {t("assignments.create.allowReview")}
                </label>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardBody className="space-y-4">
              <h3 className="text-sm font-semibold">{t("assignments.create.sectionDates")}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField id="create-available" type="datetime-local" label={t("assignments.create.availableFrom")} value={availableFrom} onChange={(event) => setAvailableFrom(event.target.value)} />
                <TextField id="create-deadline" type="datetime-local" label={t("assignments.deadlineLabel")} value={dueAt} onChange={(event) => setDueAt(event.target.value)} required />
              </div>
              {mode === "external" && (
                <>
                  <fieldset className="space-y-1.5">
                    <legend className="text-sm font-medium">{t("assignments.create.formats")}</legend>
                    <div className="flex flex-wrap gap-3">
                      {SUBMISSION_FORMATS.map((format) => (
                        <label key={format} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={formats.includes(format)}
                            onChange={() => setFormats((current) => current.includes(format) ? current.filter((item) => item !== format) : [...current, format])}
                            className="h-4 w-4"
                          />
                          {format}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <TextField id="create-max-mb" type="number" label={t("assignments.create.maxFileSize")} value={maxFileMb} onChange={(event) => setMaxFileMb(Math.max(1, Number(event.target.value) || 1))} min={1} max={100} required />
                  <TextAreaField id="create-submission-instructions" label={t("assignments.create.submissionInstructions")} value={submissionInstructions} onChange={(event) => setSubmissionInstructions(event.target.value)} maxLength={2000} />
                  <div>
                    <label htmlFor="create-attachment" className="mb-1.5 block text-sm font-medium">{t("assignments.create.attachmentLabel")}</label>
                    <input id="create-attachment" type="file" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} disabled={saving} className="block w-full rounded-lg border border-cova-line bg-white p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-cova-pale file:px-3 file:py-1.5" />
                    {attachment && <p className="mt-1 flex items-center gap-1 text-xs text-cova-mute"><Paperclip className="h-3.5 w-3.5" aria-hidden="true" />{attachment.name}</p>}
                  </div>
                </>
              )}
            </CardBody>
          </Card>

          <div className="flex justify-between gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setStep("choose")}>{t("assignments.create.back")}</Button>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" disabled={saving} onClick={() => void create(false)}>{t("assignments.create.saveDraft")}</Button>
              <Button type="submit" disabled={saving || courses.length === 0}>{saving ? t("settings.saving") : t("assignments.create.publish")}</Button>
            </div>
          </div>
          {courses.length === 0 && <p className="text-sm text-cova-mute">{t("assignments.noOwnedCourses")}</p>}
        </form>
      </Modal>

      <Modal
        open={confirmOpen}
        onClose={() => !saving && setConfirmOpen(false)}
        title={t("assignments.create.reviewTitle")}
        description={t("assignments.create.reviewDescription")}
      >
        <ul className="space-y-2 text-sm">
          <li><strong>{title}</strong></li>
          {summary && <li className="text-cova-mute">{summary}</li>}
          <li>{t("assignments.courseLabel")}: {courses.find((course) => course.id === courseId)?.title ?? "—"}</li>
          <li>{t("assignments.create.mode")}: {mode === "external" ? t("assignments.create.externalTitle") : t("assignments.create.interactiveTitle")}</li>
          {mode === "interactive" && <li>{t("assignments.create.totalQuestions", { count: questionCount })}</li>}
          <li>{t("assignments.create.totalPointsValue", { points: totalPoints })}</li>
          <li>{t("assignments.deadlineLabel")}: {dueAt ? new Date(dueAt).toLocaleString() : "—"}</li>
          <li><Badge tone="soft">{t("assignments.create.publishBadge")}</Badge></li>
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => void create(true)} disabled={saving}>{saving ? t("settings.saving") : t("assignments.create.publish")}</Button>
        </div>
      </Modal>
    </>
  );
}

function exerciseQuestionCount(exercise: ExerciseBlock): number {
  if (exercise.type === "matching") {
    return exercise.pairsText.split("\n").filter((line) => line.includes("=>") && line.trim()).length;
  }
  return 1;
}

function exercisePoints(exercise: ExerciseBlock): number {
  if (exercise.type === "matching") return exerciseQuestionCount(exercise) * 2;
  if (exercise.type === "quiz") return exercise.multiple ? 4 : 2;
  return 5;
}

/** Turns one editor block into canonical questions + answer-key entries. */
function buildExercise(exercise: ExerciseBlock): {
  questions: Array<Record<string, unknown>>;
  key: Array<number | number[] | string | null>;
} {
  const questions: Array<Record<string, unknown>> = [];
  const key: Array<number | number[] | string | null> = [];

  if (exercise.type === "matching") {
    const pairs = exercise.pairsText.split("\n").reduce<[string, string][]>((result, line) => {
      const delimiter = line.indexOf("=>");
      if (delimiter < 0) return result;
      const left = line.slice(0, delimiter).trim();
      const right = line.slice(delimiter + 2).trim();
      if (left && right) result.push([left, right]);
      return result;
    }, []);
    const rightItems = pairs.map((pair) => pair[1]);
    for (const [left, right] of pairs) {
      questions.push({ type: "matching", prompt: left, choices: rightItems });
      key.push(rightItems.indexOf(right));
    }
    return { questions, key };
  }

  if (["quiz", "intruder", "ordering"].includes(exercise.type)) {
    const choices = exercise.optionsText.split("\n").map((option) => option.trim()).filter(Boolean);
    const base: Record<string, unknown> = { type: exercise.type, prompt: exercise.prompt.trim(), choices };
    if (exercise.type === "quiz" && exercise.multiple) base.multiple = true;
    if (exercise.type === "coding") base.language = exercise.language;
    questions.push(base);
    if (exercise.type === "ordering") key.push(choices.map((_, index) => index + 1));
    else if (exercise.type === "quiz" && exercise.multiple) {
      key.push(exercise.correctIndexes.length > 0 ? [...exercise.correctIndexes].sort((a, b) => a - b) : null);
    } else key.push(exercise.correctIndex);
    return { questions, key };
  }

  if (exercise.type === "written") {
    const expected = exercise.expectedAnswer.trim();
    const variants = exercise.answerVariants.split("|").map((variant) => variant.trim()).filter(Boolean);
    questions.push(expected
      ? { type: "written", prompt: exercise.prompt.trim(), shortAnswer: true }
      : { type: "written", prompt: exercise.prompt.trim() });
    key.push(expected ? [expected, ...variants].join("|") : null);
    return { questions, key };
  }

  if (exercise.type === "coding") {
    questions.push({ type: "coding", prompt: exercise.prompt.trim(), language: exercise.language, starter: exercise.starterCode });
    key.push(null);
    return { questions, key };
  }

  questions.push({ type: exercise.type, prompt: exercise.prompt.trim() });
  key.push(null);
  return { questions, key };
}
