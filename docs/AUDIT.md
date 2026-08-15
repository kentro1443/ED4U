# ED4U — Inherited Prototype Audit

Baseline commit: `33d7332` (checkpoint of the prototype exactly as received).
Audited: 2026-08-16, against the running dev server on `http://127.0.0.1:3010`,
the live seeded database (`ed4u-postgres-1`, 182 users / 25 mentor profiles /
240 timetable entries), and the two read-only reference trees.

`PLAN.md` is treated as a requirements document. Everything below was verified
against running code, the database, or the browser — never against PLAN.md and
never against the existence of a route, model, or test.

---

## 1. How the prototype fails

The prototype was built to make a checklist true. Every route in `PLAN.md §21`
exists, every Prisma model in `§5–19` exists, every ADR is written, and
`benchmark/reports/facility-latest.md` says `PASS`. Almost none of it is a
working product, and three specific habits explain why:

1. **Authorization was modelled, then not enforced.** `packages/domain` has a
   complete, correct `can()/assertCan()` permission system. No page and only one
   server action calls it.
2. **Correctness was proven against in-memory simulations rather than the
   system.** `applyConcurrentApprovals()` is a pure function that constructs the
   winner and loser itself; the test asserting "concurrent conflicts yield one
   booking" never opens a database connection, and the real DB path takes no
   lock at all.
3. **Failure was made invisible.** Where real data was missing, the UI
   substituted a constant and rendered it as if it were a result. The flagship
   Match Space is the worst case (§3.1).

The engines are the exception and are genuinely good — see §5.

---

## 2. Requirement-to-implementation matrix

Legend — **Exists**: code is present. **E2E**: a real authorized user can
complete the workflow and durable state changes. **Fake**: hard-coded or
fabricated at runtime.

### 2.1 Security and access

| Requirement                                       | Exists               | E2E     | Fake / hard-coded | Missing                                             | Verification                                                                                                                                                                                    |
| ------------------------------------------------- | -------------------- | ------- | ----------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-side authz on every mutation (§25.2)       | partial              | **no**  | —                 | Every admin page and 1 of 2 actions                 | Logged in as `HS000010` (`STUDENT · ACTIVE`, admin nav hidden); `/admin/approvals` rendered fully, HTTP 200. Same for `/members`, `/audit`, `/settings`. `assertCan` is imported by zero pages. |
| Actor-scoped reads                                | no                   | no      | —                 | Applications, Appointments, Dashboard               | All query `where: { tenantId }` only, then `take: N`. `/appointments` shows every appointment in the school to every user.                                                                      |
| `acceptAppointmentAction` authz                   | partial              | no      | —                 | role + assignee check                               | Action checks only that a session exists. Any logged-in user can accept any appointment; the TEACHER check is JSX-only.                                                                         |
| Argon2id, HttpOnly cookie, forced password change | yes                  | **yes** | —                 | rate limiting, session rotation on privilege change | Login → forced `/change-password` → dashboard, verified in browser.                                                                                                                             |
| Tenant isolation                                  | yes (schema+queries) | n/a     | —                 | cross-tenant test fixtures                          | Single tenant seeded; every table carries `tenantId` and queries scope by it.                                                                                                                   |

### 2.2 Calendar and academic time

| Requirement                     | Exists     | E2E | Fake / hard-coded                        | Missing                        | Verification                                                                                                                                                |
| ------------------------------- | ---------- | --- | ---------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Day/Week/Month views (§9.2)     | no         | no  | view toggle is decorative                | all three views                | `/calendar?view=day\|week\|month` render an identical flat list. `inView/startOfView/endOfView` exist in domain and are never called.                       |
| Timetable → calendar projection | **broken** | no  | `startAt: new Date(), endAt: new Date()` | weekday+period → real datetime | Every timetable row is projected as a zero-length event at page-render time.                                                                                |
| Dashboard "today's timetable"   | no         | no  | tenant-wide `take: 8`                    | class/teacher scoping, "today" | Student sees 8 arbitrary rows from other classes; no weekday filter.                                                                                        |
| Room schedule surface           | no         | no  | —                                        | entire view                    | No route renders room occupancy over time.                                                                                                                  |
| Timezone correctness            | **broken** | no  | —                                        | school-local time handling     | `withinOperationalHours` reads `getUTCHours()` on dates built in local time. In `Asia/Ho_Chi_Minh` (UTC+7) the 07:00–20:00 window is evaluated 7 hours off. |

