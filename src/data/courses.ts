import type { Course, Lesson, LessonType } from "@/types";

function lessons(prefix: string, items: [string, LessonType, number, string][]): Lesson[] {
  return items.map(([title, type, minutes, summary], i) => ({
    id: `${prefix}-l${i + 1}`,
    title,
    type,
    minutes,
    summary,
  }));
}

export const courses: Course[] = [
  {
    id: "intro-python",
    title: "Introduction to Python",
    description:
      "Start from zero and write real programs. Variables, control flow, functions and small projects.",
    level: "Beginner",
    category: "Programming",
    instructor: "Amara Okafor",
    tags: ["Python", "Fundamentals"],
    learners: 1240,
    lessons: lessons("intro-python", [
      [
        "Your first program",
        "video",
        12,
        "Install Python, run a script and print your first line of output.",
      ],
      [
        "Variables and types",
        "reading",
        15,
        "Numbers, strings and booleans, and how Python stores them.",
      ],
      ["Making decisions", "video", 14, "Use if, elif and else to change what your program does."],
      [
        "Loops in practice",
        "exercise",
        25,
        "Practise for and while loops with five short exercises.",
      ],
      [
        "Writing functions",
        "video",
        18,
        "Break programs into reusable pieces with parameters and return values.",
      ],
      [
        "Mini project: number guesser",
        "exercise",
        35,
        "Combine everything into a small game you can share.",
      ],
    ]),
  },
  {
    id: "web-foundations",
    title: "Web Foundations: HTML, CSS and JavaScript",
    description:
      "Build responsive pages and add interactivity. A practical path into front-end development.",
    level: "Beginner",
    category: "Web development",
    instructor: "Lucas Meyer",
    tags: ["HTML", "CSS", "JavaScript"],
    learners: 980,
    lessons: lessons("web-foundations", [
      [
        "How the web works",
        "reading",
        10,
        "Browsers, servers and what happens when you open a page.",
      ],
      [
        "Structuring pages with HTML",
        "video",
        16,
        "Headings, lists, links, images and semantic elements.",
      ],
      ["Styling with CSS", "video", 20, "Selectors, the box model and colours."],
      ["Layouts with Flexbox", "exercise", 28, "Build a responsive navigation bar and card grid."],
      ["JavaScript essentials", "video", 22, "Variables, functions and responding to clicks."],
    ]),
  },
  {
    id: "data-structures",
    title: "Data Structures and Algorithms",
    description:
      "Understand arrays, stacks, trees and graphs, and learn to reason about time and space complexity.",
    level: "Intermediate",
    category: "Computer science",
    instructor: "Kenji Tanaka",
    tags: ["Algorithms", "Complexity"],
    learners: 760,
    lessons: lessons("data-structures", [
      [
        "Big-O notation",
        "reading",
        14,
        "Compare algorithms by how their cost grows with input size.",
      ],
      ["Arrays and linked lists", "video", 20, "Trade-offs between contiguous and linked storage."],
      [
        "Stacks and queues",
        "exercise",
        24,
        "Implement both and use them to solve parsing problems.",
      ],
      ["Trees and traversal", "video", 26, "Binary trees, depth-first and breadth-first search."],
      [
        "Graphs and shortest paths",
        "video",
        30,
        "Model networks and find the shortest route between nodes.",
      ],
      [
        "Dynamic programming basics",
        "exercise",
        40,
        "Recognise overlapping subproblems and build a table solution.",
      ],
    ]),
  },
  {
    id: "intro-ml",
    title: "Machine Learning Foundations",
    description:
      "A gentle, math-light introduction to supervised learning, evaluation and common pitfalls.",
    level: "Intermediate",
    category: "Data and AI",
    instructor: "Priya Nair",
    tags: ["Machine learning", "Python"],
    learners: 690,
    lessons: lessons("intro-ml", [
      [
        "What is machine learning?",
        "video",
        12,
        "Supervised, unsupervised and reinforcement learning at a glance.",
      ],
      ["Linear regression", "video", 22, "Fit a line to data and interpret the result."],
      [
        "Training and test sets",
        "reading",
        12,
        "Why you must evaluate on data the model has not seen.",
      ],
      [
        "Classification with logistic regression",
        "exercise",
        32,
        "Predict categories and read a confusion matrix.",
      ],
    ]),
  },
  {
    id: "study-skills",
    title: "Effective Study Techniques",
    description:
      "Evidence-based habits for learning faster: spaced repetition, active recall and planning.",
    level: "Beginner",
    category: "Learning skills",
    instructor: "Noor Haddad",
    tags: ["Productivity", "Memory"],
    learners: 1530,
    lessons: lessons("study-skills", [
      ["How memory works", "reading", 10, "Why cramming fails and what to do instead."],
      ["Active recall", "video", 14, "Test yourself instead of rereading."],
      [
        "Spaced repetition",
        "exercise",
        18,
        "Build a simple review schedule for one of your courses.",
      ],
      [
        "Planning your week",
        "reading",
        9,
        "Time-block your study sessions around your real schedule.",
      ],
    ]),
  },
  {
    id: "secure-web",
    title: "Web Security Essentials",
    description: "Learn the most common web vulnerabilities and how developers prevent them.",
    level: "Advanced",
    category: "Security",
    instructor: "Tomáš Novák",
    tags: ["Security", "Web"],
    learners: 410,
    lessons: lessons("secure-web", [
      ["Threat modelling basics", "reading", 15, "Think like an attacker to protect what matters."],
      [
        "Injection and input validation",
        "video",
        24,
        "How injection attacks work and how to stop them.",
      ],
      [
        "Authentication and sessions",
        "video",
        26,
        "Passwords, cookies, tokens and safe session handling.",
      ],
      [
        "Hands-on lab: find the flaw",
        "exercise",
        45,
        "Review a small vulnerable app and write a short report.",
      ],
    ]),
  },
];

export function getCourse(id: string): Course | undefined {
  return courses.find((c) => c.id === id);
}
