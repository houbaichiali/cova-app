"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ClipboardList, Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchInput } from "@/components/ui/SearchInput";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/i18n/client";
import { AssignmentCreate } from "@/components/learning/AssignmentCreate";
import { getSupabase } from "@/lib/supabase/client";
import { matchesQuery } from "@/lib/utils";

const TABS = ["All", "To do", "In progress", "Submitted", "Graded"] as const;
type AssignmentTab = (typeof TABS)[number];
type Status = "todo" | "in-progress" | "submitted" | "graded";
type AssignmentRow = {
  id: string;
  title: string;
  course_id: string;
  created_by: string;
  description: string;
  due_at: string;
  points: number;
  kind: "general" | "coding";
  mode: "external" | "interactive";
  status: "draft" | "published";
};
type SubmissionRow = { assignment_id: string; status: "in_progress" | "submitted" | "graded"; grade: number | null };
type AttemptRow = { assignment_id: string; status: "in_progress" | "submitted" | "graded"; score: number | null };
type CourseRow = { id: string; title: string };
type AssignmentItem = AssignmentRow & { courseTitle: string; state: Status; grade: number | null; isOwner: boolean };

export function AssignmentsBoard() {
  const { t, formatTag } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<AssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<AssignmentTab>("All");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ courseId: string; lessonTitle: string }>({ courseId: "", lessonTitle: "" });
  const [courses, setCourses] = useState<CourseRow[]>([]);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const supabase = getSupabase();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const currentUserId = authData.user?.id ?? null;
      if (!currentUserId) {
        setRows([]);
        return;
      }

      const [{ data: assignments, error: assignmentsError }, { data: submissions, error: submissionsError }, { data: attempts }] = await Promise.all([
        supabase.from("assignments").select("id,title,course_id,created_by,description,due_at,points,kind,mode,status").order("due_at"),
        supabase.from("assignment_submissions").select("assignment_id,status,grade").eq("student_id", currentUserId),
        supabase.from("assignment_attempts").select("assignment_id,status,score").eq("student_id", currentUserId),
      ]);
      if (assignmentsError) throw assignmentsError;
      if (submissionsError) throw submissionsError;
      const assignmentRows = (assignments ?? []) as AssignmentRow[];
      const courseIds = [...new Set(assignmentRows.map((item) => item.course_id))];
      const coursesResult = courseIds.length
        ? await supabase.from("courses").select("id,title").in("id", courseIds)
        : { data: [], error: null };
      if (coursesResult.error) throw coursesResult.error;
      const courseTitles = new Map(((coursesResult.data ?? []) as CourseRow[]).map((course) => [course.id, course.title]));
      const submissionByAssignment = new Map(((submissions ?? []) as SubmissionRow[]).map((submission) => [submission.assignment_id, submission]));
      const attemptByAssignment = new Map(((attempts ?? []) as AttemptRow[]).map((attempt) => [attempt.assignment_id, attempt]));
      setRows(assignmentRows.map((assignment) => {
        const submission = submissionByAssignment.get(assignment.id);
        const attempt = attemptByAssignment.get(assignment.id);
        const isOwner = assignment.created_by === currentUserId;
        const attemptStatus = attempt?.status;
        const state: Status = isOwner ? "todo"
          : attemptStatus === "graded" || submission?.status === "graded" || (attempt?.score !== null && attempt?.score !== undefined) ? "graded"
            : attemptStatus === "submitted" || submission?.status === "submitted" ? "submitted"
              : attemptStatus === "in_progress" || submission?.status === "in_progress" ? "in-progress" : "todo";
        return {
          ...assignment,
          courseTitle: courseTitles.get(assignment.course_id) ?? "",
          state,
          grade: attempt?.score ?? submission?.grade ?? null,
          isOwner,
        };
      }));
    } catch (error) {
      console.error("Unable to load assignments:", error);
      setLoadError(true);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount into component state
    void loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("create") === "1") {
        setPrefill({ courseId: params.get("course") ?? "", lessonTitle: params.get("lessonTitle") ?? "" });
        void openCreateForm();
      }
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read the deep link once on mount
  }, []);

  async function openCreateForm() {
    setCreateOpen(true);
    try {
      const supabase = getSupabase();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;
      const { data, error } = await supabase.from("courses").select("id,title").eq("created_by", authData.user.id).order("title");
      if (error) throw error;
      setCourses((data ?? []) as CourseRow[]);
    } catch (error) {
      console.error("Unable to load courses for assignment creation:", error);
    }
  }

  async function publishDraft(assignmentId: string) {
    try {
      const { error } = await getSupabase().from("assignments").update({ status: "published" }).eq("id", assignmentId);
      if (error) throw error;
      toast.push(t("assignments.detail.published"));
      await loadAssignments();
    } catch (error) {
      console.error("Unable to publish the assignment:", error);
      toast.push(t("assignments.createError"));
    }
  }

  const counts = useMemo(() => {
    const count: Record<AssignmentTab, number> = { All: rows.length, "To do": 0, "In progress": 0, Submitted: 0, Graded: 0 };
    rows.filter((row) => !row.isOwner && row.status !== "draft").forEach((row) => {
      if (row.state === "todo") count["To do"] += 1;
      else if (row.state === "in-progress") count["In progress"] += 1;
      else if (row.state === "submitted") count.Submitted += 1;
      else count.Graded += 1;
    });
    return count;
  }, [rows]);

  const filtered = rows.filter((row) => {
    if (row.status === "draft" && !row.isOwner) return false;
    const matchesTab = tab === "All" || (!row.isOwner && row.state === (tab === "To do" ? "todo" : tab === "In progress" ? "in-progress" : tab.toLowerCase()));
    return matchesTab && matchesQuery(query, row.title, row.description, row.courseTitle);
  });
  const tabsLabels: Partial<Record<AssignmentTab, string>> = {
    All: t("assignments.filter.all"),
    "To do": t("assignments.filter.todo"),
    "In progress": t("assignments.filter.inProgress"),
    Submitted: t("assignments.filter.submitted"),
    Graded: t("assignments.filter.graded"),
  };

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs tabs={TABS} value={tab} onChange={setTab} label={t("assignments.filter.label")} counts={counts} labels={tabsLabels} />
        <div className="flex flex-col gap-3 sm:flex-row">
          <SearchInput label={t("assignments.searchLabel")} placeholder={t("assignments.searchPlaceholder")} value={query} onChange={setQuery} className="lg:w-72" />
          <Button onClick={() => void openCreateForm()}><Plus className="h-4 w-4" aria-hidden="true" />{t("assignments.create.button")}</Button>
        </div>
      </div>

      {loading ? <p className="rounded-xl border border-cova-line bg-white p-6 text-sm text-cova-mute">{t("assignments.loading")}</p> : loadError ? (
        <EmptyState icon={ClipboardList} title={t("assignments.loadError")} description={t("assignments.loadErrorDescription")} action={<Button variant="secondary" onClick={() => void loadAssignments()}>{t("common.tryAgain")}</Button>} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t("assignments.emptyTitle")} description={query ? t("assignments.emptySearch") : t("assignments.emptyDescription")} />
      ) : (
        <ul className="space-y-3">
          {filtered.map((assignment) => (
            <li key={assignment.id}>
              <Card><CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold"><Link href={`/assignments/${assignment.id}`} className="hover:underline">{assignment.title}</Link></h2>
                    {assignment.status === "draft" && <Badge tone="pale">{t("assignments.detail.draft")}</Badge>}
                    {assignment.mode === "interactive" && <Badge tone="soft">{t("assignments.runner.interactive")}</Badge>}
                    <Badge tone={assignment.isOwner ? "soft" : assignment.state === "graded" ? "soft" : "pale"}>{assignment.isOwner ? t("assignments.createdByYou") : t(`assignments.status.${assignment.state}` as never)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-cova-mute">{assignment.courseTitle}</p>
                  <p className="mt-2 line-clamp-2 text-sm">{assignment.description}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-cova-mute">
                    <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{assignment.due_at ? new Date(assignment.due_at).toLocaleString(formatTag) : "—"}{assignment.due_at && (new Date(assignment.due_at).getTime() <= Date.now() ? ` · ${t("assignments.deadlinePassed")}` : ` · ${t("assignments.deadlineOpen")}`)}</span>
                    <span>{t("assignments.points", { points: assignment.points })}</span>
                    {assignment.state === "graded" && assignment.grade !== null && <span className="font-medium text-cova-ink">{t("assignments.grade", { grade: assignment.grade, points: assignment.points })}</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {assignment.isOwner && assignment.status === "draft" && (
                    <Button size="sm" variant="secondary" onClick={() => void publishDraft(assignment.id)}>{t("assignments.detail.publish")}</Button>
                  )}
                  <Link href={`/assignments/${assignment.id}`} className="inline-flex h-9 items-center justify-center rounded-lg border border-cova-line bg-white px-3 text-sm font-medium hover:bg-cova-pale">{assignment.isOwner ? t("assignments.openManagement") : t("assignments.openAssignment")}</Link>
                </div>
              </CardBody></Card>
            </li>
          ))}
        </ul>
      )}

      <AssignmentCreate
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        courses={courses}
        initialCourseId={prefill.courseId}
        initialLessonTitle={prefill.lessonTitle}
        onCreated={() => void loadAssignments()}
      />
    </>
  );
}