Data is available and adequate: 240 timetable entries across MON–FRI, 8 periods
with real `startTime`/`endTime` text (`07:30`/`08:15`, …), 12 classes.

### 2.3 Mentor Intelligence (flagship 1)

| Requirement                  | Exists | E2E | Fake / hard-coded                                                                                     | Missing                     | Verification                                                                                                                                                       |
| ---------------------------- | ------ | --- | ----------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Student request UI (§12.3)   | **no** | no  | request is a literal in page source                                                                   | input, parse, confirm steps | `/mentor` has no form at all — only a list and a link.                                                                                                             |
| Engine actually runs         | **no** | no  | **all scores = 50**                                                                                   | working adapter             | See §3.1. Reproduced the exact validation failure.                                                                                                                 |
| Mentor identity              | **no** | no  | UUIDs shown as names                                                                                  | `User` relation             | `MentorProfile.userId` is a bare `String` with no Prisma relation, so no query can reach `fullName`. Match Space lists 25 raw UUIDs.                               |
| Mentor attributes            | **no** | no  | birthYear 2000, IELTS 8.0 all sections, 18 months experience, rating 4.6, `sessionsCompleted: 20 + i` | real columns                | Fabricated inline in `match-space/page.tsx` because `MentorProfile` has no such columns.                                                                           |
| Persisted recommendation run | no     | no  | —                                                                                                     | writes                      | `MentorMatchRequest` = 0 rows, `MentorRecommendationRun` = 0 rows. Match Space visualizes nothing persisted.                                                       |
| Filters affect data          | no     | no  | budget input inert                                                                                    | wiring                      | Skill/budget inputs do not re-query or re-filter.                                                                                                                  |
| Request Mentor / booking     | no     | no  | —                                                                                                     | entire flow                 | No booking action exists; `recheckMentorBooking` in domain has no caller.                                                                                          |
| Seed data supports a demo    | **no** | —   | 24 of 25 mentors identical                                                                            | varied mentors              | `select headline, count(*) …` → `IELTS 8.0 · Writing coach` ×24. All share one expertise (`IELTS.WRITING`) and one availability pair. Prices differ by `i * 1000`. |

### 2.4 Facility Intelligence (flagship 2)

| Requirement                        | Exists     | E2E | Fake / hard-coded                               | Missing                    | Verification                                                                                                                                                   |
| ---------------------------------- | ---------- | --- | ----------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request input                      | **no**     | no  | Robotics prompt is a string literal             | prompt UI + manual form    | `/rooms` parses a hard-coded sentence on every render.                                                                                                         |
| Plans against real school state    | **no**     | no  | `occupancy: []`, `pendingHolds: []`             | DB→engine adapter          | The engine is handed an empty school: 240 timetable rows, bookings, blocks and holds are all withheld. Every room looks free.                                  |
| Manual booking                     | no         | no  | form has no `action`                            | mutation path              | `<form className="…">` with a submit button that does nothing.                                                                                                 |
| RoomRequest creation               | no         | no  | —                                               | entire flow                | `RoomRequest` = 0 rows.                                                                                                                                        |
| Admin approve / reject / changes   | no         | no  | —                                               | all three                  | `/admin/approvals` renders `Phòng {r.roomId}` — a UUID — with no controls.                                                                                     |
| `approveRoomRequestTx` correctness | **broken** | no  | timetable mapped onto `req.eventStart/eventEnd` | derive from weekday+period | Every timetable row for the room is treated as occupying exactly the requested interval, so any room used at any time in the week always conflicts.            |
| Concurrency safety (§27.4)         | **no**     | no  | test is a self-fulfilling pure function         | row lock                   | No `FOR UPDATE`, no serializable isolation. Two concurrent approvals both read empty occupancy and both insert. The "integration" test never touches Postgres. |
| Room feature discrimination        | partial    | —   | only `PROJECTOR` seeded, on all 24 rooms        | 7 other features           | 8 feature definitions exist; `RoomFeatureValue` has 24 rows, all `PROJECTOR`. A projector requirement filters nothing.                                         |

