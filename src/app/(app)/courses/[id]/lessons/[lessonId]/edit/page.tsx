import type { Metadata } from "next";
import { LessonPageClient } from "@/components/learning/LessonPageClient";

export const metadata: Metadata = { title: "Edit lesson" };

interface PageProps {
  params: Promise<{ id: string; lessonId: string }>;
}

export default async function EditLessonPage({ params }: PageProps) {
  const { id, lessonId } = await params;
  return <LessonPageClient courseId={id} lessonId={lessonId} edit />;
}
