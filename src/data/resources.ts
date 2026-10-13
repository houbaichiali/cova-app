import type { Resource } from "@/types";

export const resources: Resource[] = [
  {
    id: "r1",
    title: "Big-O cheat sheet",
    type: "Cheatsheet",
    category: "Computer science",
    description:
      "A one-page summary of common time and space complexities for core data structures and sorting algorithms.",
    minutes: 5,
  },
  {
    id: "r2",
    title: "How to read a research paper",
    type: "Article",
    category: "Learning skills",
    description:
      "A three-pass method for reading academic papers without getting lost in the details.",
    minutes: 12,
  },
  {
    id: "r3",
    title: "CSS Flexbox visual guide",
    type: "Cheatsheet",
    category: "Web development",
    description: "Diagrams that show every Flexbox property with a live-style example.",
    minutes: 8,
  },
  {
    id: "r4",
    title: "Intro to Git in 20 minutes",
    type: "Video",
    category: "Tools",
    description: "Commits, branches and pull requests explained with a small team workflow.",
    minutes: 20,
  },
  {
    id: "r5",
    title: "Spaced repetition planner",
    type: "Tool",
    category: "Learning skills",
    description: "A printable weekly planner for scheduling reviews at growing intervals.",
    minutes: 3,
  },
  {
    id: "r6",
    title: "Python for everyone: reading list",
    type: "Book",
    category: "Programming",
    description:
      "A curated list of free beginner-friendly Python books and the chapters worth starting with.",
    minutes: 15,
  },
  {
    id: "r7",
    title: "Writing clear lab reports",
    type: "Article",
    category: "Science",
    description: "Structure, tables, figures and common mistakes in undergraduate lab reports.",
    minutes: 10,
  },
  {
    id: "r8",
    title: "Accessible colour contrast guide",
    type: "Article",
    category: "Design",
    description: "Practical rules for choosing readable text and background colour combinations.",
    minutes: 9,
  },
  {
    id: "r9",
    title: "Linear algebra intuition",
    type: "Video",
    category: "Mathematics",
    description: "A visual walkthrough of vectors, matrices and transformations.",
    minutes: 25,
  },
  {
    id: "r10",
    title: "Pomodoro focus timer",
    type: "Tool",
    category: "Productivity",
    description: "Run 25-minute focus sessions with automatic breaks and a daily session log.",
    minutes: 2,
  },
];
