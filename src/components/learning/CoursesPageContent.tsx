"use client";

import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { CoursesBrowser } from "@/components/learning/CoursesBrowser";
import { ModuleCreateModal } from "@/components/learning/ModuleCreateModal";
import { LessonCreateModal, type ModuleOption } from "@/components/learning/LessonCreateModal";
import { JoinCourse } from "@/components/learning/JoinCourse";
import { Button } from "@/components/ui/Button";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";

export function CoursesPageContent() {
  const t = useT();
  const [createOpen, setCreateOpen] = useState(false);
  const [lessonOpen, setLessonOpen] = useState(false);
  const [modules, setModules] = useState<ModuleOption[]>([]);

  // "Create a lesson" needs the teacher's own modules to attach the lesson to.
  const openLessonCreate = useCallback(async () => {
    try {
      const supabase = getSupabase();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from("courses")
        .select("id,title")
        .eq("created_by", auth.user.id)
        .order("title");
      setModules((data ?? []) as ModuleOption[]);
    } catch (error) {
      console.error("Unable to load the modules:", error);
      setModules([]);
    }
    setLessonOpen(true);
  }, []);

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title={t("courses.title")}
        description={t("courses.pageDescription")}
      />

      <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
        <section className="w-full min-w-0 flex-1 [&>*]:w-full">
          <Button onClick={() => setCreateOpen(true)} className="w-full justify-center">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("courses.create.button")}
          </Button>
        </section>
        <section className="w-full min-w-0 flex-1 [&>*]:w-full">
          <Button variant="secondary" onClick={() => void openLessonCreate()} className="w-full justify-center">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("lessons.workspace.addLesson")}
          </Button>
        </section>
        <section className="w-full min-w-0 flex-1 [&>*]:w-full">
          <JoinCourse />
        </section>
      </div>

      <div className="mt-6 min-w-0">
        <CoursesBrowser />
      </div>

      <ModuleCreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <LessonCreateModal
        open={lessonOpen}
        onClose={() => setLessonOpen(false)}
        modules={modules}
        onCreated={() => undefined}
      />
    </div>
  );
}