### 2.5 Workflow domains

| Domain                                          | State                       | Detail                                                                              |
| ----------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------- |
| Applications                                    | read-only list, tenant-wide | No upload, no versioning UI, no transfer, no review. 1 seeded row.                  |
| Appointments                                    | list + one accept button    | No request, decline, reschedule, or chat UI. Accept is unauthorized (§2.1).         |
| Clubs                                           | read-only list              | No join, approve, roles, documents, finance, or events. Domain rules exist, unused. |
| Discussion                                      | read-only list              | No post, reply, react, report, or moderate. 1 thread.                               |
| Admin members                                   | read-only table             | Import form has no action; no create, reset, or role assignment.                    |
| Admin timetable / rooms / moderation / settings | static text                 | Settings page is a hard-coded sentence.                                             |
| Notifications / Search / Profile / Security     | stubs                       | Search performs no search.                                                          |

Live counts confirm nothing has ever executed: `RoomRequest` 0, `RoomBooking`
0, `Approval` 0, `AuditEvent` 0, `MentorMatchRequest` 0, `MentorRecommendationRun` 0.

### 2.6 UI, quality gate, docs

| Requirement            | State                 | Detail                                                                                                                                                                       |
| ---------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile navigation      | **missing**           | Below `md` the sidebar is `hidden` with no replacement. Verified at 390×844: only the wordmark remains; every destination except `/dashboard` is unreachable.                |
| Design system          | minimal               | `packages/ui` is 4 colour strings. No Button/Card/Badge/Dialog/Table/Field primitives, no icon system, no motion. Pages hand-roll `rounded-xl border border-[var(--line)]`.  |
| Loading / error states | missing               | No `loading.tsx`, no `error.tsx`, no skeletons anywhere. A few empty states exist.                                                                                           |
| `npm run verify`       | **fails at step 1**   | Prettier flags `apps/web/tsconfig.json`, which Next.js rewrites on every dev boot. Steps 2–9 pass independently; step 10 (E2E) is one unauthenticated login-page smoke test. |
| Test coverage          | thin where it matters | 0 authenticated E2E tests. The only "integration" test uses no database. Engine packages are well covered.                                                                   |
| Demo credentials       | **stale**             | README says `TempPass1!` for all accounts; `HS000001` already has `mustChangePassword=false` and a changed password from prior testing.                                      |
| Docs / ADRs            | complete and accurate | Provenance records real HEADs; ADRs match the domain layer's intent.                                                                                                         |

### 2.7 Schema completeness gaps (tracked)

The Prisma schema is a sound foundation but not complete. These gaps block
requirements that are otherwise specified, and each one is a place where a
future slice would be tempted to fabricate data rather than store it.

