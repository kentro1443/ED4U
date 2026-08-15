# ED4U — Claude Project Memory

Persistent operating contract. Read this at the start of every session. Update it when a
major invariant, architecture decision, completed slice, known bug, command, or
implementation trap changes. Never put secrets, passwords, or API keys here.

Document roles:

- `CLAUDE.md` (this file) — operating contract and verified project state.
- `PLAN.md` — requirements/reference document. **Not implementation truth.**
- `docs/AUDIT.md` — verified inherited-prototype audit and revised implementation direction.
- `DESIGN.md` — visual design language reference (see UI section).

When implementation disagrees with `PLAN.md`, investigate and follow the verified
product/domain requirement rather than blindly satisfying a checklist.

## Product

- Product name is **ED4U**. Never reintroduce EduSync branding.
- School operations platform with STUDENT, TEACHER, MENTOR, SCHOOL_ADMIN, ADMIN_IT.
- V1 is one school, but tenant boundaries remain in the architecture.
- Current goal is hackathon-ready first, then pilot/enterprise hardening.

## Source repositories

- `~/ED4U` — active repo. Modify here.
- `~/AI-Engine` — read-only source/reference for the Mentor Intelligence Engine.
- `~/EduTechTest` — old web reference only. Not a specification. Do not modify.
- `packages/mentor-engine` stays behaviorally identical to the source engine except ED4U
  branding, unless an explicitly justified engine bug is found.

## Product philosophy

- **AI proposes → deterministic code validates → human authorizes → transaction mutates state.**
- Never use AI merely to decorate a feature.
- Flagship technology: (1) Mentor Intelligence Engine, (2) Facility Planning Intelligence Engine.
- Recommendation is never reservation.
- No fabricated production/runtime values.
- No silent fallback that masquerades as a real intelligence result.
- Validation errors must surface explicitly.
- Hard constraints can never be compensated for by ranking score.
- Manual fallback must keep working if the AI/parser service is unavailable.

## Authorization invariants

- No generic `requireAdmin()`.
- Permission-specific server-side authorization (`apps/web/src/lib/authz.ts`).
- ADMIN_IT and SCHOOL_ADMIN are distinct roles with distinct powers.
- Every sensitive mutation also checks tenant + ownership/relationship/assignee.
- Navigation visibility is not authorization.
- `apps/web/src/lib/routePermissions.ts` is the single route→permission map shared by UI
  visibility and the server guard.

Current admin split:

- **ADMIN_IT** — member provisioning/import/reset, roles, system settings, audit; timetable
  import when implemented.
- **SCHOOL_ADMIN** — timetable editing, rooms, approvals, moderation, audit, club/business
  operations.
- They share capabilities only intentionally (today: `audit.read` only).
- Timetable import vs. edit may eventually need separate route/action permissions.

## Identity invariants

- `User.id` = immutable random UUID.
- `school_member_code` = immutable username / business identifier.
- No email login in V1. Admin provisions users with a temporary password; first normal
  login forces a password change.
- Demo state is restored with `npm run db:demo:reset`. Never commit manually changed local
  passwords; E2E runs with `DEMO_SKIP_PASSWORD_CHANGE=true` so a run never mutates one.
- Graduated students retain history, may read the forum only, cannot act as active
  students, and may apply to be a Mentor.
- TEACHER + SCHOOL_ADMIN allowed. TEACHER + MENTOR forbidden. Active STUDENT + MENTOR forbidden.

## Data truth

- The inherited prototype seed is not acceptable for the final demo.
- Real matching fields must come from the database.
- The mentor engine canonical schema requires truthful fields: name, birthYear,
  credentials, availability, expertise, price, etc.
- Credential semantics must be preserved end to end:
  - key omitted = **UNKNOWN**
  - `null` = **KNOWN ABSENT**
  - object = **KNOWN PRESENT**
- Extra UI-only fields (e.g. `ratingCount`) must never leak into strict engine input.
- Birth year is derived from a real date of birth, never fabricated.
- Every tenant has an explicit timezone; the demo school uses `Asia/Ho_Chi_Minh`.

