import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
}

export function StatCard({ icon: Icon, label, value, detail }: StatCardProps) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-cova-pale">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-cova-mute">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
        {detail && <p className="truncate text-xs text-cova-mute">{detail}</p>}
      </div>
    </Card>
  );
}
