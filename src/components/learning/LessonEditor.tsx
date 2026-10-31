"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUp, Copy, GripVertical, Plus, Table, Trash2, Type } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { TextAreaField, TextField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { LessonFilesManager } from "@/components/learning/LessonFilesManager";
import { newSection, sanitizeHtml, titledSections, type LessonSection } from "@/components/learning/lesson-blocks";

/** Builds a small editable table; cells are editable in place. */
function tableHtml(): string {
  const cell = "<td><br></td>";
  const row = `<tr>${cell.repeat(3)}</tr>`;
  const header = `<tr>${"<th><br></th>".repeat(3)}</tr>`;
  return `<table class="cova-table"><thead>${header}</thead><tbody>${row}${row}</tbody></table><p><br></p>`;
}

/**
 * Native COVA lesson editor. Each section = a dedicated title input + its own
 * rich content editor below it. The right outline lists TITLED sections only;
 * the student page turns these into real anchor links (#section-<id>).
 */
export function LessonEditor({
  courseId,
  lesson,
  initialSections,
  onSaved,
}: {
  courseId: string;
  lesson: {
    id: string;
    title: string;
    summary: string | null;
    objectives: string | null;
    duration_minutes: number | null;
    lesson_status: string;
  };
  initialSections: LessonSection[];
  onSaved: () => void;
}) {
  const t = useT();
  const toast = useToast();

  const [title, setTitle] = useState(lesson.title);
  const [summary, setSummary] = useState(lesson.summary ?? "");
  const [objectives, setObjectives] = useState(lesson.objectives ?? "");
  const [duration, setDuration] = useState(lesson.duration_minutes ? String(lesson.duration_minutes) : "");
  const [status, setStatus] = useState<"draft" | "published">((lesson.lesson_status as "draft" | "published") ?? "draft");
  const [sections, setSections] = useState<LessonSection[]>(
    initialSections.length > 0 ? initialSections : [newSection()],
  );
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const contentRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const saveTimer = useRef<number | null>(null);
  const sectionsRef = useRef<LessonSection[]>(sections);

  const outline = useMemo(() => titledSections(sections), [sections]);

  function syncSections() {
    sectionsRef.current = sections;
  }

  const save = useCallback(
    async (currentSections: LessonSection[], nextStatus?: "draft" | "published") => {
      setSaveState("saving");
      try {
        const supabase = getSupabase();
        const { error: lessonError } = await supabase
          .from("lessons")
          .update({
            title: title.trim() || lesson.title,
            summary: summary.trim(),
            objectives: objectives.trim(),
            duration_minutes: duration ? Number(duration) : null,
            lesson_status: nextStatus ?? status,
          })
          .eq("id", lesson.id);
        if (lessonError) throw lessonError;

        // Diff by section id so anchors stay stable across saves.
        const { data: existing, error: existingError } = await supabase
          .from("lesson_sections")
          .select("id")
          .eq("lesson_id", lesson.id);
        if (existingError) throw existingError;
        const existingIds = new Set(((existing ?? []) as Array<{ id: string }>).map((row) => row.id));
        const keepIds = new Set(currentSections.map((section) => section.id));

        const toInsert = currentSections.filter((section) => !existingIds.has(section.id));
        const toUpdate = currentSections.filter((section) => existingIds.has(section.id));
        const toDelete = [...existingIds].filter((id) => !keepIds.has(id));

        if (toInsert.length) {
          const { error } = await supabase.from("lesson_sections").insert(
            toInsert.map((section) => ({
              id: section.id,
              lesson_id: lesson.id,
              title: section.title.trim() || null,
              content_html: sanitizeHtml(section.html),
              position: currentSections.indexOf(section),
            })),
          );
          if (error) throw error;
        }
        for (const section of toUpdate) {
          const { error } = await supabase
            .from("lesson_sections")
            .update({
              title: section.title.trim() || null,
              content_html: sanitizeHtml(section.html),
              position: currentSections.indexOf(section),
            })
            .eq("id", section.id);
          if (error) throw error;
        }
        if (toDelete.length) {
          const { error } = await supabase.from("lesson_sections").delete().in("id", toDelete);
          if (error) throw error;
        }

        setSaveState("saved");
        if (nextStatus) setStatus(nextStatus);
        onSaved();
      } catch (error) {
        console.error("Unable to save the lesson:", error);
        setSaveState("idle");
        toast.push(t("lessons.editor.saveError"));
      }
    },
    [title, summary, objectives, duration, status, lesson.id, lesson.title, onSaved, t, toast],
  );

  // Autosave the sections a few seconds after the last change.
  useEffect(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void save(sectionsRef.current), 3000);
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- autosave on content change
  }, [sections, title, summary, objectives, duration]);

  function patchSection(id: string, patch: Partial<LessonSection>) {
    setSections((current) => current.map((section) => (section.id === id ? { ...section, ...patch } : section)));
    syncSections();
  }

  function exec(command: string, value?: string) {
    document.execCommand(command, false, value);
    if (activeSection) {
      const element = contentRefs.current.get(activeSection);
      if (element) patchSection(activeSection, { html: element.innerHTML });
    }
  }

  function selectionInsideTable(): HTMLTableElement | null {
    let node = window.getSelection()?.anchorNode ?? null;
    while (node && !(node instanceof HTMLTableElement)) node = node.parentNode;
    return node instanceof HTMLTableElement ? node : null;
  }

  function tableOp(op: "addRow" | "removeRow" | "addCol" | "removeCol") {
    if (!activeSection) return;
    const table = selectionInsideTable();
    const element = contentRefs.current.get(activeSection);
    if (!table || !element) {
      toast.push(t("lessons.editor.noTableSelected"));
      return;
    }
    if (op === "addRow") {
      const cells = table.rows[0]?.cells.length ?? 3;
      table.insertRow().innerHTML = "<td><br></td>".repeat(cells);
    } else if (op === "removeRow") {
      if (table.rows.length > 1) table.deleteRow(-1);
    } else if (op === "addCol") {
      for (const row of table.rows) row.insertCell().innerHTML = "<br>";
    } else if ((table.rows[0]?.cells.length ?? 0) > 1) {
      for (const row of table.rows) row.deleteCell(-1);
    }
    patchSection(activeSection, { html: element.innerHTML });
  }

  function insertTable() {
    exec("insertHTML", tableHtml());
  }

  function addSection() {
    const section = newSection();
    setSections((current) => [...current, section]);
    syncSections();
    setActiveSection(section.id);
  }

  function duplicateSection(id: string) {
    setSections((current) => {
      const index = current.findIndex((section) => section.id === id);
      if (index < 0) return current;
      const source = current[index];
      if (!source) return current;
      const copy: LessonSection = { id: crypto.randomUUID(), title: source.title, html: source.html };
      const next = [...current];
      next.splice(index + 1, 0, copy);
      return next;
    });
    syncSections();
  }

  function moveSection(id: string, direction: -1 | 1) {
    setSections((current) => {
      const index = current.findIndex((section) => section.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const a = next[index];
      const b = next[target];
      if (!a || !b) return current;
      next[index] = b;
      next[target] = a;
      return next;
    });
    syncSections();
  }

  function scrollToSection(id: string) {
    contentRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-4">
      <Link href={`/courses/${courseId}`} className="inline-flex items-center gap-2 text-sm font-medium text-cova-mute hover:text-cova-ink">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /> {t("lessons.editor.backToModule")}
      </Link>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="soft">{t("lessons.editor.native")}</Badge>
              <Badge tone={status === "published" ? "soft" : "pale"}>{status === "published" ? t("lessons.editor.published") : t("assignments.detail.draft")}</Badge>
              {saveState === "saving" && <span className="text-xs text-cova-mute">{t("assignments.runner.saving")}</span>}
              {saveState === "saved" && <span className="text-xs text-cova-mute">{t("assignments.runner.saved")}</span>}
            </div>
            <div className="flex gap-2">
              {status === "draft" && <Button size="sm" variant="secondary" onClick={() => void save(sections, "published")}>{t("assignments.detail.publish")}</Button>}
              <Button size="sm" onClick={() => void save(sections)}>{t("profile.save")}</Button>
            </div>
          </div>
          <TextField id="lesson-title" label={t("lessons.editor.lessonTitle")} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
          <TextField id="lesson-summary" label={t("modules.create.summary")} value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={300} />
          <TextAreaField id="lesson-objectives" label={t("modules.create.objectives")} value={objectives} onChange={(event) => setObjectives(event.target.value)} maxLength={3000} />
          <TextField id="lesson-duration" type="number" label={t("assignments.create.estimatedDuration")} value={duration} onChange={(event) => setDuration(event.target.value)} min={1} />
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-cova-line bg-white p-2">
            <span className="flex items-center gap-1 px-1 text-xs text-cova-mute"><Type className="h-3.5 w-3.5" aria-hidden="true" />{t("lessons.editor.formatting")}</span>
            {([
              ["bold", "B", "font-bold"],
              ["italic", "I", "italic"],
              ["underline", "U", "underline"],
              ["strikeThrough", "S", "line-through"],
            ] as const).map(([command, label, className]) => (
              <button key={command} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => exec(command)} className={`h-8 w-8 rounded-md border border-cova-line text-sm hover:bg-cova-bg ${className}`} aria-label={t(`lessons.editor.${command}`)}>
                {label}
              </button>
            ))}
            <label className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-cova-line text-xs" title={t("lessons.editor.color")}>
              A
              <input type="color" className="sr-only" onChange={(event) => exec("foreColor", event.target.value)} />
            </label>
            <label className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-cova-line text-xs" title={t("lessons.editor.highlight")}>
              <span className="rounded bg-yellow-200 px-1">H</span>
              <input type="color" className="sr-only" onChange={(event) => exec("hiliteColor", event.target.value)} />
            </label>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => exec("formatBlock", "<h2>")} className="h-8 rounded-md border border-cova-line px-2 text-xs font-semibold hover:bg-cova-bg">H2</button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => exec("formatBlock", "<h3>")} className="h-8 rounded-md border border-cova-line px-2 text-xs font-semibold hover:bg-cova-bg">H3</button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => exec("formatBlock", "<p>")} className="h-8 rounded-md border border-cova-line px-2 text-xs hover:bg-cova-bg">P</button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => exec("insertUnorderedList")} className="h-8 rounded-md border border-cova-line px-2 text-xs hover:bg-cova-bg" aria-label={t("lessons.block.ul")}>• ≡</button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => exec("insertOrderedList")} className="h-8 rounded-md border border-cova-line px-2 text-xs hover:bg-cova-bg" aria-label={t("lessons.block.ol")}>1. ≡</button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={insertTable} className="h-8 rounded-md border border-cova-line px-2 hover:bg-cova-bg" aria-label={t("lessons.editor.insertTable")}><Table className="h-4 w-4" aria-hidden="true" /></button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => tableOp("addRow")} className="h-8 rounded-md border border-cova-line px-2 text-xs hover:bg-cova-bg">{t("lessons.editor.addRow")}</button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => tableOp("removeRow")} className="h-8 rounded-md border border-cova-line px-2 text-xs hover:bg-cova-bg">{t("lessons.editor.removeRow")}</button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => tableOp("addCol")} className="h-8 rounded-md border border-cova-line px-2 text-xs hover:bg-cova-bg">{t("lessons.editor.addColumn")}</button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => tableOp("removeCol")} className="h-8 rounded-md border border-cova-line px-2 text-xs hover:bg-cova-bg">{t("lessons.editor.removeColumn")}</button>
          </div>

          {sections.map((section, index) => (
            <div key={section.id} className="rounded-xl border border-cova-line bg-white p-4">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs text-cova-mute">
                <span className="flex items-center gap-1"><GripVertical className="h-3.5 w-3.5" aria-hidden="true" />{t("lessons.editor.sectionNumber", { number: index + 1 })}</span>
                <span className="flex gap-0.5">
                  <Button type="button" size="sm" variant="ghost" aria-label={t("assignments.runner.moveUp")} disabled={index === 0} onClick={() => moveSection(section.id, -1)}><ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                  <Button type="button" size="sm" variant="ghost" aria-label={t("assignments.runner.moveDown")} disabled={index === sections.length - 1} onClick={() => moveSection(section.id, 1)}><ArrowUp className="h-3.5 w-3.5 rotate-180" aria-hidden="true" /></Button>
                  <Button type="button" size="sm" variant="ghost" aria-label={t("lessons.editor.duplicate")} onClick={() => duplicateSection(section.id)}><Copy className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                  <Button type="button" size="sm" variant="ghost" aria-label={t("assignments.create.removeExercise")} onClick={() => { setSections((current) => current.filter((item) => item.id !== section.id)); syncSections(); }}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                </span>
              </div>
              <TextField
                id={`section-title-${section.id}`}
                label={t("lessons.editor.sectionTitle")}
                hint={t("lessons.editor.sectionTitleHint")}
                value={section.title}
                onChange={(event) => patchSection(section.id, { title: event.target.value })}
                maxLength={200}
              />
              <div
                ref={(element) => {
                  if (element && !contentRefs.current.has(section.id)) {
                    element.innerHTML = sanitizeHtml(section.html);
                  }
                  if (element) contentRefs.current.set(section.id, element);
                  else contentRefs.current.delete(section.id);
                }}
                contentEditable
                suppressContentEditableWarning
                data-sid={section.id}
                onFocus={() => setActiveSection(section.id)}
                onInput={(event) => patchSection(section.id, { html: (event.target as HTMLDivElement).innerHTML })}
                className="lesson-content mt-2 min-h-32 rounded-lg border border-cova-line p-3 leading-7 outline-none focus:ring-2 focus:ring-cova-soft"
                aria-label={t("lessons.editor.sectionContent")}
              />
            </div>
          ))}

          <Button type="button" variant="secondary" onClick={addSection}>
            <Plus className="h-4 w-4" aria-hidden="true" />{t("lessons.editor.addSection")}
          </Button>
        </div>

        <aside className="lg:sticky lg:top-24">
          <Card>
            <CardBody>
              <h2 className="mb-2 text-sm font-semibold">{t("lessons.editor.outline")}</h2>
              {outline.length === 0 ? (
                <p className="text-sm text-cova-mute">{t("lessons.editor.outlineEmpty")}</p>
              ) : (
                <ul className="max-h-96 space-y-1 overflow-y-auto text-sm">
                  {outline.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => scrollToSection(entry.id)}
                        className="w-full truncate rounded px-2 py-1 text-start font-medium hover:bg-cova-bg"
                      >
                        {entry.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>

      <Card>
        <CardBody>
          <h2 className="mb-3 text-lg font-semibold">{t("lessons.resources")}</h2>
          <LessonFilesManager lessonId={lesson.id} canEdit />
        </CardBody>
      </Card>
    </div>
  );
}
