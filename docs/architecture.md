# Architecture

Monorepo:

- `apps/web` — Next.js 16 App Router. Owns auth, tenant scope, persistence, UI.
- `packages/domain` — pure rules (roles, collisions, state machines, Match Space layout).
- `packages/mentor-engine` — ranking. No Prisma.
- `packages/facility-engine` — Top-3 room plans. No Prisma.
- `prisma/` — schema + deterministic seed.

Rule: **AI proposes → deterministic code validates → human authorizes → transaction mutates.**

Calendar is a projection. Timetable rows are never copied into `SchoolEvent`.
