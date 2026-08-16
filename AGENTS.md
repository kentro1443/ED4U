# ED4U — AGENT Project Memory

Persistent operating contract. Read this at the start of every session. Update it when a
major invariant, architecture decision, completed slice, known bug, command, or
implementation trap changes. Never put secrets, passwords, or API keys here.
This document is duplicated from CLAUDE.md, so if Claude is mentioned, take it as AGENT/CHATGPT

Document roles:

- `AGENT.md` (this file) — operating contract and verified project state.
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

Major checkpoints now on `main`:

- `39ed217` — permission-specific server authorization and actor-scoped reads (Slice 0)
- `e396f3e` / `fabb9f9` — truthful mentor/facility data, timezone, realistic operational seed (Slice 1)
- `439fa71` / `e8e688d` — ED4U design-system foundation, responsive shell, closure fixes (Slice 2)
- `a49a60f` — persisted natural-language Mentor matching, Match Space 2.0, live booking
- `5fe79df` / `8389109` — real school-local Day/Week/Month Calendar and semester boundaries
- `04150a2` / `dc1e309` — Facility Engine over live occupancy, approval transactions, request lifecycle, room schedule
- `4144b50` — teacher routing, versioned PDF applications, appointment negotiation/chat
- `80a7932` — governed club membership, finance, documents, room-backed events
- `93edb42` — Discussion threads, replies, reactions, reporting and human moderation
- `919ab30` — School Event management and calendar projection
- `1532408` / `8e3630d` — login throttling, security headers, health/readiness, operational E2E and production-readiness contract

### Completed product verticals

**Mentor Intelligence:** `/mentor` has deterministic natural-language parsing, human constraint
confirmation, URL-based manual discovery, persisted immutable `MentorMatchRequest` /
`MentorRecommendationRun` snapshots, owner-only Match Space, real engine reasons/trade-offs /
score breakdown/data coverage, recent-run history and concrete-session booking. Booking re-fetches
live mentor state and serializes contested sessions. Match Score is a ranking score, never a
probability.

**Calendar:** real school-local Day / Week / Month views project timetable occurrences, school and
club events, accepted appointments, Mentor bookings and confirmed room bookings without copying
timetable rows into static CalendarEvent records. Teacher/student scoping and semester boundaries
are enforced. Mobile uses an agenda rather than squeezing the desktop grid.

**Facility:** the planner parses a natural-language request but confirms explicit constraints before
calling the deterministic engine. The DB adapter includes timetable occupancy, confirmed bookings,
maintenance blocks and active soft holds. A recommendation does not reserve a room. Students create
soft-hold requests; School Admin approval locks/rechecks live room state transactionally. Admin can
request changes/reject; students can cancel; confirmed cancellation releases the booking. `/rooms/schedule`
shows hard occupancy versus soft-hold risk.

**Student support:** Applications use versioned PDF submissions; teacher review and transfer rules are
server-authorized. Appointments support student request, teacher accept/reschedule/decline and private
conversation only after acceptance.

**Clubs:** proposal/admin approval, membership governance, PRESIDENT > VP > CORE > MEMBER hierarchy,
advisor context, immutable-approved finance correction semantics, documents and room-backed events are
wired. Club events consume the Facility flow rather than inventing another engine.

**Discussion:** real-name forums, threads, replies, LIKE/HELPFUL, reporting and reactive human moderation
are implemented. Mentor-only alumni cannot access the general forum. Reporting has explicit success
feedback so navigation cannot race the server mutation.

**School events:** SCHOOL_ADMIN can create/delete SCHOOL/GRADE/CLASS events with explicit school-timezone
conversion; viewers only receive events within their visibility scope and Calendar projects them.

### Current quality / operations baseline

- `npm run verify` covers formatting, lint, TypeScript, Prisma validation, unit tests, real PostgreSQL
  integration tests, full Mentor/Facility benchmarks, production build and Playwright E2E.
- Mentor benchmark remains 1000 requests × 500 mentors with zero hard-constraint violations and 100%
  determinism. Human-quality metrics remain `NOT_MEASURED` until independent labels exist.
- Critical flows are browser-tested across STUDENT / TEACHER / SCHOOL_ADMIN / ADMIN_IT / MENTOR roles.
- `/api/health/live` and `/api/health/ready` exist; readiness checks PostgreSQL and both are no-store.
- Login throttling is database-backed (IP+member-code and IP buckets). Cookie sessions are HTTP-only,
  SameSite=Lax and Secure in production. Baseline security headers/CSP are configured.
- `docs/PRODUCTION_READINESS.md` is the source of truth for what is implemented versus what still belongs
  to the deployment environment. Do not claim a laptop/demo deployment is enterprise production-ready.

Known deliberate trade-offs / traps:

- Next 16's `forbidden()` returns a correct 403 but its `authInterrupts` boundary never paints in this app,
  so denials currently redirect to `/403`.
- `prisma migrate dev` may refuse non-interactive warning-bearing changes; generate reviewed SQL with
  `prisma migrate diff` and apply with `migrate deploy`.
- `layoutMatchSpace` rounds coordinates to six decimals to keep SSR/browser floating point deterministic.
- Full benchmarks rewrite report timestamps/latencies/commit metadata; restore purely volatile report
  changes before committing unrelated source work.
- On this Mac, Finder/other tooling can occasionally recreate `.DS_Store` beneath `.next` while Next is
  replacing the build directory. An `ENOTEMPTY` during cleanup is environmental; remove the stale
  `.DS_Store` and rerun. Do not weaken the build gate.
- pg currently emits a deprecation warning when concurrent test flows reuse an executing underlying query;
  tests still pass, but move contested-flow tests to explicit independent clients before pg@9.

## Remaining work toward a real enterprise deployment

The hackathon product is now functionally broad; remaining work is mostly production infrastructure,
operational proof and selected UX polish rather than missing core demo routes. Keep these categories
separate from product-completeness claims:

1. Managed PostgreSQL with TLS, pooling, automated backups/PITR and a tested restore drill.
2. Replace the local private-file provider with private object storage plus malware quarantine/scanning and
   short-lived authorized downloads.
3. Central structured log shipping, error monitoring, metrics, distributed traces, SLOs and alerts.
4. Deployment secret management/KMS, TLS-only edge, trusted proxy/IP configuration, WAF/DDoS controls and
   CSP reporting.
5. Transactional outbox/background worker when notification delivery guarantees become contractual.
6. Minor/student privacy governance: retention, export/delete process, incident response, vendor register
   and jurisdiction-specific legal review.
7. Explicit active-tenant session context before allowing one account to belong to multiple schools; never
   ship the current one-school `memberships[0]` assumption as true multi-tenancy.
8. Staging/prod release discipline: migration rehearsal, rollback/roll-forward, dependency scanning, load
   tests, penetration testing and restore exercises.
9. SSO/SAML/OIDC only when a school/customer requires it; member-code auth remains the V1 decision.
10. Continue visual/user-journey polish from real browser sessions; do not reintroduce dead controls,
    fabricated data or "AI" decoration.

---

Before changing a core invariant, stop and explain why.