| Gap                                       | Blocks                                                                                                                                                                          | Slice |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `User` has no `dateOfBirth`/`gender`      | `MentorSchema.birthYear` and `gender` have no real source. The prototype hard-coded `birthYear: 2000`. Store DOB on `User`, derive `birthYear` in the adapter, never invent it. | 1     |
| `MentorProfile.userId` has no relation    | Mentor identity is unreachable, so the UI shows UUIDs.                                                                                                                          | 1     |
| No mentor credential/rating columns       | IELTS/SAT/HSK, rating, ratingCount, experience, teaching styles, languages were all fabricated at render time.                                                                  | 1     |
| No teacher responsibility/routing data    | §10.4 assisted teacher suggestion: no category→responsible-group mapping, no workload signal.                                                                                   | 7     |
| No teacher blocked-time model             | §11.1 availability context lists "blocked times"; only timetable and appointments exist.                                                                                        | 7     |
| No `ClubAdvisor` model                    | §18.2 optional per-club advisors cannot be assigned.                                                                                                                            | 7     |
| `Report`/`ModerationCase` lack `tenantId` | Moderation must scope through the forum hierarchy; a direct tenant filter is impossible.                                                                                        | 7     |
| No tenant timezone column                 | Operational hours and calendar projection have no school-local reference. Store an IANA zone (`Asia/Ho_Chi_Minh` for the demo).                                                 | 1     |

---

## 3. Root causes worth naming

### 3.1 One unrecognized key silently disables the flagship

`match-space/page.tsx` builds mentor objects including `ratingCount`. The
engine's `MentorSchema` is a `strictObject`, so:

```
MENTORS ok? false
issues: [{ path: "0", code: "unrecognized_keys", message: 'Unrecognized key: "ratingCount"' }]
```

The page's guard is `if (requestResult.ok && mentorResult.ok) { …run engine… }`
with no `else`. Validation fails, the block is skipped, and the pre-initialized
fallback — `matchScore: 50` for every mentor — renders as though it were an
engine result. Because `radiusFromScore` is a function of score alone, 25
identical scores produce one ring at one radius: a graph that looks
sophisticated and encodes nothing.

The engine is not at fault. It rejected bad input correctly and said why. The
adapter discarded the message.

### 3.2 Fabrication is a schema gap, not a shortcut

`MentorProfile` stores `headline, expertise, availability, pricePerHour,
graduationYear, skills` and a relation-less `userId`. The engine needs
credentials, experience, rating, teaching styles, languages, and a name. The
previous agent invented them at render time. Deleting the fabricated values
without extending the schema and seed would leave the feature with nothing to
rank — so §4 Slice 1 treats this as a data-model task.

### 3.3 The seed cannot support either demo

24 of 25 mentors are byte-identical apart from price. All 24 rooms have exactly
one identical feature. Even with a perfect adapter, ranking near-identical
candidates yields a near-uniform ring, and hard constraints filter nobody. A
demo-grade seed is a prerequisite for the flagships, not polish afterwards.

---

## 4. Revised implementation plan

Ordered by dependency. Every slice ends with: real-browser check per relevant
role at 390px and 1440px, console/network clean, automated test added, `npm run
verify` green, commit. No slice is "done" because a page renders.

**Slice 0 — Stop the bleeding.** Server-side `requirePermission()` guard used by
every admin route and every server action; actor-scoped queries for
Applications, Appointments, Dashboard; assignee+role check in
`acceptAppointmentAction`. Fix the `verify` gate (prettier-ignore the
Next-managed `tsconfig.json`, gitignore browser artifacts). Stand up a real
Postgres-backed integration harness. _Verified by:_ E2E tests asserting a
student gets 403/redirect on all four admin routes and cannot see another
user's appointments.

**Slice 1 — Truthful data foundation.** Migration: `MentorProfile.user`
relation, plus the columns the engine actually consumes; varied
`RoomFeatureValue` rows. Rewrite the seed deterministically but with real
spread — mentors across IELTS/SAT/HSK with distinct sections, availability,
prices, ratings, experience; rooms with distinct feature sets; pre-existing
bookings, blocks and pending holds so constraints bite. Decide and document
timezone handling (store UTC, school-local `Asia/Ho_Chi_Minh`). Refresh README
credentials. _Verified by:_ a seed assertion test (no two mentors identical;
≥4 distinct feature codes in use) and a corrected `withinOperationalHours` test.

