import type { Group } from "@/types";

export const groups: Group[] = [
  {
    id: "algorithms-circle",
    name: "Algorithms Study Circle",
    description:
      "Weekly problem-solving sessions covering sorting, graphs and dynamic programming. All levels welcome.",
    category: "Study",
    memberIds: ["amara-okafor", "priya-nair", "kenji-tanaka", "hana-kim", "tomas-novak"],
    tags: ["Algorithms", "Interview prep"],
    isPrivate: false,
    nextSession: "Thursday, 18:00 UTC",
    ownerId: "amara-okafor",
    activity: [
      {
        id: "a1",
        author: "Amara Okafor",
        text: "This week we'll work through graph traversal. Bring one problem you got stuck on.",
        time: "3h ago",
      },
      {
        id: "a2",
        author: "Priya Nair",
        text: "Shared my dynamic programming notes in Resources.",
        time: "1d ago",
      },
    ],
  },
  {
    id: "portfolio-builders",
    name: "Portfolio Builders",
    description:
      "Pair up with designers and developers to ship small portfolio projects in four-week sprints.",
    category: "Project",
    memberIds: ["lucas-meyer", "kenji-tanaka", "omar-saleh", "chloe-martin"],
    tags: ["Portfolio", "Teamwork"],
    isPrivate: false,
    nextSession: "Saturday, 15:00 UTC",
    ownerId: "lucas-meyer",
    activity: [
      {
        id: "b1",
        author: "Lucas Meyer",
        text: "Sprint 3 kicks off Saturday. Post your project idea in the thread.",
        time: "5h ago",
      },
    ],
  },
  {
    id: "react-workshop",
    name: "React Workshop",
    description: "Learn React by building together: components, state, routing and testing.",
    category: "Coding",
    memberIds: ["kenji-tanaka", "lucas-meyer", "amara-okafor"],
    tags: ["React", "TypeScript"],
    isPrivate: false,
    nextSession: "Wednesday, 17:30 UTC",
    ownerId: "kenji-tanaka",
    activity: [
      {
        id: "c1",
        author: "Kenji Tanaka",
        text: "Pairing session recording is up. Next topic: state management without a library.",
        time: "2d ago",
      },
    ],
  },
  {
    id: "design-critique",
    name: "Design Critique Corner",
    description:
      "Share work in progress and get kind, specific feedback on layout, typography and accessibility.",
    category: "Design",
    memberIds: ["lucas-meyer", "elena-popescu", "chloe-martin"],
    tags: ["UI", "Feedback"],
    isPrivate: false,
    nextSession: "Friday, 16:00 UTC",
    ownerId: "lucas-meyer",
    activity: [
      {
        id: "d1",
        author: "Chloé Martin",
        text: "Posted a map legend redesign for feedback.",
        time: "6h ago",
      },
    ],
  },
  {
    id: "ml-beginners",
    name: "Machine Learning for Beginners",
    description: "Work through an introductory ML curriculum together, with weekly mini-projects.",
    category: "Study",
    memberIds: ["priya-nair", "sofia-rossi", "hana-kim", "amara-okafor"],
    tags: ["Machine learning", "Python"],
    isPrivate: false,
    nextSession: "Sunday, 14:00 UTC",
    ownerId: "priya-nair",
    activity: [
      {
        id: "e1",
        author: "Priya Nair",
        text: "Linear regression notebook is ready. Duplicate it and try the exercises.",
        time: "1d ago",
      },
    ],
  },
  {
    id: "exam-sprint",
    name: "Exam Sprint Club",
    description: "Focused two-hour study sprints before exams. Quiet, timed, and friendly.",
    category: "Study",
    memberIds: ["noor-haddad", "omar-saleh", "sofia-rossi", "diego-fernandez", "hana-kim"],
    tags: ["Exam prep", "Focus"],
    isPrivate: true,
    nextSession: "Monday, 19:00 UTC",
    ownerId: "noor-haddad",
    activity: [
      {
        id: "f1",
        author: "Noor Haddad",
        text: "Sprint rules: 50 minutes focus, 10 minutes break. Camera optional.",
        time: "4d ago",
      },
    ],
  },
  {
    id: "conversation-circle",
    name: "Multilingual Conversation Circle",
    description: "Practice French, Spanish, Romanian and more in relaxed weekly conversations.",
    category: "Languages",
    memberIds: ["elena-popescu", "chloe-martin", "diego-fernandez"],
    tags: ["Languages", "Speaking"],
    isPrivate: false,
    nextSession: "Sunday, 11:00 UTC",
    ownerId: "elena-popescu",
    activity: [
      {
        id: "g1",
        author: "Elena Popescu",
        text: "This Sunday's theme: travel stories. Bring one in any language you're learning.",
        time: "2d ago",
      },
    ],
  },
  {
    id: "ctf-team",
    name: "Campus CTF Team",
    description: "Practice capture-the-flag challenges and learn security fundamentals as a team.",
    category: "Coding",
    memberIds: ["tomas-novak", "kenji-tanaka"],
    tags: ["Security", "CTF"],
    isPrivate: false,
    nextSession: "Tuesday, 20:00 UTC",
    ownerId: "tomas-novak",
    activity: [
      {
        id: "h1",
        author: "Tomáš Novák",
        text: "Beginner-friendly web challenges this week. No prior experience needed.",
        time: "3d ago",
      },
    ],
  },
];

export function getGroup(id: string): Group | undefined {
  return groups.find((g) => g.id === id);
}
