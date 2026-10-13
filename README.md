# COVA — Community Of Visionary Achievers

COVA is a student community and collaborative learning platform. This repository is the **MVP frontend foundation**: a Next.js application with working interactions, sample data and a clear path to a real backend.

> **Important:** there is no backend, database or real authentication yet. Everything you see is a frontend demo using sample data. Your actions (joining groups, completing challenges, sending messages) are saved in your own browser's `localStorage` only. See [Current limitations](#current-limitations).

## Technology stack

- [Next.js](https://nextjs.org/) (App Router) and React
- TypeScript (strict mode)
- Tailwind CSS v4
- [Lucide React](https://lucide.dev/) icons
- ESLint (flat config with `eslint-config-next`) and Prettier

## Prerequisites

- Node.js 20.9 or newer (developed and verified with Node 22)
- npm 10 or newer
- Git

## Installation

```bash
unzip cova-web-app.zip
cd cova-web-app
npm install
```

## Run the development server

```bash
npm run dev
```

Open <http://localhost:3000>.

## Build and run checks

| Command                | What it does                                      |
| ---------------------- | ------------------------------------------------- |
| `npm run dev`          | Start the development server                      |
| `npm run build`        | Create a production build                         |
| `npm run start`        | Serve the production build (run `build` first)    |
| `npm run typecheck`    | Type-check with `tsc --noEmit`                    |
| `npm run lint`         | Lint with ESLint                                  |
| `npm run format`       | Format all files with Prettier                    |
| `npm run format:check` | Verify formatting without changing files          |
| `npm run check`        | Typecheck, lint, then build (run before every PR) |

There is no automated test suite yet. Adding one (for example Vitest and Testing Library) is a good early task.

## Environment variables

Copy the example file and fill in values locally when the backend work begins:

```bash
cp .env.example .env.local
```

`.env.example` contains **placeholders only**. The current demo does not read any environment variable, so the app runs without a `.env.local`. Never commit real secrets, and never put secrets in variables prefixed with `NEXT_PUBLIC_` (those are exposed to the browser).

## Project structure

```
cova-web-app/
├── docs/ARCHITECTURE.md      Backend integration plan and demo-vs-real feature table
├── prisma/schema.prisma      PLANNED PostgreSQL schema (Prisma is not installed yet)
├── public/                   Static assets
└── src/
    ├── app/                  Routes (App Router)
    │   ├── (marketing)/      Landing page
    │   ├── (auth)/           /login and /register
    │   └── (app)/            Signed-in area with sidebar and header
    ├── components/
    │   ├── layout/           Sidebar, header, user menu, notifications panel
    │   ├── ui/               Reusable elements (Button, Card, Modal, Tabs, ...)
    │   ├── dashboard/        Dashboard widgets
    │   ├── community/        Student cards and profiles
    │   ├── groups/           Group cards, detail and creation
    │   ├── learning/         Courses, assignments, challenges, resources, leaderboard
    │   ├── messages/         Messaging interface
    │   ├── coding/           Coding Lab
    │   ├── settings/         Settings form
    │   ├── admin/            Basic admin dashboard
    │   └── auth/             Login and register forms
    ├── data/                 Sample data (replace with API calls later)
    ├── lib/                  Utilities, validation, demo store, progress helpers
    └── types/                UI types (index.ts) and planned backend entities (models.ts)
```

### Routes

`/`, `/login`, `/register`, `/dashboard`, `/community`, `/community/[id]`, `/messages`, `/groups`, `/groups/[id]`, `/courses`, `/courses/[id]`, `/assignments`, `/coding`, `/challenges`, `/leaderboard`, `/resources`, `/notifications`, `/settings`, `/admin`.

### Brand palette

Defined once as Tailwind theme tokens in `src/app/globals.css`:

| Token        | Value     | Use                          |
| ------------ | --------- | ---------------------------- |
| `cova-pale`  | `#DCECF7` | Soft backgrounds, highlights |
| `cova-soft`  | `#A9CFE5` | Primary buttons, accents     |
| `cova-muted` | `#6F9FBA` | Progress, icons, hover       |
| `cova-bg`    | `#F7FAFC` | Page background              |
| `cova-ink`   | `#243447` | Main text                    |
| `cova-mute`  | `#64748B` | Secondary text               |
| `cova-line`  | `#E5EDF3` | Borders                      |

Muted Blue does not have enough contrast for text on white, so it is used for fills and icons, not for body text.

The app uses a system sans-serif font stack so builds work offline. To use a web font such as Inter, add it with `next/font` in `src/app/layout.tsx`.

## Current limitations

These are **frontend demos**, not real features:

- **Accounts:** login and registration validate the form, then store a fake session in `localStorage`. No password is checked or stored, and nothing stops anyone from opening `/dashboard` or `/admin`.
- **Messaging:** conversations are sample data; messages you send are saved in your browser only and are never delivered.
- **Groups, courses, challenges, assignments:** membership, enrolment, completion and submissions live in `localStorage`. Creating a group validates the form but does not save a group.
- **Coding Lab:** code is **not executed**. "Run (simulated)" checks the code for a typical approach and prints a canned result, and the UI says so.
- **XP, levels, leaderboard:** computed in the browser from demo state. Other students' scores are fixed sample numbers.
- **Resources and file uploads:** there is no file storage. Resource detail views show a description only.
- **Admin:** no role checks, no real moderation.
- **Languages:** English, French and Arabic (right-to-left) via `src/i18n/`. The app shell, auth, settings and landing page are translated; sample data and the learning pages are still English. Add a language by creating `src/i18n/messages/<code>.ts` and listing it in `src/i18n/config.ts`.
- **Not started:** AI assistant, video calls, screen sharing, email, real notifications, automated tests, and an accessibility audit with assistive technology.
- **Dev tooling audit:** `npm audit` reports no vulnerabilities in production dependencies. It may report advisories in development-only tooling; review them before upgrading and avoid `npm audit fix --force`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for what each demo feature needs from a backend.

## Recommended Git workflow for two developers

1. `main` is always deployable. Nobody pushes directly to it; protect it on GitHub and require one review.
2. Create a short-lived branch per task from an up-to-date `main`: `feature/groups-api`, `fix/login-validation`, `docs/readme-update`.
3. Commit small, with clear messages (for example `Add group membership API route`).
4. Before opening a pull request: `git fetch origin && git rebase origin/main`, then `npm run check`.
5. Open a pull request using the template and ask the other developer to review it. Review within a day where possible.
6. Squash-merge, delete the branch, then `git checkout main && git pull`.
7. Split work by area to avoid conflicts (for example one person on auth and database, the other on UI), and agree on shared files such as `src/types/` and `prisma/schema.prisma` before changing them.

See [CONTRIBUTING.md](CONTRIBUTING.md) for conventions.
