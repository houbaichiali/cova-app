import type { Metadata } from "next";
import { AdminHome } from "@/components/admin/AdminHome";

export const metadata: Metadata = { title: "Admin Center" };

export default function AdminHomePage() {
  return <AdminHome />;
}
