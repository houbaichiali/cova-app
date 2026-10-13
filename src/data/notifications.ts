import type { AppNotification } from "@/types";

export const notifications: AppNotification[] = [
  {
    id: "n1",
    kind: "assignment",
    title: "Assignment due soon",
    body: "Number guesser game is due in 3 days.",
    time: "1h ago",
    href: "/assignments",
  },
  {
    id: "n2",
    kind: "message",
    title: "New message from Amara Okafor",
    body: "I'll share a template for the session notes too.",
    time: "2h ago",
    href: "/messages",
  },
  {
    id: "n3",
    kind: "group",
    title: "New activity in Algorithms Study Circle",
    body: "Amara posted this week's graph traversal plan.",
    time: "3h ago",
    href: "/groups/algorithms-circle",
  },
  {
    id: "n4",
    kind: "challenge",
    title: "Daily challenge is live",
    body: "Reverse a string is worth 20 XP today.",
    time: "6h ago",
    href: "/challenges",
  },
  {
    id: "n5",
    kind: "assignment",
    title: "Grade posted",
    body: "Study plan reflection: 56 / 60.",
    time: "1d ago",
    href: "/assignments",
  },
  {
    id: "n6",
    kind: "system",
    title: "Welcome to COVA",
    body: "This is a demo workspace. Your progress is saved in this browser only.",
    time: "2d ago",
    href: "/settings",
  },
];
