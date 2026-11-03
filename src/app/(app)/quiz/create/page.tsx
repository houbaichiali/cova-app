import type { Metadata } from "next";
import { QuizCreateWizard } from "@/components/quiz/QuizCreateWizard";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("quiz.createQuiz") };
}

export default function QuizCreatePage() {
  return <QuizCreateWizard />;
}
