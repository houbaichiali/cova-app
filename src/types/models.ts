/**
 * PLANNED backend entities (not connected to any database yet).
 *
 * These mirror the Prisma schema in `prisma/schema.prisma`. They describe what the
 * PostgreSQL tables will look like once the backend phase starts. The frontend demo
 * currently uses the lighter UI types in `./index.ts` backed by `src/data/`.
 */

export type Id = string;
export type ISODateString = string;

export type Role = "STUDENT" | "MENTOR" | "ADMIN";

export interface User {
  id: Id;
  email: string;
  /** Hashed by the auth provider/library; never exposed to the client. */
  passwordHash?: string;
  role: Role;
  createdAt: ISODateString;
}

export interface Profile {
  id: Id;
  userId: Id;
  displayName: string;
  headline?: string;
  bio?: string;
  school?: string;
  major?: string;
  location?: string;
  skills: string[];
  interests: string[];
}

export interface Group {
  id: Id;
  name: string;
  description: string;
  category: string;
  isPrivate: boolean;
  ownerId: Id;
  createdAt: ISODateString;
}

export type MembershipRole = "OWNER" | "MODERATOR" | "MEMBER";

export interface GroupMembership {
  id: Id;
  groupId: Id;
  userId: Id;
  role: MembershipRole;
  joinedAt: ISODateString;
}

export interface Message {
  id: Id;
  senderId: Id;
  /** Direct message recipient, or null when posted to a group. */
  recipientId: Id | null;
  groupId: Id | null;
  body: string;
  sentAt: ISODateString;
  readAt: ISODateString | null;
}

export interface Course {
  id: Id;
  title: string;
  description: string;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  category: string;
  authorId: Id;
}

export interface Lesson {
  id: Id;
  courseId: Id;
  title: string;
  kind: "VIDEO" | "READING" | "EXERCISE";
  position: number;
  minutes: number;
  content: string;
}

export interface Assignment {
  id: Id;
  courseId: Id;
  title: string;
  description: string;
  dueAt: ISODateString;
  points: number;
}

export interface Submission {
  id: Id;
  assignmentId: Id;
  userId: Id;
  body: string;
  submittedAt: ISODateString;
  grade: number | null;
  feedback: string | null;
}

export interface Challenge {
  id: Id;
  title: string;
  description: string;
  kind: "DAILY" | "WEEKLY" | "CODING" | "COMMUNITY";
  difficulty: "EASY" | "MEDIUM" | "HARD";
  points: number;
}

export interface UserProgress {
  id: Id;
  userId: Id;
  xp: number;
  level: number;
  completedLessonIds: Id[];
  completedChallengeIds: Id[];
  badgeIds: Id[];
}

export interface Notification {
  id: Id;
  userId: Id;
  kind: "ASSIGNMENT" | "GROUP" | "CHALLENGE" | "MESSAGE" | "SYSTEM";
  title: string;
  body: string;
  href: string | null;
  createdAt: ISODateString;
  readAt: ISODateString | null;
}
