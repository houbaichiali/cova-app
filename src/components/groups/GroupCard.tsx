"use client";

import Link from "next/link";
import { CalendarClock, Lock, Users } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { demoActions } from "@/lib/demo-store";
import type { Group } from "@/types";

export function GroupCard({ group, joined }: { group: Group; joined: boolean }) {
  const toast = useToast();
  const count = group.memberIds.length + (joined ? 1 : 0);

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <Badge tone="soft">{group.category}</Badge>
        {group.isPrivate && (
          <span className="flex items-center gap-1 text-xs text-cova-mute">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Private
          </span>
        )}
      </div>
      <Link href={`/groups/${group.id}`} className="mt-3 font-semibold hover:underline">
        {group.name}
      </Link>
      <p className="mt-1 line-clamp-3 flex-1 text-sm text-cova-mute">{group.description}</p>
      <div className="mt-4 space-y-1 text-xs text-cova-mute">
        <p className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" aria-hidden="true" /> {count} members
        </p>
        {group.nextSession && (
          <p className="flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> {group.nextSession}
          </p>
        )}
      </div>
      <div className="mt-5">
        <Button
          size="sm"
          className="w-full"
          variant={joined ? "secondary" : "primary"}
          onClick={() => {
            demoActions.toggleGroup(group.id);
            toast.push(
              joined
                ? `Left ${group.name}`
                : group.isPrivate
                  ? `Request sent to ${group.name}`
                  : `Joined ${group.name}`,
            );
          }}
        >
          {joined ? "Leave group" : group.isPrivate ? "Request to join" : "Join group"}
        </Button>
      </div>
    </Card>
  );
}
