import type { Metadata } from "next";
import { QaBoard } from "@/components/qa/QaBoard";

export const metadata: Metadata = { title: "Q&A" };

export default function QaPage() {
  return <QaBoard />;
}
