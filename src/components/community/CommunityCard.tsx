"use client";

import Link from "next/link";
import { Clock, Globe, Lock, Users } from "lucide-react";
import { RoleBadge } from "@/components/community/CommunityAdminPanels";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { pluralize } from "@/lib/utils";
import type { Community, CommunityRole } from "@/types/social";

interface CommunityCardProps {
  community: Community;
  members: number;
  /** The current user's role, or null if they are not a member. */
  role: CommunityRole | null;
  /** Called when the user clicks "Join" on a public community they are not in. */
  onJoin?: () => void;
  /** True while the user's join request is waiting for approval. */
  pending?: boolean;
}

export function CommunityCard({ community, members, role, onJoin, pending = false }: CommunityCardProps) {
  const isPrivate = community.visibility === "private";

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="soft">{community.category}</Badge>
        <span className="flex items-center gap-1 text-xs text-cova-mute">
          {isPrivate ? (
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {isPrivate ? "Private" : "Public"}
        </span>
        {role && <RoleBadge role={role} />}
      </div>

      <h3 className="mt-3 text-base font-semibold">
        {pending ? (
          community.name
        ) : (
          <Link href={`/community/${community.id}`} className="hover:underline">
            {community.name}
          </Link>
        )}
      </h3>
      <p className="mt-1 line-clamp-3 flex-1 whitespace-pre-line text-sm text-cova-mute">
        {community.description}
      </p>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-cova-mute">
        <Users className="h-3.5 w-3.5" aria-hidden="true" /> {pluralize(members, "member", "members")}
      </p>

      <div className="mt-4">
        {pending ? (
          <p className="flex items-center gap-1.5 text-sm text-cova-mute">
            <Clock className="h-4 w-4" aria-hidden="true" /> Waiting for approval
          </p>
        ) : role ? (
          <Link
            href={`/community/${community.id}`}
            className={buttonStyles({ variant: "secondary", size: "sm" })}
          >
            Open
          </Link>
        ) : (
          <div className="flex gap-2">
            {onJoin && !isPrivate && (
              <Button size="sm" onClick={onJoin}>
                Join
              </Button>
            )}
            <Link
              href={`/community/${community.id}`}
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              View
            </Link>
          </div>
        )}
      </div>
    </Card>
  );
}
