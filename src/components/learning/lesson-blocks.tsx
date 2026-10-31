"use client";

import type { ReactNode } from "react";

/** One content block of a native COVA lesson (saved in lessons.content_blocks). */
export type LessonBlockType = "h1" | "h2" | "h3" | "p" | "ul" | "ol" | "table";

export interface LessonBlock {
  id: string;
  type: LessonBlockType;
  /** Inline HTML for text blocks (teacher-authored, sanitized on save). */
  html?: string;
  /** Cell grid for table blocks. */
  rows?: string[][];
}

export function newBlock(type: LessonBlockType): LessonBlock {
  const base: LessonBlock = { id: crypto.randomUUID(), type };
  if (type === "table") {
    base.rows = [
      ["", "", ""],
      ["", "", ""],
    ];
  }
  return base;
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

export interface TocEntry {
  blockId: string;
  level: 1 | 2 | 3;
  number: string;
  text: string;
}

/** Numbered outline from the heading blocks (1, 1.1, 1.2, 2, ...). */
export function buildToc(blocks: LessonBlock[]): TocEntry[] {
  const counters = [0, 0, 0];
  const entries: TocEntry[] = [];
  for (const block of blocks) {
    if (block.type !== "h1" && block.type !== "h2" && block.type !== "h3") continue;
    const level = Number(block.type[1]) as 1 | 2 | 3;
    counters[level - 1] = (counters[level - 1] ?? 0) + 1;
    for (let deeper = level; deeper < 3; deeper += 1) counters[deeper] = 0;
    const text = stripHtml(block.html ?? "") || "…";
    const number = level === 1 ? `${counters[0]}` : `${counters.slice(0, level).join(".")}`;
    entries.push({ blockId: block.id, level, number, text });
  }
  return entries;
}

function renderList(html: string, ordered: boolean): ReactNode {
  // The contentEditable already produced <li>…</li> fragments inside the block.
  const inner = { __html: sanitizeHtml(html) };
  return ordered
    ? <ol className="my-2 list-decimal space-y-1 ps-6" dangerouslySetInnerHTML={inner} />
    : <ul className="my-2 list-disc space-y-1 ps-6" dangerouslySetInnerHTML={inner} />;
}

/** Read-only rendering of the lesson blocks (student reading view). */
export function LessonBlocksView({ blocks }: { blocks: LessonBlock[] }) {
  return (
    <div className="space-y-1">
      {blocks.map((block) => {
        if (block.type === "table") {
          const rows = block.rows ?? [];
          const [head = [], ...body] = rows;
          return (
            <table key={block.id} className="my-4 w-full border-collapse text-sm">
              {head.length > 0 && (
                <thead>
                  <tr>{head.map((cell, cellIndex) => <th key={cellIndex} className="border border-cova-line bg-cova-bg px-3 py-2 text-start font-semibold">{cell}</th>)}</tr>
                </thead>
              )}
              <tbody>
                {body.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => <td key={cellIndex} className="border border-cova-line px-3 py-2 align-top">{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }
        const inner = { __html: sanitizeHtml(block.html ?? "") };
        switch (block.type) {
          case "h1": return <h2 key={block.id} data-bid={block.id} className="mt-6 scroll-mt-24 text-2xl font-semibold" dangerouslySetInnerHTML={inner} />;
          case "h2": return <h3 key={block.id} data-bid={block.id} className="mt-5 scroll-mt-24 text-xl font-semibold" dangerouslySetInnerHTML={inner} />;
          case "h3": return <h4 key={block.id} data-bid={block.id} className="mt-4 scroll-mt-24 text-lg font-semibold" dangerouslySetInnerHTML={inner} />;
          case "ul": return <div key={block.id}>{renderList(block.html ?? "", false)}</div>;
          case "ol": return <div key={block.id}>{renderList(block.html ?? "", true)}</div>;
          default: return <p key={block.id} className="my-3 leading-7" dangerouslySetInnerHTML={inner} />;
        }
      })}
      {blocks.length === 0 && <p className="my-3 text-sm text-cova-mute">…</p>}
    </div>
  );
}
