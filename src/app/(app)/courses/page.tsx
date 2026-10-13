import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { CoursesBrowser } from "@/components/learning/CoursesBrowser";

export const metadata: Metadata = { title: "Courses" };

export default function CoursesPage() {
  return (
    <>
      <PageHeader
        title="Courses"
        description="Structured lessons from fellow students. Enrolment and progress are saved in this browser only."
      />
      <CoursesBrowser />
    </>
  );
}
