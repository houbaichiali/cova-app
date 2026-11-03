import type { Metadata } from "next";
import { QuizDashboard } from "@/components/quiz/QuizDashboard";

export const metadata: Metadata = { title: "COVA QUIZ" };

export default function QuizPage() {
  return <QuizDashboard />;
}