**Slice 2 — Time and calendar core.** `periodOccurrence(weekday, period, date,
tz)` in `packages/domain`; real Day/Week/Month grids driven by the existing
`inView/startOfView/endOfView`; role-scoped sources (student → own class,
teacher → own teaching load); fix the dashboard's today-view. _Verified by:_
unit tests on the weekday+period→datetime conversion and DST-free tz maths,
plus E2E asserting a student sees only their class and the correct weekday.

**Slice 3 — Facility Intelligence end to end.** Canonical DB→engine adapter
carrying timetable occupancy (derived per Slice 2), confirmed bookings, blocks,
active soft holds and operational hours. Real prompt input + manual form; Top-3
with hard-constraints-passed and soft breakdown; RoomRequest creation; admin
approve/reject/request-changes with room, recommendation and competing-request
context; corrected `approveRoomRequestTx` with a real row lock; calendar and
room schedule update. _Verified by:_ a genuine two-connection concurrency test
against Postgres (exactly one booking, other gets Conflict), and an E2E run
student→admin→calendar.

**Slice 4 — Mentor Intelligence end to end.** Request UI: natural language →
deterministic parser → structured requirements shown for human confirmation →
engine. Adapter built from real columns with **no** fabricated values;
validation failures surface as explicit, actionable errors. Persist
`MentorMatchRequest` + `MentorRecommendationRun`. Top-K with real reasons and
trade-offs; mentor profile with real identity; booking with live re-check via
`recheckMentorBooking`. _Verified by:_ an adapter test that a malformed row
raises rather than degrades, and an E2E from prompt to booking.

**Slice 5 — Match Space rebuild.** Render the persisted run from Slice 4. Real
names, score rings, deterministic stable animated nodes, hover preview, click
drawer with true engine factor comparison, constraint lens over real rejection
reasons, zoom/pan, keyboard-traversable list fallback. Distance stays a
monotonic function of match score; the geometry is never called an embedding.
_Verified by:_ determinism test (same run → same coordinates), monotonicity
test, axe pass, keyboard traversal.

**Slice 6 — Design system and mobile.** `packages/ui` primitives (Button, Card,
Badge, Field, Dialog, Table, Toast, icons) with real tokens; mobile drawer
navigation; `loading.tsx`/`error.tsx` and skeletons across routes; motion only
where it explains state. Reference `~/EduTechTest/src/components/ui` for
patterns, not for copy-paste. _Verified by:_ every route reachable and usable
at 390px; axe clean.

**Slice 7 — Remaining workflows.** Applications (versioned upload, review,
transfer with receiver accept), Appointments (full state machine + chat on
accept), Clubs (join approval, roles, documents, immutable finance with
void+correction), Discussion (post, reply, react, report, moderate).

**Slice 8 — Hardening.** Per-role E2E golden paths, axe, concurrency, honest
benchmark regeneration, demo walkthrough, docs.

---

## 5. What is genuinely sound — keep it

- **`packages/mentor-engine`** is a faithful import of `~/AI-Engine` (HEAD
  `cecfe50`); the only diffs are EduSync→ED4U branding in comments and two user-
  facing strings. 11 test files, strict Zod schemas, three-valued
  known/unknown/absent credential handling, deterministic explanations. It is
  the strongest asset in the repo and needs no changes — only an honest caller.
- **`packages/domain`** is largely correct and unused: `can/assertCan`, the
  room-request and appointment state machines, `occupiedInterval`,
  `hasHardOccupancyConflict`, `radiusFromScore`, `filterVisible`,
  `recheckMentorBooking`. Most of Slice 0–4 is wiring these up, not writing
  them. Exceptions needing repair: `withinOperationalHours` (timezone) and
  `applyConcurrentApprovals` (replace the simulation with a DB-backed test).
