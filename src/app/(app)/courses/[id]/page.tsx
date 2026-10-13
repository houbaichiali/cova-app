import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CourseDetail } from "@/components/learning/CourseDetail";
import { courses, getCourse } from "@/data/courses";

interface PageProps {
  params: Promise<{ id: string }>;
}

export function generateStaticParams() {
  return courses.map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: getCourse(id)?.title ?? "Course" };
}

export default async function CoursePage({ params }: PageProps) {
  const { id } = await params;
  const course = getCourse(id);
  if (!course) notFound();
  return <CourseDetail course={course} />;
}
