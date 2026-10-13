# Contributing to COVA

Thanks for helping build COVA. This guide keeps a two-person team moving quickly without stepping on each other.

## Setup

```bash
npm install
npm run dev
```

Before you push, run:

```bash
npm run check
```

This runs the type check, lint and a production build. If you only changed formatting, `npm run format:check` is enough.

## Branches and pull requests

- Branch from the latest `main`. Never commit directly to `main`.
- Name branches by type: `feature/…`, `fix/…`, `docs/…`, `chore/…`.
- Keep pull requests small and focused on one change. Fill in the pull request template.
- The other developer reviews and approves before merge. Prefer squash merge.
- Resolve conflicts by rebasing on `main`, not by merging `main` into your branch.

## Code conventions

- TypeScript strict mode. Avoid `any`; if you need an escape hatch, explain why in a comment.
- Components: one responsibility each. Put reusable elements in `src/components/ui/` and feature components in their feature folder.
- Pages in `src/app/` stay thin. They render components and set metadata.
- Server Components by default. Add `"use client"` only when a component needs state, effects or browser APIs.
- Sample data lives in `src/data/`. Do not scatter hard-coded data inside components.
- Use the palette tokens (`bg-cova-pale`, `text-cova-ink`, and so on) rather than raw hex values.
- Keep the look calm: no neon or saturated colours, minimal shadows, no flashy animation. Respect `prefers-reduced-motion`.
- Accessibility: every control needs a label, keyboard focus must stay visible, and colour must not be the only signal.
- Be honest in the UI. Anything that is simulated must be labelled as a demo.

## Secrets

- Never commit `.env`, `.env.local` or any real key. Only `.env.example` (placeholders) is tracked.
- Secrets used by the server must not use the `NEXT_PUBLIC_` prefix.
- If you commit a secret by mistake, rotate it immediately. Removing it in a later commit does not make it safe.

## Commit messages

Use the imperative mood and keep the first line under about 72 characters: `Add course enrolment endpoint`.

## Backend work

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first. It lists which features are demos and the order we plan to replace them. Agree on schema changes in `prisma/schema.prisma` and `src/types/models.ts` together before implementing them.
