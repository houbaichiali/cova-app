import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { AdminUsers } from "@/components/admin/AdminUsers";

export const metadata: Metadata = { title: "Admin · Users" };

export default function AdminUsersPage() {
  return (
    <>
      <PageHeader title="Users" description="Search, inspect and manage COVA accounts." />
      <AdminUsers />
    </>
  );
}
