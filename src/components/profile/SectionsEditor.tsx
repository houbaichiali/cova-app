"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Target, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SelectFilter, TextAreaField, TextField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import type { ActionResult } from "@/types/social";
import type { GoalItem } from "@/lib/profile-data";

const SUBJECT_SUGGESTIONS = [
  "Mathematics",
  "Computer Science",
  "Physics",
  "Engineering",
  "Languages",
  "Design",
  "Business",
] as const;

/** Favorite subjects + learning goals — both owner-managed, owner-only rows. */
export function SectionsEditor({
  subjects,
  goals,
  onSubjectsChange,
  onGoalUpsert,
  onGoalDelete,
}: {
  subjects: string[];
  goals: GoalItem[];
  onSubjectsChange: (next: string[]) => Promise<ActionResult>;
  onGoalUpsert: (goal: Omit<GoalItem, "id"> & { id?: string }) => Promise<ActionResult>;
  onGoalDelete: (id: string) => Promise<ActionResult>;
}) {
  const t = useT();
  const toast = useToast();
  const [subjectDraft, setSubjectDraft] = useState("");
  const [editing, setEditing] = useState<GoalItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Omit<GoalItem, "id">>({
    title: "",
    description: "",
    target_date: null,
    progress: 0,
    status: "active",
  });

  async function commitSubjects(next: string[]) {
    const result = await onSubjectsChange(next);
    toast.push(result.ok ? t("profile.subjects.saved") : (result.error ?? ""));
  }

  function moveSubject(index: number, delta: -1 | 1) {
    const next = [...subjects];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const moved = next[index] ?? "";
    const displaced = next[target] ?? "";
    next[index] = displaced;
    next[target] = moved;
    void commitSubjects(next);
  }

  async function saveGoal() {
    if (form.title.trim().length === 0) return;
    const result = await onGoalUpsert({ ...form, id: editing?.id });
    toast.push(result.ok ? t("profile.goals.saved") : (result.error ?? ""));
    if (result.ok) {
      setAdding(false);
      setEditing(null);
      setForm({ title: "", description: "", target_date: null, progress: 0, status: "active" });
    }
  }

  function startEdit(goal: GoalItem) {
    setEditing(goal);
    setAdding(true);
    setForm({
      title: goal.title,
      description: goal.description,
      target_date: goal.target_date,
      progress: goal.progress,
      status: goal.status,
    });
  }

  async function removeGoal(goal: GoalItem) {
    if (!window.confirm(t("profile.goals.confirmDelete"))) return;
    const result = await onGoalDelete(goal.id);
    toast.push(result.ok ? t("profile.goals.saved") : (result.error ?? ""));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <Card>
        <CardHeader title={t("profile.sections.subjects")} description={t("profile.subjects.hint")} />
        <CardBody className="space-y-3">
          <div className="flex gap-2">
            <input
              list="subject-suggestions"
              value={subjectDraft}
              onChange={(event) => setSubjectDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  const value = subjectDraft.trim().slice(0, 60);
                  if (value && !subjects.includes(value)) void commitSubjects([...subjects, value]);
                  setSubjectDraft("");
                }
              }}
              placeholder={t("profile.subjects.placeholder")}
              aria-label={t("profile.subjects.add")}
              className="h-9 flex-1 rounded-lg border border-cova-line bg-white px-3 text-sm"
            />
            <datalist id="subject-suggestions">
              {SUBJECT_SUGGESTIONS.map((subject) => (
                <option key={subject} value={subject} />
              ))}
            </datalist>
            <Button
              onClick={() => {
                const value = subjectDraft.trim().slice(0, 60);
                if (value && !subjects.includes(value)) void commitSubjects([...subjects, value]);
                setSubjectDraft("");
              }}
              aria-label={t("profile.subjects.add")}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          {subjects.length === 0 ? (
            <p className="text-sm text-cova-mute">{t("profile.subjects.emptyEditor")}</p>
          ) : (
            <ul className="space-y-1.5">
              {subjects.map((subject, index) => (
                <li
                  key={subject}
                  className="flex items-center justify-between gap-2 rounded-lg border border-cova-line bg-white px-3 py-1.5"
                >
                  <span className="text-sm font-medium">{subject}</span>
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={t("profile.subjects.moveUp")}
                      disabled={index === 0}
                      onClick={() => moveSubject(index, -1)}
                      className="rounded p-1 text-cova-mute hover:bg-cova-pale disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("profile.subjects.moveDown")}
                      disabled={index === subjects.length - 1}
                      onClick={() => moveSubject(index, 1)}
                      className="rounded p-1 text-cova-mute hover:bg-cova-pale disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("profile.subjects.remove")}
                      onClick={() => void commitSubjects(subjects.filter((s) => s !== subject))}
                      className="rounded p-1 text-cova-mute hover:bg-cova-pale"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("profile.sections.goals")} description={t("profile.goals.hint")} />
        <CardBody className="space-y-3">
          {!adding && (
            <Button onClick={() => setAdding(true)}>
              <Target className="h-4 w-4" aria-hidden="true" /> {t("profile.goals.add")}
            </Button>
          )}
          {adding && (
            <div className="space-y-3 rounded-lg border border-cova-line p-3">
              <TextField
                id="goal-title"
                label={t("profile.goals.title")}
                value={form.title}
                maxLength={100}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
              <TextAreaField
                id="goal-description"
                label={t("profile.goals.description")}
                value={form.description}
                maxLength={400}
                rows={2}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <TextField
                  id="goal-date"
                  label={t("profile.goals.targetDate")}
                  type="date"
                  value={form.target_date ?? ""}
                  onChange={(event) => setForm({ ...form, target_date: event.target.value || null })}
                />
                <TextField
                  id="goal-progress"
                  label={`${t("profile.goals.progress")} (%)`}
                  type="number"
                  min={0}
                  max={100}
                  value={form.progress}
                  onChange={(event) =>
                    setForm({ ...form, progress: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })
                  }
                />
                <SelectFilter
                  id="goal-status"
                  label={t("profile.goals.status")}
                  options={[
                    { value: "active", label: t("profile.goals.statusActive") },
                    { value: "achieved", label: t("profile.goals.statusAchieved") },
                    { value: "archived", label: t("profile.goals.statusArchived") },
                  ]}
                  value={form.status}
                  onChange={(event) =>
                    setForm({ ...form, status: event.target.value as GoalItem["status"] })
                  }
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setAdding(false);
                    setEditing(null);
                  }}
                >
                  {t("common.cancel")}
                </Button>
                <Button onClick={() => void saveGoal()}>{t("common.save")}</Button>
              </div>
            </div>
          )}
          {goals.length === 0 ? (
            <p className="text-sm text-cova-mute">{t("profile.goals.emptyEditor")}</p>
          ) : (
            <ul className="space-y-2">
              {goals.map((goal) => (
                <li
                  key={goal.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-cova-line bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{goal.title}</p>
                    <p className="text-xs text-cova-mute">
                      {goal.progress}%{goal.target_date ? ` · ${goal.target_date}` : ""} · {goal.status}
                    </p>
                  </div>
                  <span className="flex items-center gap-1">
                    <Button variant="secondary" onClick={() => startEdit(goal)}>
                      {t("common.edit")}
                    </Button>
                    <button
                      type="button"
                      aria-label={t("profile.goals.delete")}
                      onClick={() => void removeGoal(goal)}
                      className="rounded p-1.5 text-cova-mute hover:bg-cova-pale"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
