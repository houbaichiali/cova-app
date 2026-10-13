"use client";

import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { groups } from "@/data/groups";
import { demoActions } from "@/lib/demo-store";

export function SuggestedGroups({ joined }: { joined: string[] }) {
  const toast = useToast();
  const suggestions = groups.filter((g) => !g.isPrivate && !joined.includes(g.id)).slice(0, 3);

  return (
    <Card>
      <CardHeader
        title="Groups to join"
        action={
          <Link href="/groups" className="text-sm font-medium underline-offset-2 hover:underline">
            Browse groups
          </Link>
        }
      />
      <CardBody>
        {suggestions.length === 0 ? (
          <p className="text-sm text-cova-mute">
            You&apos;ve joined all the open groups. Nice work.
          </p>
        ) : (
          <ul className="space-y-4">
            {suggestions.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/groups/${g.id}`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {g.name}
                  </Link>
                  <p className="text-xs text-cova-mute">{g.memberIds.length} members</p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    demoActions.toggleGroup(g.id);
                    toast.push(`Joined ${g.name}`);
                  }}
                >
                  Join
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
