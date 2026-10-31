import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { DeactivatedGate } from "@/components/settings/DeactivatedGate";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <DeactivatedGate />
      {children}
    </AppShell>
  );
}
