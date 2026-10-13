"use client";

import Link from "next/link";
import { MapPin, UserCheck, UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { demoActions } from "@/lib/demo-store";
import type { Student } from "@/types";

export function StudentCard({ student, connected }: { student: Student; connected: boolean }) {
  const toast = useToast();
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        <Avatar name={student.name} tone={student.tone} size="md" />
        <div className="min-w-0">
          <Link
            href={`/community/${student.id}`}
            className="block truncate font-semibold hover:underline"
          >
            {student.name}
          </Link>
          <p className="line-clamp-2 text-sm text-cova-mute">{student.headline}</p>
        </div>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-cova-mute">
        <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {student.location}
      </p>
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Skills">
        {student.skills.map((s) => (
          <li key={s}>
            <Badge>{s}</Badge>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex gap-2 pt-1">
        <Button
          size="sm"
          variant={connected ? "secondary" : "primary"}
          className="flex-1"
          onClick={() => {
            demoActions.toggleConnection(student.id);
            toast.push(
              connected
                ? `Removed ${student.name} from connections`
                : `Connected with ${student.name}`,
            );
          }}
        >
          {connected ? (
            <UserCheck className="h-4 w-4" aria-hidden="true" />
          ) : (
            <UserPlus className="h-4 w-4" aria-hidden="true" />
          )}
          {connected ? "Connected" : "Connect"}
        </Button>
        <Link
          href={`/community/${student.id}`}
          className="inline-flex h-8 items-center rounded-lg border border-cova-line px-3 text-sm font-medium hover:bg-cova-pale"
        >
          Profile
        </Link>
      </div>
    </Card>
  );
}
