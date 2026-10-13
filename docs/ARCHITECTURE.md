# COVA architecture and backend plan

## Where we are

The app is a Next.js (App Router) frontend. All data comes from `src/data/` and all user actions are stored in the browser by `src/lib/demo-store.ts`. **No database, API or authentication exists yet.**

The demo store is a small external store (`useSyncExternalStore`) persisted to `localStorage` under the key `cova-demo-state-v1`. Components call `demoActions.*` to change state and `useDemoState()` to read it. When the backend arrives, these calls are the seams to replace with real requests.

## Planned entities

The planned data model is described three ways, kept in sync by hand:

- `prisma/schema.prisma` — PostgreSQL schema (planned, not installed)
- `src/types/models.ts` — TypeScript shapes of the same entities
- `src/types/index.ts` — lighter UI types used by the demo today

Entities: **User, Profile, Group, GroupMembership, Message, Course, Lesson, Assignment, Submission, Challenge, UserProgress, Notification.**

## Demo features and what they need

| Feature                               | Today (demo)                                                | Needs from the backend                                                                                                                         |
| ------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Login and registration                | Validates the form, stores a fake session in `localStorage` | Real authentication (for example Auth.js or a managed provider), password hashing or OAuth, secure sessions, email verification, rate limiting |
| Route protection and roles            | None; every route is open                                   | Server-side session checks (middleware or per-route), role-based access for `/admin`                                                           |
| Student profiles and discovery        | Sample data, client-side search                             | `User` and `Profile` tables, server-side search and pagination, privacy rules                                                                  |
| Connections                           | `localStorage`                                              | A connections or follows table                                                                                                                 |
| Messaging                             | Sample conversations, local sends                           | `Message` table, WebSocket or SSE for real-time delivery, unread counts, abuse controls                                                        |
| Groups                                | Join and leave in `localStorage`; create is validation only | `Group` and `GroupMembership` tables, invitations and approval for private groups, group posts                                                 |
| Courses and lessons                   | Sample data, progress in `localStorage`                     | `Course`, `Lesson` and progress tables, authoring tools, media storage                                                                         |
| Assignments and submissions           | Status and text in `localStorage`                           | `Assignment` and `Submission` tables, file uploads, grading workflow                                                                           |
| Coding Lab                            | Simulated: **does not execute code**                        | A sandboxed execution service (isolated containers or a vetted third-party runner) with time and memory limits                                 |
| Challenges, XP, badges, leaderboard   | Computed in the browser                                     | Server-authoritative XP rules (the client must never decide its own score), `UserProgress` table, anti-cheat                                   |
| Notifications                         | Sample list, read state in `localStorage`                   | `Notification` table, event producers, optional email and push                                                                                 |
| Resources                             | Descriptions only                                           | File storage (S3-compatible), upload validation, moderation                                                                                    |
| Admin                                 | Sample overview                                             | Role checks, moderation actions, audit log                                                                                                     |
| AI learning assistant (future)        | Not built                                                   | Server-side route that calls the AI API with the key kept in server env vars, per-user rate limits, content safety                             |
| Voice, video, screen sharing (future) | Not built                                                   | A WebRTC provider or SFU, signalling, permissions                                                                                              |

## Suggested rollout order

1. **Database and ORM.** Add PostgreSQL (local Docker for development), install Prisma, review `prisma/schema.prisma`, create the first migration, and add a seed script based on `src/data/`.
2. **Authentication.** Add real sign-in, session handling and route protection. Replace `demoActions.signIn`.
3. **Read APIs.** Serve community, groups, courses and challenges from the database through Server Components or route handlers; remove the matching `src/data/` imports.
4. **Write APIs.** Group membership, enrolment, lesson completion, submissions and challenge completion, each validated on the server.
5. **Progress and XP.** Move XP and level computation to the server and replace `src/lib/progress.ts` usage.
6. **Messaging and notifications.** Persist messages, then add real-time delivery.
7. **File storage.** Resources and assignment attachments.
8. **Coding execution, AI assistant, calls.** Each is its own project with its own security review.

## Security notes for the backend phase

- Validate every input on the server; client validation in this repo is only for usability.
- Keep API keys and the database URL in server-side environment variables. Do not use `NEXT_PUBLIC_` for secrets.
- Never trust client-submitted XP, grades, roles or user ids; derive them from the session.
- Add rate limiting on login, registration, messaging and the AI route.
- Treat user-generated content (posts, messages, profiles) as untrusted and escape it. React escapes by default; do not use `dangerouslySetInnerHTML` on user content.
