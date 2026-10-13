import type { Assignment } from "@/types";

/** Fixed "today" for deterministic demo rendering. */
export const DEMO_TODAY = "2026-10-11";

export const assignments: Assignment[] = [
  {
    id: "as-1",
    title: "Number guesser game",
    courseId: "intro-python",
    description:
      "Build a command-line game where the computer picks a number and the player guesses it. Include hints and a guess counter.",
    due: "2026-10-14",
    points: 100,
    status: "in-progress",
  },
  {
    id: "as-2",
    title: "Personal landing page",
    courseId: "web-foundations",
    description:
      "Create a one-page personal site with semantic HTML, a responsive layout and at least one interactive element.",
    due: "2026-10-18",
    points: 150,
    status: "todo",
  },
  {
    id: "as-3",
    title: "Stack and queue implementation",
    courseId: "data-structures",
    description:
      "Implement a stack and a queue from scratch and use them to solve the balanced-brackets problem.",
    due: "2026-10-21",
    points: 120,
    status: "todo",
  },
  {
    id: "as-4",
    title: "Regression on housing data",
    courseId: "intro-ml",
    description:
      "Fit a linear regression to the provided dataset and write a half-page summary of what the model learned.",
    due: "2026-10-25",
    points: 140,
    status: "todo",
  },
  {
    id: "as-5",
    title: "Study plan reflection",
    courseId: "study-skills",
    description:
      "Write a short plan for the next two weeks using at least two techniques from the course.",
    due: "2026-10-09",
    points: 60,
    status: "graded",
    grade: 56,
  },
  {
    id: "as-6",
    title: "Variables and types quiz project",
    courseId: "intro-python",
    description: "Create a short quiz program that demonstrates each basic data type.",
    due: "2026-10-05",
    points: 80,
    status: "graded",
    grade: 74,
  },
  {
    id: "as-7",
    title: "Security review report",
    courseId: "secure-web",
    description:
      "Review the sample application and list three vulnerabilities with suggested fixes.",
    due: "2026-11-02",
    points: 200,
    status: "todo",
  },
  {
    id: "as-8",
    title: "Flexbox card layout",
    courseId: "web-foundations",
    description: "Reproduce the provided card layout using only Flexbox.",
    due: "2026-10-12",
    points: 70,
    status: "submitted",
  },
];

export function getAssignment(id: string): Assignment | undefined {
  return assignments.find((a) => a.id === id);
}
