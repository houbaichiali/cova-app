"use client";

import type { ReactNode } from "react";

/**
 * A native lesson is an ordered list of SECTIONS. Each section has an
 * independent title (used by the reading navigation when non-empty) and its own
 * rich content — the two are never merged. Saved in the lesson_sections table.
 */
export interface LessonSection {
  /** Stable editor-generated UUID: also the HTML anchor of the section. */
  id: string;
  title: string;
  html: string;
}

export function newSection(): LessonSection {
  return { id: crypto.randomUUID(), title: "", html: "" };
}

export function sectionAnchor(id: string): string {
  return `section-${id}`;
}

/** Teacher-authored HTML: drop scripts and inline handlers before saving/rendering. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "");
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/** The navigation entries: titled sections only, in saved order. */
export function titledSections(sections: LessonSection[]): Array<{ id: string; anchor: string; title: string }> {
  return sections
    .filter((section) => section.title.trim().length > 0)
    .map((section) => ({ id: section.id, anchor: sectionAnchor(section.id), title: section.title.trim() }));
}

function renderContent(html: string): ReactNode {
  return <div className="lesson-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
}

/** Read-only rendering of every section, each with a stable anchor id. */
export function LessonSectionsView({ sections }: { sections: LessonSection[] }) {
  return (
    <article className="lesson-content">
      {sections.map((section) => (
        <section key={section.id} id={sectionAnchor(section.id)} className="scroll-mt-24 border-b border-cova-line py-4 first:pt-0 last:border-b-0">
          {section.title.trim() && <h2 className="mb-2 text-2xl font-semibold">{section.title}</h2>}
          {renderContent(section.html)}
        </section>
      ))}
      {sections.length === 0 && <p className="text-sm text-cova-mute">…</p>}
    </article>
  );
}
