import type { Metadata } from "next";
import { AppealsPageContent } from "@/components/moderation/AppealsPageContent";

export const metadata: Metadata = { title: "My sanctions" };

export default function AppealsPage() {
  return <AppealsPageContent />;
}
