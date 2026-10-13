import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { assignments } from "@/data/assignments";
import { getCourse } from "@/data/courses";
import { effectiveStatus } from "@/lib/progress";
import { daysUntil, dueLabel } from "@/lib/utils";
import type { DemoState } from "@/lib/demo-store";

export function UpcomingAssignments({ state }: { state: DemoState }) {
  const upcoming = assignments
    .filter((a) => ["todo", "in-progress"].includes(effectiveStatus(a, state)))
    .sort((a, b) => daysUntil(a.due) - daysUntil(b.due))
    .slice(0, 4);

  return (
    <Card>
      <CardHeader
        title="Upcoming assignments"
        action={
          <Link
            href="/assignments"
            className="text-sm font-medium underline-offset-2 hover:underline"
          >
            View all
          </Link>
        }
      />
      <CardBody>
        {upcoming.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-cova-mute">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> You&apos;re all caught up.
          </p>
        ) : (
          <ul className="divide-y divide-cova-line">
            {upcoming.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.title}</p>
                  <p className="truncate text-xs text-cova-mute">{getCourse(a.courseId)?.title}</p>
                </div>
                <Badge tone={daysUntil(a.due) <= 3 ? "soft" : "pale"}>{dueLabel(a.due)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