- **`packages/facility-engine`** has a clean hard/soft split and a real
  no-solution path. Its benchmark's zero-violation claim is trustworthy _for the
  engine_; it says nothing about the app, which never feeds it real state.
- **Prisma schema** is a sound 60-model foundation. Slice 1's changes are
  additive.
- **Docs and ADRs** are accurate and worth keeping current.

---

## 6. Slice 0 — completed

Commit follows the baseline `33d7332`. `npm run verify` passes end to end.

### Authorization

`requireRoute()` / `requirePermission()` in `apps/web/src/lib/authz.ts` replace
the previous "resolve the actor and render anyway" pattern. There is
deliberately **no** `requireAdmin()`: each page names the permission it needs,
and `ROUTE_PERMISSIONS` is the single map that both the sidebar and the guard
read, so visibility and enforcement cannot drift.

Verified live against all four roles (each with a real session, requesting every
guarded URL directly):

| Role                    | members | timetable | rooms | approvals | moderation | audit | settings |
| ----------------------- | ------- | --------- | ----- | --------- | ---------- | ----- | -------- |
| STUDENT `HS000001`      | 403     | 403       | 403   | 403       | 403        | 403   | 403      |
| TEACHER `GV000001`      | 403     | 403       | 403   | 403       | 403        | 403   | 403      |
| SCHOOL_ADMIN `AD000001` | **403** | OK        | OK    | OK        | OK         | OK    | **403**  |
| ADMIN_IT `IT000001`     | OK      | **403**   | 403   | **403**   | 403        | OK    | OK       |

ADMIN_IT and SCHOOL_ADMIN are not interchangeable; only `audit.read` is shared.

Actions carry three independent checks. `acceptAppointmentAction` now requires
`appointment.accept` (TEACHER only), then `assertTenant`, then
`assertRelated(actor, [apt.teacherId])` — so a teacher cannot accept another
teacher's appointment even though they hold the permission.

Reads are actor-scoped: appointments to the two participants, applications to
student / current teacher / pending-transfer teacher (SCHOOL_ADMIN keeps
tenant-wide oversight), dashboard timetable to the actor's own class or teaching
load. `/admin/moderation` previously read **every** report in the database with
no tenant filter at all; it now scopes through the forum hierarchy.

### Denial mechanism — a deliberate trade-off

Next 16's `forbidden()` returns a true 403 but its `authInterrupts` boundary
does not paint: verified in both dev and a production build, the denial UI is
emitted into the RSC flight payload and never committed to the DOM, leaving a
blank page. Enforcement was correct (status 403, protected content absent) but
the user saw nothing. Denial therefore redirects to `/403`, which is ordinary
supported behaviour. The security property is unchanged — the guarded page never
runs — and that is what the tests assert.

### Quality gate

`npm run verify` failed at step 1 before any of this work. Two causes, both fixed:

1. Prettier flagged `apps/web/tsconfig.json`, which Next rewrites on every boot.
   It is now prettier-ignored as machine-owned.
2. **`verify` was not idempotent.** Steps 7–8 ran the _smoke_ benchmarks, which
   overwrite the committed mentor report with a 20-request run; a test asserting
   the report records the full 1000-request workload then failed on the next
   run. The full benchmarks take under a second each, so `verify` now runs those.

`e2e` was pointed at port 3000, which on this machine is the **legacy EduSync
app** — Playwright was silently testing a different product. E2E now runs on a
dedicated port 3020 with `reuseExistingServer: false`.

### Tests added

- `tests/integration/authorization-scope.test.ts` — 8 assertions against real
  PostgreSQL, with a per-run throwaway tenant. Replaces the previous
  "integration" test that opened no connection.
- `tests/route-authorization.test.ts` — 10 assertions that every guarded page
  calls `requireRoute` with its own key, that nav and enforcement share one map,
  and that the ADMIN_IT / SCHOOL_ADMIN split holds.
- `e2e/authorization.spec.ts` — 8 browser tests: the full role × route matrix,
  content-leak check on a denied page, unauthenticated redirect, and appointment
  scoping.
