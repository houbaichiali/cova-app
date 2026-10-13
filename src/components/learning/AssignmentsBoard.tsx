"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { SearchInput } from "@/components/ui/SearchInput";
import { Tabs } from "@/components/ui/Tabs";
import { TextAreaField } from "@/components/ui/FormField";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { useToast } from "@/components/ui/Toast";
import { assignments } from "@/data/assignments";
import { getCourse } from "@/data/courses";
import { demoActions, useDemoState } from "@/lib/demo-store";
import { effectiveStatus } from "@/lib/progress";
import { daysUntil, dueLabel, formatDate, matchesQuery } from "@/lib/utils";
import type { Assignment, AssignmentStatus } from "@/types";

const TABS = ["To do", "Submitted", "Graded", "All"] as const;
type Tab = (typeof TABS)[number];

const statusLabel: Record<AssignmentStatus, string> = {
  todo: "Not started",
  "in-progress": "In progress",
  submitted: "Submitted",
  graded: "Graded",
};

export function AssignmentsBoard() {
  const state = useDemoState();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("To do");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Assignment | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const statusOf = (a: Assignment) => effectiveStatus(a, state);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { "To do": 0, Submitted: 0, Graded: 0, All: assignments.length };
    for (const a of assignments) {
      const s = effectiveStatus(a, state);
      if (s === "todo" || s === "in-progress") c["To do"]++;
      else if (s === "submitted") c.Submitted++;
      else c.Graded++;
    }
    return c;
  }, [state]);

  const results = assignments
    .filter((a) => {
      const s = statusOf(a);
      const inTab =
        tab === "All" ||
        (tab === "To do"
          ? s === "todo" || s === "in-progress"
          : tab === "Submitted"
            ? s === "submitted"
            : s === "graded");
      return (
        inTab && matchesQuery(query, a.title, a.description, getCourse(a.courseId)?.title ?? "")
      );
    })
    .sort((a, b) => daysUntil(a.due) - daysUntil(b.due));

  function open(a: Assignment) {
    setActive(a);
    setText(state.assignments[a.id]?.submission ?? "");
    setError("");
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!active) return;
    if (text.trim().length < 20) {
      setError("Write at least 20 characters describing your work or paste a link to it.");
      return;
    }
    demoActions.setAssignment(active.id, "submitted", text.trim());
    toast.push(`Submitted "${active.title}": +25 XP`);
    setActive(null);
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs tabs={TABS} value={tab} onChange={setTab} label="Assignment status" counts={counts} />
        <SearchInput
          label="Search assignments"
          placeholder="Search assignments"
          value={query}
          onChange={setQuery}
          className="lg:w-72"
        />
      </div>

      {results.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nothing here"
          description={
            query ? "No assignments match your search." : "There are no assignments in this view."
          }
        />
      ) : (
        <ul className="space-y-3">
          {results.map((a) => {
            const s = statusOf(a);
            const submission = state.assignments[a.id]?.submission;
            const canSubmit = s === "todo" || s === "in-progress";
            return (
              <li key={a.id}>
                <Card>
                  <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold">{a.title}</h2>
                        <Badge tone={s === "graded" ? "soft" : "pale"}>{statusLabel[s]}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-cova-mute">{getCourse(a.courseId)?.title}</p>
                      <p className="mt-2 line-clamp-2 text-sm">{a.description}</p>
                      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-cova-mute">
                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{" "}
                          {formatDate(a.due)}
                          {canSubmit && ` · ${dueLabel(a.due)}`}
                        </span>
                        <span>{a.points} points</span>
                        {s === "graded" && a.grade !== undefined && (
                          <span className="flex items-center gap-1.5 font-medium text-cova-ink">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Grade:{" "}
                            {a.grade} / {a.points}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {canSubmit && (
                        <>
                          {s === "todo" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                demoActions.setAssignment(a.id, "in-progress");
                                toast.push("Marked as in progress");
                              }}
                            >
                              Start
                            </Button>
                          )}
                          <Button size="sm" onClick={() => open(a)}>
                            Submit work
                          </Button>
                        </>
                      )}
                      {s === "submitted" && submission && (
                        <Button size="sm" variant="secondary" onClick={() => open(a)}>
                          Edit submission
                        </Button>
                      )}
                    </div>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={active !== null}
        onClose={() => setActive(null)}
        title={active ? `Submit: ${active.title}` : "Submit"}
        description="Describe your work or paste a link."
      >
        <form onSubmit={submit} noValidate className="space-y-4">
          <TextAreaField
            id="submission"
            label="Your submission"
            value={text}
            error={error}
            onChange={(e) => setText(e.target.value)}
          />
          <DemoNotice>
            Demo only: submissions are saved in this browser and are not sent to a teacher. File
            uploads are not available yet.
          </DemoNotice>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setActive(null)}>
              Cancel
            </Button>
            <Button type="submit">Submit</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
