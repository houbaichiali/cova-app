import type { Metadata } from "next";
import { GroupDetail } from "@/components/groups/GroupDetail";

export const metadata: Metadata = { title: "Group" };

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GroupDetail code={id} />;
}