- `tests/room-approval-domain.test.ts` — the old simulation, moved out of
  `tests/integration` and documented for what it actually proves.

### Demo credentials

`npm run db:demo:reset` drops, re-migrates and re-seeds, restoring `TempPass1!`
for every account deterministically. (`prisma migrate reset` alone does not run
the seed under this Prisma config, so the script chains `db:seed`.) E2E runs with
`DEMO_SKIP_PASSWORD_CHANGE=true` so a test run never mutates a demo password.

### Known, deliberately deferred

- `/favicon.ico` 404 is the only console error on authenticated pages — brand
  assets land in Slice 6.
- Dashboard timetable is scoped by class/teacher but not yet filtered to
  "today": that needs weekday + period → datetime in the school timezone
  (Slice 2), and is labelled honestly in the UI until then.

---

## 7. Slice 1 — completed

Migration `20260816120000_mentor_truth_and_school_timezone`. `npm run verify`
passes end to end.

### Schema

| Change                                                                                   | Closes §2.7 gap                  |
| ---------------------------------------------------------------------------------------- | -------------------------------- |
| `User.dateOfBirth DATE?`, `User.gender Gender?`                                          | no real source for `birthYear`   |
| `MentorProfile.user` relation (`userId` now `@unique` with an FK)                        | `MentorProfile.userId` unrelated |
| Mentor credential/rating/experience/style/language columns + `credentialsCheckedDomains` | no mentor engine columns         |
| `Tenant.timezone` (default `Asia/Ho_Chi_Minh`)                                           | no tenant timezone               |
| `MentorProfile.skills` dropped                                                           | duplicate of `expertise`         |

`dateOfBirth` is a `DATE`, not a timestamp: a civil date cannot be shifted by a
timezone. `gender` distinguishes NULL (never recorded) from `UNDISCLOSED`
(asked, declined) — the same shape as the credential contract, and the adapter
keeps them apart.

### Credential semantics in storage

`credentialsCheckedDomains` is what carries the engine's three-valued contract
into the database:

| State                              | Storage                                | Adapter emits |
| ---------------------------------- | -------------------------------------- | ------------- |
| UNKNOWN — nobody checked           | domain absent from the array           | key omitted   |
| KNOWN ABSENT — checked, holds none | domain listed, score columns `NULL`    | `null`        |
| KNOWN PRESENT                      | domain listed, score columns populated | credential    |

Column nullability alone cannot express this: a `NULL` band in a domain nobody
checked is unknown, and emitting it as `null` would assert an absence we never
observed. All three states appear in the seed on purpose.

### Adapter

`apps/web/src/lib/mentor/adapter.ts` is the single DB→canonical boundary. It
returns `CanonicalMentorCandidate`, deliberately **not** `Mentor`: claiming that
type would need a cast, and a cast is how an unvalidated skill string reaches the
ranker. `validateMentors` remains the judge. `ratingCount`, `headline`,
`graduationYear`, `tenantId` and `userId` stay behind the boundary.

A row that cannot supply a required field is returned as an explicit
`MentorAdaptationFailure` with reasons, and the UI lists it. Nothing is
completed with a guess — the fabricated `birthYear: 2000`, the invented IELTS
8.0 across all four sections, `teachingExperienceMonths: 18` and `rating: 4.6`
are gone, and the silent `matchScore: 50` fallback with them.

### Timezone

`packages/domain/src/academic/timezone.ts` converts instants to school-local
civil time through `Intl.DateTimeFormat`, which carries the IANA rules.
`withinOperationalHours` and `weekdayOf` now take a **required** `timeZone`; a
default would let the seven-hour error return unnoticed. The domain test asserts
the exact defect: a 20:00–21:00 school-local booking passes under the old UTC
reading and is correctly rejected now. `approveRoomRequestTx` reads
`Tenant.timezone`.

