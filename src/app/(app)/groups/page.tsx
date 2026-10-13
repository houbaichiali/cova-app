import type { Metadata } from "next";
import { GroupsBrowser } from "@/components/groups/GroupsBrowser";

export const metadata: Metadata = { title: "Groups" };

export default function GroupsPage() {
  return <GroupsBrowser />;
}
