import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ResourcesBrowser } from "@/components/learning/ResourcesBrowser";

export const metadata: Metadata = { title: "Resources" };

export default function ResourcesPage() {
  return (
    <>
      <PageHeader
        title="Resources"
        description="Guides, cheat sheets and tools shared by the community."
      />
      <ResourcesBrowser />
    </>
  );
}