`periodOccurrence(weekday, period, date, tz)` — the civil→instant direction —
remains Slice 2.

### Seed

24 mentors (`HS990002`–`HS990025`) written out longhand: three domains, 12+
distinct expertise sets, 12+ distinct availability sets, prices 120k–650k, both
verification states, ratings and experience both known and unknown, and all
three credential knowledge states. Rooms carry type-appropriate feature sets
instead of one universal `PROJECTOR=true`. Every demo identity has a
deterministic, plausible date of birth and gender.

The acceptance criterion is behavioural, not "no two rows identical" — that was
already true of the prototype via ids and prices. `tests/integration/seed-truthfulness.test.ts`
asserts against the real database that IELTS, SAT and HSK requests each rank a
**different** mentor first, that tightening the budget shrinks the eligible set
rather than reordering it, that different hard constraints reject different
mentors for different reasons, and that an unservable request returns
`noFeasibleMatch` instead of a relaxed answer.

### Defects found and fixed beyond the plan

1. **`db:demo:reset` was broken.** `prisma migrate reset --skip-seed` is not a
   valid Prisma 7 flag, so the command failed and the `&&`-chained seed never
   ran. It is now `prisma migrate reset --force && npm run db:seed` (reset alone
   does not run the seed under this config).
2. **Match Space had a hydration mismatch.** `Math.cos`/`Math.sin` differ in the
   last ULP between Node and the browser, so the SSR and client SVG transforms
   disagreed in the 16th digit and React refused to patch the tree. Coordinates
   are now rounded to six decimals in `layoutMatchSpace` — far below a device
   pixel, and it makes "deterministic for the same run" true across engines.
3. **`prisma migrate dev` cannot run non-interactively** when a change carries a
   data-loss or unique-constraint warning. The migration was generated with
   `prisma migrate diff --from-config-datasource --to-schema` and applied with
   `migrate deploy`.
4. **Next 16 refuses a second `next dev` in the same directory**, whatever the
   port. A stray manual dev server makes the Playwright `webServer` fail to
   start; kill it before running `verify`.

### Verified in a real browser

Logged in as `HS000001` at 1440px and 390px. `/mentor` lists real names, real
headlines and real prices, with rating omitted where none exists. `/mentor/[id]`
shows "IELTS: 6.5 · SAT: đã kiểm tra, không có chứng chỉ · HSK: đã kiểm tra,
không có chứng chỉ" for the mentor with all three states, and "Chưa kiểm tra
chứng chỉ nào" for the one nobody has checked. `/mentor/match-space` runs the
engine: 6 eligible mentors scoring 71.8 down to 29.88, the rest carrying the
engine's own rejection reasons (`UNVERIFIED`, `AVAILABILITY`, `PRICE`,
`DOMAIN`). Console clean apart from the known `/favicon.ico` 404.

### Tests added

- `packages/domain/tests/timezone.test.ts` — 13 assertions on civil-time
  conversion, DST, and the operational-hours defect.
- `apps/web/tests/mentor-adapter.test.ts` — 14 assertions on identity, the three
  credential states, and the engine boundary.
- `apps/web/tests/integration/seed-truthfulness.test.ts` — 11 assertions against
  real PostgreSQL, including the behavioural diversity criteria above.
- `apps/web/e2e/mentor-data-truth.spec.ts` — 3 browser tests: no UUID-as-name,
  distinct real scores, engine rejection reasons.

### Still deliberately open

- `/mentor` has no request input; the Match Space request is a fixed demo
  request, labelled as such in the UI (Slice 4).
- No `MentorMatchRequest` / `MentorRecommendationRun` is persisted yet (Slice 4).
- Match Space is still the inherited visual; Slice 5 rebuilds it.
- Teacher routing/responsibility, blocked-time and `ClubAdvisor` models, and
  `tenantId` on `Report`/`ModerationCase`, remain Slice 7.
