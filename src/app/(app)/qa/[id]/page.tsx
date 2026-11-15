import type { Metadata } from "next";
import { QaDetail } from "@/components/qa/QaDetail";

export const metadata: Metadata = { title: "Q&A" };

export default async function QaQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <QaDetail questionId={id} />;
}