## Time / calendar

- DB timestamps represent real instants.
- Academic timetable and operational hours are school-local civil time.
- Convert explicitly through `tenant.timezone`. Never depend on server-local timezone, and
  never "fix" UTC logic by swapping UTC accessors for local `getHours()`.
- Timetable is not duplicated into `CalendarEvent` rows. Calendar is a **projection** over
  timetable, appointments, mentor bookings, events and room bookings.
- Real Day / Week / Month UI is required.

## Room / facility safety

- A pending room hold is a **soft hold**, not a hard reservation.
- Approval rechecks LIVE state.
- The confirmed-booking transaction serializes by Room for overlapping requests.
- The final concurrency test uses two actual PostgreSQL connections; exactly one
  conflicting approval may succeed.
- An existing confirmed booking is never automatically displaced by later priority.
- Timetable occupancy derives from requested date + weekday + `AcademicPeriod` + school
  timezone.

## Club / finance

- Club roles are domain roles, not global system roles: PRESIDENT > VP > CORE > MEMBER.
- Club finance is bookkeeping only; no real payment custody.
- Approved ledger entries are immutable. Correction = VOID + correction entry.
- Club events consume the Facility Engine. There is no separate "Club AI Engine".

## Mentor Match Space

- The student is at the center; a closer mentor means a higher **actual engine** matchScore.
- Match score is not a probability.
- Never call it an embedding map unless actual embeddings determine the geometry.
- Node positions are deterministic for the same recommendation run.
- Uses a real persisted recommendation run, real names, and the real engine feature
  breakdown. No UUID-as-name. No score=50 fallback.
- Must have an accessible list/table fallback, and should include constraint/rejection
  explanations where possible.

## UI / UX

Before implementing or redesigning any UI, read `/Users/huan/ED4U/DESIGN.md`. It was
generated from a Cal.com design analysis and is the visual reference for ED4U — a design
_language_, not a page template and not a pixel-for-pixel copy. Adapt it to an
authenticated school operating application.

Principles that matter: white canvas / neutral surfaces; black or near-black primary CTAs;
one restrained accent rather than rainbow AI gradients; strong typography and information
hierarchy; generous whitespace; thin neutral hairlines; soft ~8–12px rounding rather than
everything being a pill; the product UI itself creates the visual interest; clean modern
SaaS feel; subtle depth; minimal visual noise.

Avoid: generic AI-dashboard aesthetics, giant gradients, glowing blobs, excessive
glassmorphism, excessive shadows, excessive pill shapes, random purple/blue "AI"
decoration, decorative charts that encode nothing, and marketing-style hero sections inside
authenticated app pages.

Animation is deliberate: 150–300ms interaction transitions, layout transitions where state
changes, Match Space node movement, drawers/dialogs, calendar transitions. Respect
`prefers-reduced-motion`. No perpetual distracting motion.

Do not require an unavailable font just because `DESIGN.md` references Cal Sans; use an
appropriate available/open web font stack that preserves the typographic character.

### UI tool rule

For any major UI work: (1) re-read `DESIGN.md`; (2) inspect the current page in a browser
before coding; (3) use Context7/current docs for component/library APIs; (4) check relevant
`skills/*.md`; (5) build with shared design primitives; (6) open the result in a real
browser; (7) inspect at ~1440px desktop; (8) inspect at 390px mobile; (9) check console and
network errors; (10) test loading, empty and error states; (11) keyboard-test important
controls; (12) add automated coverage where appropriate. Only then is the UI complete.

## Testing / quality

- `npm run verify` must be green after every completed slice. It runs format, lint,
  typecheck, Prisma validation, unit tests, real-DB integration tests, the **full**
  benchmarks, a production build, and Playwright.
  - Trap: the _smoke_ benchmark variants overwrite the committed report with a truncated
    workload, which made `verify` fail on its second run. Always run the full sets.
  - Playwright uses a dedicated port (3020) with `reuseExistingServer: false`. Port 3000 on
    this machine serves the unrelated legacy EduSync app.
  - Next 16 refuses a second `next dev` in the same directory whatever the port, so a
    stray manual dev server makes Playwright's `webServer` fail to start.
  - The committed benchmark reports embed the git commit, host latency and Node version,
    so `verify` always leaves them dirty. That is expected; the tests assert workload size,
    not timings.
