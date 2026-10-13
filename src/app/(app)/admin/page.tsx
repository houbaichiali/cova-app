import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const metadata: Metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <>
      <PageHeader title="Admin" description="A basic overview of the community." />
      <AdminDashboard />
    </>
  );
}
