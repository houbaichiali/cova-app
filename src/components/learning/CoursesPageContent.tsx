"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { CoursesBrowser } from "@/components/learning/CoursesBrowser";
import { ModuleCreateModal } from "@/components/learning/ModuleCreateModal";
import { JoinCourse } from "@/components/learning/JoinCourse";
import { Button } from "@/components/ui/Button";
import { useT } from "@/i18n/client";

export function CoursesPageContent() {
  const t = useT();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title={t("courses.title")}
        description={t("courses.pageDescription")}
      />

      <div className="grid w-full min-w-0 grid-cols-2 items-start gap-3">
        <section className="w-full min-w-0 flex-1 [&>*]:w-full">
          <Button onClick={() => setCreateOpen(true)} className="w-full justify-center">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("courses.create.button")}
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
    </div>
  );
}
