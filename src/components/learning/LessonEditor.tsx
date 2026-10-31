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
import { buildToc, newBlock, sanitizeHtml, type LessonBlock, type LessonBlockType } from "@/components/learning/lesson-blocks";

const BLOCK_TYPES: LessonBlockType[] = ["h1", "h2", "h3", "p", "ul", "ol", "table"];

/**
 * Native COVA lesson editor: independent content blocks with a formatting
 * toolbar, an automatic table of contents on the right, lesson files, and
 * debounced autosave into lessons.content_blocks.
 */
export function LessonEditor({
  courseId,
  lesson,
  onSaved,
}: {
  courseId: string;
  lesson: {
    id: string;
    title: string;
    summary: string | null;
    content: string | null;
    lesson_type: string;
    position: number;
    lesson_status: string;
    content_blocks: LessonBlock[];
    objectives: string | null;
    duration_minutes: number | null;
  };
  onSaved: () => void;
}) {
  const t = useT();
  const toast = useToast();

  const [title, setTitle] = useState(lesson.title);
  const [summary, setSummary] = useState(lesson.summary ?? "");
  const [objectives, setObjectives] = useState(lesson.objectives ?? "");
  const [duration, setDuration] = useState(lesson.duration_minutes ? String(lesson.duration_minutes) : "");
  const [status, setStatus] = useState<"draft" | "published">((lesson.lesson_status as "draft" | "published") ?? "draft");
  const [blocks, setBlocks] = useState<LessonBlock[]>(
    lesson.content_blocks.length > 0
      ? lesson.content_blocks
      : lesson.content
        ? [{ id: crypto.randomUUID(), type: "p" as const, html: lesson.content }]
        : [newBlock("p")],
  );
  const [activeBlock, setActiveBlock] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const editableRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const saveTimer = useRef<number | null>(null);

  const toc = useMemo(() => buildToc(blocks), [blocks]);

  const save = useCallback(
    async (nextBlocks: LessonBlock[], nextStatus?: "draft" | "published") => {
      setSaveState("saving");
      try {
        const cleaned = nextBlocks.map((block) =>
          block.type === "table"
            ? block
            : { ...block, html: sanitizeHtml(block.html ?? "") },
        );
        const { error } = await getSupabase()
          .from("lessons")
          .update({
            title: title.trim() || lesson.title,
            summary: summary.trim(),
            objectives: objectives.trim(),
            duration_minutes: duration ? Number(duration) : null,
            lesson_status: nextStatus ?? status,
            content_blocks: cleaned,
          })
          .eq("id", lesson.id);
        if (error) throw error;
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

  // Autosave the blocks a few seconds after the last edit.
  useEffect(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void save(blocks);
    }, 3000);
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- autosave on content change
  }, [blocks]);

  function patchBlock(id: string, patch: Partial<LessonBlock>) {
    setBlocks((current) => current.map((block) => (block.id === id ? { ...block, ...patch } : block)));
  }

  function exec(command: string, value?: string) {
    document.execCommand(command, false, value);
    const el = activeBlock ? editableRefs.current.get(activeBlock) : null;
    if (el && activeBlock) {
      patchBlock(activeBlock, { html: sanitizeHtml(el.innerHTML) });
    }
  }

  function addBlock(type: LessonBlockType) {
    const block = newBlock(type);
    setBlocks((current) => [...current, block]);
    setActiveBlock(type === "table" ? null : block.id);
  }

  function duplicateBlock(id: string) {
    setBlocks((current) => {
      const index = current.findIndex((block) => block.id === id);
      if (index < 0) return current;
      const source = current[index];
      if (!source) return current;
      const copy: LessonBlock = { id: crypto.randomUUID(), type: source.type, html: source.html, rows: source.rows?.map((row) => [...row]) };
      const next = [...current];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }

  function moveBlock(id: string, direction: -1 | 1) {
    setBlocks((current) => {
      const index = current.findIndex((block) => block.id === id);
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
  }

  function scrollToBlock(blockId: string) {
    setActiveHeading(blockId);
    const el = editableRefs.current.get(blockId);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const activeText = activeBlock && blocks.find((block) => block.id === activeBlock && block.type !== "table");

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
              {status === "draft" && <Button size="sm" variant="secondary" onClick={() => void save(blocks, "published")}>{t("assignments.detail.publish")}</Button>}
              <Button size="sm" onClick={() => void save(blocks)}>{t("profile.save")}</Button>
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
          {activeText && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-cova-line bg-white p-2">
              <select
                value={activeText.type}
                onChange={(event) => patchBlock(activeText.id, { type: event.target.value as LessonBlockType })}
                className="h-8 rounded-md border border-cova-line bg-white px-2 text-xs font-medium"
                aria-label={t("lessons.editor.blockType")}
              >
                {BLOCK_TYPES.map((item) => <option key={item} value={item}>{t(`lessons.block.${item}`)}</option>)}
              </select>
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
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => exec("insertUnorderedList")} className="h-8 rounded-md border border-cova-line px-2 text-xs hover:bg-cova-bg" aria-label={t("lessons.block.ul")}>• ≡</button>
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => exec("insertOrderedList")} className="h-8 rounded-md border border-cova-line px-2 text-xs hover:bg-cova-bg" aria-label={t("lessons.block.ol")}>1. ≡</button>
            </div>
          )}

          {blocks.map((block, index) => (
            <div key={block.id} className="rounded-xl border border-cova-line bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs text-cova-mute">
                <span className="flex items-center gap-1"><GripVertical className="h-3.5 w-3.5" aria-hidden="true" />{t(`lessons.block.${block.type}`)}</span>
                <span className="flex gap-0.5">
                  <Button type="button" size="sm" variant="ghost" aria-label={t("assignments.runner.moveUp")} disabled={index === 0} onClick={() => moveBlock(block.id, -1)}><ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                  <Button type="button" size="sm" variant="ghost" aria-label={t("assignments.runner.moveDown")} disabled={index === blocks.length - 1} onClick={() => moveBlock(block.id, 1)}><ArrowUp className="h-3.5 w-3.5 rotate-180" aria-hidden="true" /></Button>
                  <Button type="button" size="sm" variant="ghost" aria-label={t("lessons.editor.duplicate")} onClick={() => duplicateBlock(block.id)}><Copy className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                  <Button type="button" size="sm" variant="ghost" aria-label={t("assignments.create.removeExercise")} onClick={() => setBlocks((current) => current.filter((item) => item.id !== block.id))}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                </span>
              </div>

              {block.type === "table" ? (
                <div className="space-y-2 overflow-x-auto">
                  {(block.rows ?? []).map((row, rowIndex) => (
                    <div key={rowIndex} className="flex gap-1.5">
                      {row.map((cell, cellIndex) => (
                        <input
                          key={cellIndex}
                          value={cell}
                          onChange={(event) => patchBlock(block.id, {
                            rows: (block.rows ?? []).map((r, ri) => r.map((c, ci) => (ri === rowIndex && ci === cellIndex ? event.target.value : c))),
                          })}
                          className={`h-9 min-w-0 flex-1 rounded-md border border-cova-line px-2 text-sm ${rowIndex === 0 ? "bg-cova-bg font-semibold" : "bg-white"}`}
                          aria-label={t("lessons.editor.cell")}
                        />
                      ))}
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={() => patchBlock(block.id, { rows: [...(block.rows ?? []), (block.rows?.[0] ?? [""]).map(() => "")] })}>{t("lessons.editor.addRow")}</Button>
                    <Button type="button" size="sm" variant="secondary" disabled={(block.rows?.length ?? 0) <= 1} onClick={() => patchBlock(block.id, { rows: (block.rows ?? []).slice(0, -1) })}>{t("lessons.editor.removeRow")}</Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => patchBlock(block.id, { rows: (block.rows ?? []).map((row) => [...row, ""]) })}>{t("lessons.editor.addColumn")}</Button>
                    <Button type="button" size="sm" variant="secondary" disabled={(block.rows?.[0]?.length ?? 0) <= 1} onClick={() => patchBlock(block.id, { rows: (block.rows ?? []).map((row) => row.slice(0, -1)) })}>{t("lessons.editor.removeColumn")}</Button>
                  </div>
                </div>
              ) : (
                <div
                  ref={(element) => {
                    if (element && !editableRefs.current.has(block.id)) {
                      element.innerHTML = block.html ?? "";
                    }
                    if (element) editableRefs.current.set(block.id, element);
                    else editableRefs.current.delete(block.id);
                  }}
                  contentEditable
                  suppressContentEditableWarning
                  data-bid={block.id}
                  onFocus={() => setActiveBlock(block.id)}
                  onInput={(event) => patchBlock(block.id, { html: (event.target as HTMLDivElement).innerHTML })}
                  className={`min-h-10 rounded-lg p-2 outline-none focus:ring-2 focus:ring-cova-soft ${block.type === "h1" ? "text-2xl font-semibold" : block.type === "h2" ? "text-xl font-semibold" : block.type === "h3" ? "text-lg font-semibold" : "leading-7"}`}
                />
              )}
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            {BLOCK_TYPES.map((type) => (
              <Button key={type} type="button" variant="secondary" size="sm" onClick={() => addBlock(type)}>
                {type === "table" ? <Table className="h-4 w-4" aria-hidden="true" /> : <Type className="h-4 w-4" aria-hidden="true" />}
                {t(`lessons.block.${type}`)}
              </Button>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={() => addBlock("p")}><Plus className="h-4 w-4" aria-hidden="true" />{t("lessons.editor.addBlock")}</Button>
          </div>
        </div>

        <aside className="lg:sticky lg:top-24">
          <Card>
            <CardBody>
              <h2 className="mb-2 text-sm font-semibold">{t("lessons.editor.outline")}</h2>
              {toc.length === 0 ? (
                <p className="text-sm text-cova-mute">{t("lessons.editor.outlineEmpty")}</p>
              ) : (
                <ul className="max-h-96 space-y-1 overflow-y-auto text-sm">
                  {toc.map((entry) => (
                    <li key={entry.blockId} style={{ paddingInlineStart: `${(entry.level - 1) * 0.9}rem` }}>
                      <button
                        type="button"
                        onClick={() => scrollToBlock(entry.blockId)}
                        className={`w-full truncate rounded px-2 py-1 text-start hover:bg-cova-bg ${activeHeading === entry.blockId ? "bg-cova-pale font-semibold" : entry.level === 1 ? "font-semibold" : "text-cova-mute"}`}
                      >
                        <span className="me-1.5 font-mono text-xs text-cova-muted">{entry.number}</span>
                        {entry.text}
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
