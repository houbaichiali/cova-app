import type { Metadata } from "next";
import { QuizPlay } from "@/components/quiz/QuizPlay";

export const metadata: Metadata = { title: "COVA QUIZ" };

export default async function QuizPlayPage({ params }: { params: Promise<{ pin: string }> }) {
  const { pin } = await params;
  return <QuizPlay pin={pin} />;
}
