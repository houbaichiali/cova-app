import type { Metadata } from "next";
import { LessonPageClient } from "@/components/learning/LessonPageClient";

export const metadata: Metadata = { title: "Lesson" };

interface PageProps {
  params: Promise<{ id: string; lessonId: string }>;
}

export default async function LessonPage({ params }: PageProps) {
  const { id, lessonId } = await params;
  return <LessonPageClient courseId={id} lessonId={lessonId} />;
}
