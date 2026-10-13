import type { Conversation } from "@/types";

export const conversations: Conversation[] = [
  {
    id: "cv-1",
    participantId: "amara-okafor",
    unread: 2,
    messages: [
      {
        id: "m1",
        from: "them",
        text: "Hi Sam! Are you joining the algorithms circle on Thursday?",
        time: "09:12",
      },
      { id: "m2", from: "me", text: "Yes, I'd like to. Should I prepare anything?", time: "09:20" },
      {
        id: "m3",
        from: "them",
        text: "Just bring one graph problem you found tricky.",
        time: "09:24",
      },
      {
        id: "m4",
        from: "them",
        text: "I'll share a template for the session notes too.",
        time: "09:25",
      },
    ],
  },
  {
    id: "cv-2",
    participantId: "lucas-meyer",
    unread: 0,
    messages: [
      {
        id: "m5",
        from: "me",
        text: "Thanks for the feedback on my landing page!",
        time: "Yesterday",
      },
      {
        id: "m6",
        from: "them",
        text: "Anytime. Try increasing the contrast on the secondary buttons.",
        time: "Yesterday",
      },
    ],
  },
  {
    id: "cv-3",
    participantId: "priya-nair",
    unread: 1,
    messages: [
      {
        id: "m7",
        from: "them",
        text: "The regression notebook is shared in the ML group. Want to pair on it this weekend?",
        time: "Mon",
      },
    ],
  },
  {
    id: "cv-4",
    participantId: "noor-haddad",
    unread: 0,
    messages: [
      {
        id: "m8",
        from: "them",
        text: "Exam sprint starts Monday at 19:00. Hope you can make it.",
        time: "Sun",
      },
      { id: "m9", from: "me", text: "I'll be there. Thanks for organising!", time: "Sun" },
    ],
  },
];
