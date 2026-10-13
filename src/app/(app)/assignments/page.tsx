import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { AssignmentsBoard } from "@/components/learning/AssignmentsBoard";

export const metadata: Metadata = { title: "Assignments" };

export default function AssignmentsPage() {
  return (
    <>
      <PageHeader
        title="Assignments"
        description="Track what's due, submit your work and review grades."
      />
      <AssignmentsBoard />
    </>
  );
}
