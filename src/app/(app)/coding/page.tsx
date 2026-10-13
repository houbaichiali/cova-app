import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { CodingLab } from "@/components/coding/CodingLab";

export const metadata: Metadata = { title: "Coding Lab" };

export default function CodingPage() {
  return (
    <>
      <PageHeader
        title="Coding Lab"
        description="Practise short exercises in an editor-style workspace."
      />
      <CodingLab />
    </>
  );
}
