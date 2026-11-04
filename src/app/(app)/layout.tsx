import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { DeactivatedGate } from "@/components/settings/DeactivatedGate";
import { SanctionGate } from "@/components/moderation/SanctionGate";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <DeactivatedGate />
      <SanctionGate>
        {children}
      </SanctionGate>
    </AppShell>
  );
}
