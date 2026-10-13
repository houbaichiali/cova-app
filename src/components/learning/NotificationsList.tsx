"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, BellOff, ClipboardList, MessageSquare, Settings, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs } from "@/components/ui/Tabs";
import { notifications } from "@/data/notifications";
import { demoActions, useDemoState } from "@/lib/demo-store";
import { cn } from "@/lib/utils";
import type { NotificationKind } from "@/types";

const TABS = ["All", "Unread"] as const;
const icons: Record<NotificationKind, typeof Bell> = {
  assignment: ClipboardList,
  group: Users,
  challenge: Trophy,
  message: MessageSquare,
  system: Settings,
};

export function NotificationsList() {
  const { readNotifications } = useDemoState();
  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const unread = notifications.filter((n) => !readNotifications.includes(n.id));
  const rows = tab === "All" ? notifications : unread;

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Tabs
          tabs={TABS}
          value={tab}
          onChange={setTab}
          label="Notification filter"
          counts={{ Unread: unread.length }}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={unread.length === 0}
          onClick={() => demoActions.markAllNotificationsRead(notifications.map((n) => n.id))}
        >
          Mark all as read
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="You're all caught up"
          description="New notifications about assignments, groups and messages will show up here."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-cova-line">
            {rows.map((n) => {
              const Icon = icons[n.kind];
              const isUnread = !readNotifications.includes(n.id);
              return (
                <li
                  key={n.id}
                  className={cn("flex items-start gap-4 p-4", isUnread && "bg-cova-pale/50")}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cova-pale">
                    <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {n.title}
                      {isUnread && <span className="sr-only"> (unread)</span>}
                    </p>
                    <p className="text-sm text-cova-mute">{n.body}</p>
                    <p className="mt-1 flex gap-3 text-xs text-cova-mute">
                      <span>{n.time}</span>
                      {n.href && (
                        <Link
                          href={n.href}
                          onClick={() => demoActions.markNotificationRead(n.id)}
                          className="font-medium text-cova-ink underline-offset-2 hover:underline"
                        >
                          Open
                        </Link>
                      )}
                    </p>
                  </div>
                  {isUnread && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => demoActions.markNotificationRead(n.id)}
                    >
                      Mark as read
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
