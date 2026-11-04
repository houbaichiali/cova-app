"use client";

import type { ReactNode } from "react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";

/** Admin Center layout: completely separate from the student AppShell. The
 * student navigation never renders here; the gate enforces admin role + MFA
 * (the database remains the real authority for every action). */
export default function AdminAreaLayout({ children }: { children: ReactNode }) {
  return (
    <AdminGate>
      <AdminShell>{children}</AdminShell>
    </AdminGate>
  );
}
