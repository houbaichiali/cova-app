import type { ReactNode } from "react";
import { Info } from "lucide-react";

export function DemoNotice({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-cova-pale px-3 py-2 text-xs text-cova-ink">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
