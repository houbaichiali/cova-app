import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { buttonStyles } from "@/components/ui/Button";
import { courses } from "@/data/courses";
import { courseProgress } from "@/lib/progress";

export function ContinueLearning({
  enrolled,
  completedLessons,
}: {
  enrolled: string[];
  completedLessons: string[];
}) {
  const active = courses.filter((c) => enrolled.includes(c.id));
  return (
    <Card>
      <CardHeader
        title="Continue learning"
        action={
          <Link href="/courses" className="text-sm font-medium underline-offset-2 hover:underline">
            All courses
          </Link>
        }
      />
      <CardBody>
        {active.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No courses yet"
            description="Enrol in a course to track your lessons and progress here."
            action={
              <Link href="/courses" className={buttonStyles()}>
                Browse courses
              </Link>
            }
          />
        ) : (
          <ul className="space-y-5">
            {active.map((c) => {
              const p = courseProgress(c, completedLessons);
              return (
                <li key={c.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <Link href={`/courses/${c.id}`} className="font-medium hover:underline">
                      {c.title}
                    </Link>
                    <span className="shrink-0 text-xs text-cova-mute">
                      {p.done} of {p.total} lessons
                    </span>
                  </div>
                  <ProgressBar value={p.pct} label={`${c.title} progress`} className="mt-2" />
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
