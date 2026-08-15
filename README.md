# ED4U

School operating platform: identity, timetable, calendar, applications, appointments, mentor matching, facility planning, clubs, and discussion.

## Local setup

```bash
cp .env.example .env
npm install
npm run services:up          # PostgreSQL 17 via Docker on localhost:5434
npm run db:migrate:deploy    # apply migrations
npm run db:seed
npm run dev
```

Open http://127.0.0.1:3000

## Demo credentials

Username is the immutable `school_member_code`. Temporary password for all seeded accounts:

```text
TempPass1!
```

| Role           | school_member_code |
| -------------- | ------------------ |
| ADMIN_IT       | IT000001           |
| SCHOOL_ADMIN   | AD000001           |
| TEACHER        | GV000001           |
| STUDENT        | HS000001           |
| GRADUATED      | HS990001           |
| MENTOR         | HS990002           |
| Club President | HS000010           |

`HS990002` is Nguyễn Thu Hà, the first of 24 seeded mentors (`HS990002`–`HS990025`) spread
across IELTS, SAT and HSK.

First login **forces a password change**. `DEMO_SKIP_PASSWORD_CHANGE=true` is development-only and is documented in `.env.example`.

To restore every demo account to the table above — including after a password change — run:

```bash
npm run db:demo:reset
```

This drops, re-migrates and re-seeds deterministically. Never replace the credentials above
with a password changed by hand.

## Quality gate

```bash
npm run verify
```

## Brand

The product name is **ED4U**. Do not ship EduSync branding.