- Never weaken a test to make an implementation pass.
- "Integration" means a real DB/service boundary where relevant.
- Feature Definition of Done is user-workflow completion, not "route exists".
- Each major slice gets a commit; browser-test real user roles after each vertical slice.

## Current repository progress

- `33d7332` inherited prototype checkpoint
- `9a228b9` audit
- `39ed217` security Slice 0
- `0af0a39` benchmark report regeneration / green verify
- `e396f3e` truthful data foundation, Slice 1
- `71a8818` Slice 1 facility fixture closure (confirmed booking, maintenance block, soft hold)

**Slice 0 is complete:** permission-specific route guards, actor-scoped reads, appointment
assignee enforcement, a real-Postgres authz integration harness, a dedicated E2E port,
deterministic demo reset, and a green `verify`.

**Slice 1 is complete:** migration `20260816120000_mentor_truth_and_school_timezone`
(`User.dateOfBirth`/`gender`, `MentorProfile.user` relation, mentor engine columns,
`Tenant.timezone`); the DB→canonical adapter at `apps/web/src/lib/mentor/adapter.ts`;
school-local civil time in `packages/domain/src/academic/timezone.ts` with a required
`timeZone` on `withinOperationalHours`; a 24-mentor seed with behavioural diversity; all
fabricated mentor values and the `matchScore: 50` fallback removed. The facility demo seed
also carries real operational state: an APPROVED R04 request + confirmed booking, an R09
maintenance block, and an active PENDING_APPROVAL soft hold on R16. Their identities and
relationships are deterministic; their operational timestamps intentionally move relative
to seed time so the demo never rots. Two consecutive `db:demo:reset` runs were manually
compared and produced identical structural counts/IDs/links.

Known deliberate trade-offs:

- Next 16's `forbidden()` returns a correct 403 but its `authInterrupts` boundary never
  paints (verified in dev and in a production build), so denials `redirect("/403")`.
- `prisma migrate dev` cannot run non-interactively when a change carries a data-loss or
  unique-constraint warning. Generate the SQL with
  `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
  into a new `prisma/migrations/<timestamp>_<name>/migration.sql`, then `migrate deploy`.
- `layoutMatchSpace` rounds coordinates to six decimals: `Math.cos`/`Math.sin` differ in
  the last ULP between Node and the browser, which React reported as a hydration mismatch.

Approximate maturity: hackathon product ~40%, foundations ~70%, enterprise production
readiness ~20%.

## Known remaining priority

1. ~~Data truth/schema + realistic diverse seed + timezone.~~ (Slice 1, done)
2. Early UI design-system foundation / mobile shell.
3. Correct time model + Calendar — next up: `periodOccurrence(weekday, period, date, tz)`,
   the civil→instant direction the timezone module does not yet cover.
4. Mentor end-to-end — request input, deterministic parser, human confirmation, persisted
   `MentorMatchRequest` + `MentorRecommendationRun`, booking.
5. Match Space rebuild over the persisted run.
6. Facility end-to-end.
7. Remaining workflows, plus the still-open schema gaps: teacher routing/responsibility,
   teacher blocked time, `ClubAdvisor`, `tenantId` on `Report`/`ModerationCase`.
8. Hardening / benchmarks / demo.

## Enterprise backlog — do not derail the hackathon build yet

Track but do not prematurely implement: rate limiting; session management/rotation
maturity; CSP/security headers review; health/readiness endpoints; structured logging;
metrics/tracing/error monitoring; object storage + malware scanning; background
queue/outbox; backup/PITR/restore testing; load testing; true multi-school active tenant
switching; data retention/privacy governance; security/pentest review; staged production
deployment and SLOs.

---

Before changing a core invariant, stop and explain why.
