# ED4U — Implementation Plan V1
## Production-grade Hackathon Build Plan

> **Project name is ED4U. Do not use “EduSync” in the product UI, copy, routes, screenshots, seed data labels, documentation, package descriptions, or new code comments.**
>
> Two existing codebases are **read-only reference inputs**:
>
> - Mentor Intelligence Engine: `~/AI-Engine`
> - Old EduTech web: `~/EduTechTest`
>
> Build ED4U in a **brand-new repository**. Do not refactor either reference repo in place.

---

# 0. Mission

Build a polished, locally runnable school operating platform called **ED4U** that combines:

1. School identity and access management.
2. Academic structure and timetable.
3. Unified calendar.
4. Student → teacher applications and appointments.
5. Mentor matching powered by the completed Mentor Intelligence Engine.
6. A visually memorable **Mentor Match Space**.
7. Facility/room booking with a new Facility Planning Intelligence Engine.
8. Clubs, club governance, documents, finance ledger, and events.
9. A lightweight moderated Discussion Hub.
10. Shared approvals, files, notifications, audit, and search.
11. Reproducible benchmarks for each intelligence engine.

The product must launch locally from one repo, with deterministic seed data and demo credentials, and must be demonstrable end-to-end without manually editing the database.

---

# 1. Non-negotiable principles

## 1.1 Branding

- Product name: **ED4U**.
- Never ship “EduSync” branding.
- Existing package/source names imported from legacy repositories must be renamed in a dedicated migration commit.
- The rename must not alter runtime behavior.

## 1.2 Build in a new repository

Recommended location:

```bash
~/ED4U
```

The agent may read from:

```bash
~/AI-Engine
~/EduTechTest
```

but must not modify them.

Before copying anything:

```bash
git -C ~/AI-Engine status
git -C ~/EduTechTest status
```

Record source commit hashes in `docs/provenance.md`.

## 1.3 Use old code selectively

The old web is a **reference library**, not the specification.

Reuse only when a component is:

- correct,
- secure,
- compatible with the new domain model,
- stylistically appropriate,
- and cheaper to adapt than rewrite.

The new architecture defined in this plan overrides legacy assumptions.

Examples of legacy concepts that **must not be blindly copied**:

- parent accounts,
- email-first identity,
- old role enum,
- old mentor marketplace bidding assumptions,
- multi-school UI complexity not needed for V1,
- no-code workflow breadth that exceeds the new Approval Core.

## 1.4 Intelligence architecture

Use intelligence only where it solves a real decision problem.

ED4U V1 has two flagship intelligence modules:

1. **Mentor Intelligence Engine**
2. **Facility Planning Intelligence Engine**

Teacher routing may use a lightweight classifier/router, but does not need a large standalone “AI engine”.

Discussion Hub, Calendar, Clubs, Finance, and Approval Core remain deterministic software.

## 1.5 Human-in-the-loop

Canonical rule:

> **AI proposes → deterministic code validates → human authorizes → transaction mutates state.**

No AI component may directly create a confirmed booking, approve a school request, alter a timetable, or make irreversible user-facing decisions.

## 1.6 Quality target

“Bug-free” cannot be guaranteed mathematically.

The release target is:

- zero known Critical bugs,
- zero known High bugs,
- zero broken primary flows,
- zero failing automated quality gates,
- zero console errors on tested pages,
- zero unhandled promise rejections,
- zero tenant-boundary violations,
- zero hard-constraint violations in intelligence benchmarks.

---

# 2. Required developer-tool workflow

The coding agent must actively use available development tools rather than guessing.

## 2.1 Required tool categories

Use, when available:

- **Browser / Playwright / browser MCP** — visual QA, interaction testing, responsive checks.
- **Context7** — current docs for Next.js, React, Prisma, Zod, Playwright, Motion, OR-Tools or selected solver.
- **Desktop Commander / terminal MCP** — inspect source repos, run commands, read logs, manage local services.
- **Git/GitHub tools** — commit checkpoints, inspect diffs, review history.
- Relevant `skills/*.md` files — read before using a framework/tool if a matching skill exists.

## 2.2 Tool rule

Before using an unfamiliar library API:

1. Query Context7/current docs.
2. Verify current package version.
3. Implement.
4. Run typecheck/tests.
5. Validate behavior in browser.

Do not invent APIs from memory when docs are available.

## 2.3 Visual QA rule

For every user-facing phase:

1. Open the page in browser.
2. Test at desktop width.
3. Test at tablet width.
4. Test at mobile width.
5. Test loading state.
6. Test empty state.
7. Test error state.
8. Test keyboard navigation.
9. Check console errors.
10. Capture screenshot for review.

---

# 3. Recommended technology stack

Use a single TypeScript monorepo unless a solver requirement justifies one small Python service.

## 3.1 Application stack

Recommended:

- Next.js 16+
- React 19+
- TypeScript strict mode
- PostgreSQL
- Prisma
- Zod
- Tailwind CSS
- Motion / Framer Motion-compatible animation library
- Playwright
- Vitest
- Argon2id for password hashing
- Redis optional for rate limiting/cache; do not require it for correctness if avoidable

## 3.2 Monorepo structure

```text
ED4U/
├── apps/
│   └── web/
│       ├── src/app/
│       ├── src/components/
│       ├── src/features/
│       ├── src/server/
│       └── tests/
│
├── packages/
│   ├── mentor-engine/
│   ├── facility-engine/
│   ├── domain/
│   ├── ui/
│   ├── config/
│   └── test-utils/
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed/
│
├── docs/
│   ├── architecture.md
│   ├── data-model.md
│   ├── permissions.md
│   ├── benchmark.md
│   ├── provenance.md
│   ├── runbook.md
│   └── adr/
│
├── scripts/
├── .env.example
├── package.json
├── README.md
└── PLAN.md
```

Prefer workspace packages over copying domain logic into route files.

---

# 4. Fresh-repo bootstrap

## 4.1 Phase 0A — capture baselines

Before new implementation:

### Mentor source

Run in the existing engine repository:

```bash
cd ~/AI-Engine/mentor-intelligence-engine
npm test
npm run typecheck
npm run build
npm run benchmark
```

Record results in:

```text
docs/provenance.md
```

Do not “fix” unrelated source files in the reference repo.

### Old web

Inspect:

- package versions,
- UI primitives,
- auth patterns,
- calendar code,
- file service,
- audit service,
- notification/outbox code,
- tests,
- reusable page-shell patterns.

Do not copy the old Prisma schema wholesale.

## 4.2 Phase 0B — import Mentor Engine

Copy the finished mentor engine into:

```text
packages/mentor-engine
```

Preserve behavior first.

Then perform a dedicated brand migration:

```text
@edusync/mentor-engine
→
@ed4u/mentor-engine
```

Rename:

- package name,
- docs,
- example imports,
- generated tarball labels,
- textual branding.

Do not rename domain concepts unnecessarily.

After rename:

```bash
npm test
npm run typecheck
npm run build
npm run benchmark
npm pack
```

Add an external-consumer test from a temporary NodeNext TypeScript project.

### Definition of done

- Behavior unchanged.
- All tests pass.
- Benchmark metrics remain within expected deterministic values.
- No `EduSync` string remains inside the imported package except historical provenance notes.

---

# 5. Core domain model

Keep `tenant_id` even though V1 runs one school.

## 5.1 User identity

Internal user identity:

```text
user_id = random UUID
```

Business username:

```text
school_member_code
```

Rules:

- `school_member_code` is immutable in V1.
- It is unique within a tenant.
- It is the username used to sign in.
- It is never used as a database primary key.

## 5.2 Membership

Separate identity from access role.

```text
SchoolMembership
- id
- tenant_id
- user_id
- school_member_code
- member_type
- membership_status
- class_id?
- started_at
- ended_at?
```

Member type:

```text
STUDENT
TEACHER
STAFF
```

Membership status:

```text
ACTIVE
GRADUATED
LEFT_SCHOOL
SUSPENDED
```

## 5.3 System roles

Do not store one `role` column on `users`.

Use assignments:

```text
UserRoleAssignment
- user_id
- role
- assigned_by
- assigned_at
```

Roles:

```text
STUDENT
TEACHER
MENTOR
SCHOOL_ADMIN
ADMIN_IT
```

Rules:

- `TEACHER + SCHOOL_ADMIN` allowed.
- `TEACHER + MENTOR` forbidden.
- Active student + Mentor forbidden.
- Mentor requires `membership_status = GRADUATED`.
- Club roles are not system roles.

## 5.4 Account lifecycle

Accounts are provisioned by ADMIN_IT.

Supported creation:

- manual account creation,
- Excel import.

Excel minimum fields:

```text
full_name
class
school_member_code
member_type
```

System generates temporary password.

First login:

```text
must_change_password = true
```

After password change:

- hash with Argon2id,
- revoke temporary credential,
- never store plaintext password.

Admin may export initial credentials **once at creation/import time**.

Forgot password:

- user contacts ADMIN_IT,
- ADMIN_IT resets password,
- new temporary password generated,
- `must_change_password = true`.

No email recovery V1.

## 5.5 Graduated student behavior

Graduated students may:

- log in,
- view own historical data,
- view Discussion Hub read-only,
- apply to become mentor.

They may not:

- create new student applications,
- create student-service bookings,
- act as active students.

---

# 6. Permission architecture

Authorization is evaluated server-side on every mutation.

Use:

```text
system role
+
membership status
+
resource ownership
+
domain relationship
```

Do not rely only on UI visibility.

Examples:

- Teacher A sees Teacher A’s appointments, not Teacher B’s.
- Teacher may view student profiles needed for school operations.
- Mentor may view student name, class, and permitted profile fields, not private contact details.
- Students do not see mentor private email/phone by default.
- SCHOOL_ADMIN manages business operations.
- ADMIN_IT manages accounts/system configuration.

Database/operator access is outside normal application UI.

Sensitive content may exist in the backend/database without automatically being exposed in admin screens.

---

# 7. Shared platform services

## 7.1 Audit service

Append-only audit events for:

- account creation/reset,
- role assignment,
- approvals,
- transfers,
- room bookings,
- event lifecycle,
- finance changes,
- moderation actions,
- AI recommendation runs,
- important file lifecycle changes.

Minimum:

```text
actor
action
entity_type
entity_id
before_json?
after_json?
request_id
timestamp
tenant_id
```

## 7.2 File service

One file service shared by:

- applications,
- club proposals,
- club documents,
- finance receipts,
- event proposals,
- forum attachments.

Requirements:

- private storage,
- authorization before download,
- SHA-256 hash,
- MIME validation,
- size limit,
- soft-delete metadata,
- PDF inline preview where useful.

V1 file limit:

```text
25 MiB/file
```

Do not allow arbitrary executable uploads.

## 7.3 Notification service

In-app notifications required for:

- application status,
- teacher appointment response,
- chat creation,
- room request status,
- room conflicts,
- club membership decisions,
- club event decisions,
- finance approval,
- forum reply/mention/moderation,
- mentor match/booking events.

Email/SMS are not required for V1.

## 7.4 Approval Core

Do not build a giant no-code workflow designer.

Use a small reusable Approval Core:

```text
Approval
- id
- tenant_id
- subject_type
- subject_id
- status
- requested_by
- requested_at
- resolved_by?
- resolved_at?
- reason?
```

Optional multiple steps:

```text
ApprovalStep
- approval_id
- step_number
- approver_type
- approver_id?
- status
```

Domain services own side effects.

Examples:

- Club approval → activate club.
- Event approval → confirm room and publish calendar.
- Room request approval → create confirmed booking.

---

# 8. Academic Core

## 8.1 Entities

```text
AcademicYear
Semester
Class
Subject
AcademicPeriod
TimetableEntry
```

## 8.2 Requirements

- One school has many classes.
- An active student belongs to one primary class.
- Teacher may teach many classes.
- Subjects are admin-configurable.
- Academic years and semesters are explicit.
- Semester timetables may differ.
- No Week A/B in V1.
- No weekend timetable in V1.
- No teacher substitution in V1.
- No timetable exception layer in V1.

## 8.3 Periods

Periods are tenant-configurable:

```text
Period 1 07:30–08:15
Period 2 08:20–09:05
...
```

Do not hard-code times.

## 8.4 Timetable entries

V1:

```text
TimetableEntry
- tenant_id
- academic_year_id
- semester_id
- class_id
- subject_id
- teacher_id
- room_id
- weekday
- period_id
```

One class, one teacher, one room per entry.

## 8.5 Import

Support:

- ADMIN_IT Excel import,
- SCHOOL_ADMIN UI editing.

Import must be transactional.

Reject the entire import if:

- teacher double-booked,
- room double-booked,
- invalid class,
- invalid subject,
- invalid teacher,
- invalid room,
- duplicate row.

Return row-numbered errors.

---

# 9. Unified Calendar

## 9.1 Important architecture rule

Do not duplicate timetable rows as calendar events.

Calendar is a projection over multiple sources:

```text
Timetable
Appointments
Mentor bookings
Club events
School events
Room bookings
```

## 9.2 Views

Required:

- Day
- Week
- Month

## 9.3 Calendar surfaces

### My Calendar

Student:

- class timetable,
- teacher appointments,
- mentor bookings,
- relevant events.

Teacher:

- teaching timetable,
- accepted appointments,
- relevant school events.

### School Event Calendar

Published events according to visibility.

### Room Schedule

Timeline/grid of:

- timetable occupancy,
- confirmed room bookings,
- maintenance blocks.

## 9.4 Event visibility

```text
SCHOOL
GRADE
CLASS
CLUB
PRIVATE
```

No RSVP/attendance V1.

No arbitrary personal calendar events V1.

No recurring non-timetable events V1.

---

# 10. Student Applications

Applications and appointments are separate domains.

## 10.1 Application workflow

Students download a provided sample PDF, fill it externally, and upload it when teacher confirmation is required.

No dynamic form-builder V1.

Application fields:

```text
id
tenant_id
student_id
raw_request_text
classified_category?
current_teacher_id
pending_transfer_to?
status
description?
latest_submission_version_id
created_at
updated_at
```

Statuses:

```text
DRAFT
SUBMITTED
IN_REVIEW
NEEDS_MORE_INFO
APPROVED
REJECTED
CANCELLED
COMPLETED
```

## 10.2 Versioned submissions

Never overwrite reviewed PDFs.

Use:

```text
ApplicationSubmissionVersion
- application_id
- version_number
- file_id
- submitted_by
- submitted_at
```

Student may edit and resubmit, creating a new version.

## 10.3 Teacher transfer

Teacher A may transfer a case to Teacher B.

Flow:

```text
A requests transfer
→ A remains current assignee
→ B reviews transfer
→ B accepts
→ B becomes current assignee
```

Files/history remain with the same case.

## 10.4 Lightweight teacher routing

Support both:

1. manual teacher search,
2. assisted teacher suggestion.

Suggested flow:

```text
student natural-language need
→ classify request category
→ map category to responsible group
→ eligible teachers
→ rank by responsibility + workload + relevant availability
→ Top recommendations
```

Do not copy Mentor Engine wholesale.

No heavy standalone teacher AI engine unless later evidence shows a need.

---

# 11. Teacher Appointments

Appointments are independent from Applications, but may optionally link to one.

## 11.1 Creation

Student may:

- manually choose teacher and request time,
- use teacher suggestion flow.

Availability context includes:

- timetable,
- existing appointments,
- blocked times.

Students may still request a conflicting or inconvenient time; teacher may reject.

## 11.2 Appointment state

Recommended:

```text
REQUESTED
ACCEPTED
DECLINED
RESCHEDULE_PROPOSED
CANCELLED
COMPLETED
```

Teacher may propose another time.

On ACCEPT:

1. create calendar entry,
2. create private conversation,
3. notify both parties.

No room-booking integration needed V1.

## 11.3 Chat

Create chat **only after appointment acceptance**.

Use one conversation per appointment initially.

Support:

- text messages,
- basic attachment support,
- timestamps,
- read state,
- audit metadata.

No public user-to-user messaging outside contextual workflows.

---

# 12. Mentor Domain

The existing Mentor Intelligence Engine is the source of truth for ranking behavior.

## 12.1 Integration boundary

Web/server owns:

- auth,
- tenant scope,
- database queries,
- candidate loading,
- canonical adapters,
- persistence,
- booking transactions.

Engine owns:

- normalization,
- hard filtering,
- feature construction,
- ranking,
- deterministic explanations,
- result object.

Engine must not directly query production DB.

## 12.2 Mentor eligibility

Mentor:

- must be a graduated student,
- applies for mentor profile,
- is reviewed/verified,
- belongs to same school/tenant.

No cross-school marketplace V1.

## 12.3 Student match request

Example:

```text
Goal: IELTS
Current: 6.0
Target: 7.0
Focus: Writing
Availability: Tue/Thu evening
Budget max: 200k/session
```

Structured request must distinguish:

- hard constraints,
- soft preferences,
- unknown values.

## 12.4 Booking rule

Recommendation is not reservation.

On booking:

1. re-fetch mentor live state,
2. re-check eligibility,
3. re-check availability,
4. begin transaction,
5. create booking,
6. emit audit/notification events.

---

# 13. Mentor Match Space — WOW factor

This is a major presentation surface.

Do **not** fake an “embedding map” if the engine is not actually using embeddings.

## 13.1 Core concept

Student is fixed at the center.

Every eligible mentor is rendered as a node around the student.

Distance from the student must have a truthful meaning.

Recommended V1:

```text
radial distance = monotonic function of (1 - matchScore)
```

Therefore:

- higher score = physically closer,
- lower score = farther away.

Angle is used only for stable visual separation and/or clustering by dominant specialty/focus feature.

## 13.2 Concentric match bands

Suggested rings:

```text
90–100  Exceptional fit
80–89   Strong fit
70–79   Good fit
<70     Exploratory
```

Do not imply probability.

Label explicitly:

```text
Match score ≠ probability
```

## 13.3 Interactions

Required:

- pan,
- zoom,
- hover tooltip,
- click mentor,
- side detail panel,
- filter by skill,
- filter by availability,
- filter by budget,
- toggle “show eliminated candidates” if useful,
- animate nodes smoothly when filters change.

## 13.4 Mentor detail panel

Show:

- name,
- class/graduation year,
- headline credentials,
- engine match score,
- Top reasons,
- trade-offs,
- availability match,
- budget match,
- relevant skills,
- CTA: View Profile / Request Mentor.

## 13.5 “Why this match?” visualization

Inspired by the reference image but not copied pixel-for-pixel.

Show paired bars or a radar-like comparison for:

- credential strength,
- focus skill,
- availability,
- budget,
- experience,
- rating,
- teaching-style fit.

Use the actual engine feature values.

## 13.6 Constraint Lens — creative extension

Add a toggle:

```text
Match Space
[All] [Eligible] [Filtered out]
```

When “Filtered out” is enabled:

- render excluded mentors faintly outside the main orbit,
- clicking one shows exact rejection reason:
  - unavailable,
  - exceeds budget,
  - missing required specialization,
  - unverified.

This turns engine logic into a visual explanation and is a strong hackathon demo feature.

## 13.7 Deterministic layout

Same request + same candidate pool + same engine version should generate the same node positions.

Do not use nondeterministic physics as the final resting state.

Animation may interpolate to deterministic coordinates.

## 13.8 Accessibility

Match Space must have a table/list alternative.

Keyboard users must be able to traverse mentors.

Never make the visualization the only way to access results.

---

# 14. Facility / Room Core

V1 books rooms only, not standalone equipment.

## 14.1 Room model

```text
Room
- id
- tenant_id
- code
- name
- room_type_id
- building
- floor
- capacity
- status
```

Status:

```text
ACTIVE
MAINTENANCE
DISABLED
```

## 14.2 Room types

Admin-configurable.

Examples:

```text
CLASSROOM
MUSIC_ROOM
COMPUTER_LAB
SCIENCE_LAB
AUDITORIUM
MEETING_ROOM
```

## 14.3 Room features

Do not create one DB column per feature.

Use configurable feature definitions:

```text
RoomFeatureDefinition
- id
- tenant_id
- code
- name
- data_type
```

Examples:

- PROJECTOR
- PIANO
- SOUND_SYSTEM
- COMPUTERS
- AIR_CONDITIONING
- CHEMISTRY_EQUIPMENT
- 3D_PRINTER

Values stored per room.

## 14.4 Room blocks

```text
RoomBlock
- room_id
- start_at
- end_at
- reason
```

Maintenance blocks are hard conflicts.

## 14.5 Operational hours

Bookings:

- Monday–Friday only in V1.
- Hours tenant-configurable.
- Seed default may be 07:00–20:00.

## 14.6 Booking interval

Support:

- event start/end,
- setup buffer,
- cleanup buffer.

Conflict detection uses actual occupied interval:

```text
reservation_start = event_start - setup
reservation_end   = event_end + cleanup
```

---

# 15. Facility booking workflow

All active students may submit room requests.

## 15.1 State machine

Recommended:

```text
DRAFT
SUBMITTED
PENDING_APPROVAL
CHANGES_REQUESTED
APPROVED
REJECTED
CANCELLED
COMPLETED
```

## 15.2 Soft hold

Pending request produces a 24h soft hold.

Rules:

- multiple conflicting pending requests may coexist,
- soft hold is not a hard lock,
- soft hold affects recommendation/risk score,
- after 24h it stops affecting recommendation priority,
- request remains pending until resolved.

## 15.3 Approval transaction

On SCHOOL_ADMIN approval:

```text
BEGIN
→ lock relevant booking scope
→ re-check timetable
→ re-check confirmed bookings
→ re-check room blocks
→ re-check operational hours
→ if conflict: fail approval with actionable error
→ else create confirmed booking
→ update request APPROVED
COMMIT
```

Never trust stale recommendation state.

## 15.4 Cancellation

Approved booking cancellation:

- immediate,
- room freed immediately,
- audit event emitted,
- linked event → `NEEDS_RESOURCE`.

No admin confirmation required for cancellation V1.

---

# 16. Facility Planning Intelligence Engine

Build as a separate package:

```text
packages/facility-engine
```

Follow the Mentor Engine architectural pattern, not its algorithm.

## 16.1 Boundary

Input is canonical school state:

- rooms,
- room features,
- timetable occupancy,
- confirmed bookings,
- room blocks,
- pending soft holds,
- operational hours,
- event/request parameters.

The engine must not query Prisma directly.

## 16.2 Two user modes

### Manual

User directly chooses:

- date,
- time,
- room/room type.

### Smart

Natural language example:

> “Tìm phòng cho CLB Robotics, 80 người, chiều thứ Sáu, cần máy chiếu, ưu tiên gần khu STEM.”

## 16.3 Parsing

Natural-language layer converts request to structured constraints.

Example:

```json
{
  "attendees": 80,
  "requiredFeatures": ["PROJECTOR"],
  "preferredRoomType": "COMPUTER_LAB",
  "day": "FRIDAY",
  "timeWindow": {
    "start": "13:00",
    "end": "17:30",
    "flexible": true
  }
}
```

Exact time requests remain exact unless user explicitly allows alternatives.

## 16.4 Hard constraints

At minimum:

- room ACTIVE,
- capacity sufficient,
- mandatory features present,
- no timetable conflict,
- no confirmed booking conflict,
- no maintenance block,
- within operational hours,
- exact requested time honored when fixed.

Hard constraints may never be relaxed automatically.

## 16.5 Soft preferences

Examples:

- preferred room type,
- preferred building,
- preferred time,
- capacity efficiency,
- minimal pending soft-hold risk,
- activity→room-type affinity,
- event priority compatibility.

## 16.6 Output

Return Top 3 plans.

Each plan:

```text
room
time
score
hard constraints passed
soft preference breakdown
reasons
trade-offs
pending conflict risk
```

## 16.7 No-solution behavior

If no feasible result:

1. identify blocking constraints,
2. keep hard constraints intact,
3. propose alternative times/soft-preference relaxations,
4. require user confirmation before creating a RoomRequest.

---

# 17. School events

Event proposal and RoomRequest are separate entities.

## 17.1 Event visibility

Use same calendar visibility:

```text
SCHOOL
GRADE
CLASS
CLUB
PRIVATE
```

## 17.2 Event priority

Use:

```text
event_type
numeric_priority
```

Priority is configurable.

Do not allow priority to automatically displace an already confirmed booking.

## 17.3 Approval with room

When approving a room-backed event:

```text
re-check room
→ if unavailable: event = NEEDS_RESOURCE
→ if available:
   confirm RoomBooking
   approve Event
   publish calendar projection
```

No state where event is “fully approved” while its mandatory room is unresolved.

---

# 18. Club Domain

## 18.1 Creation

Any active student may propose a club.

Flow:

```text
student downloads sample proposal PDF
→ fills externally
→ uploads proposal
→ SCHOOL_ADMIN reviews
→ approved → Club ACTIVE
```

Statuses:

```text
PROPOSED
ACTIVE
SUSPENDED
ARCHIVED
REJECTED
```

Archived clubs remain read-only with historical data preserved.

## 18.2 Advisors

SCHOOL_ADMIN has global oversight.

Optional specific Club Advisors may be added via:

```text
ClubAdvisor
- club_id
- user_id
- assigned_by
```

Do not duplicate every SCHOOL_ADMIN as an explicit advisor row for every club.

## 18.3 Membership

Statuses:

```text
PENDING
ACTIVE
REJECTED
LEFT
REMOVED
```

Student may belong to multiple clubs.

Join:

```text
student applies
→ CORE+ approves
```

Invites allowed.

Student may leave immediately; audit the action.

Removal requires reason + audit.

## 18.4 Club roles

Strict hierarchy:

```text
PRESIDENT
VICE_PRESIDENT
CORE
MEMBER
```

Rules:

- one President,
- multiple VPs,
- multiple Core,
- President assigns VP/Core,
- SCHOOL_ADMIN may override,
- succession:
  - President proposes,
  - successor accepts,
  - SCHOOL_ADMIN confirms.

## 18.5 Permissions

Core+ may:

- approve membership,
- upload documents,
- request rooms,
- propose events,
- create finance entries.

President:

- approves finance entries,
- manages senior club roles,
- manages succession proposal.

## 18.6 Club documents

Folder hierarchy.

Supported:

- PDF
- DOCX
- XLSX
- PPTX
- images

Visibility:

```text
ALL_MEMBERS
CORE_PLUS
VP_PLUS
PRESIDENT_ONLY
SCHOOL_ADMIN_ONLY
```

Support versioning.

Soft delete + audit.

## 18.7 Club finance

Bookkeeping only.

No payment gateway.
No wallet.
No custody.

Ledger types:

```text
INCOME
EXPENSE
```

Both require approval.

Entry:

```text
amount
currency
category
description
transaction_date
receipt?
event_id?
created_by
approved_by?
status
```

Statuses:

```text
PENDING
APPROVED
REJECTED
VOIDED
```

Approved records are immutable.

Correction:

```text
VOID original
→ create correction entry
```

Never silently UPDATE an approved amount.

Support:

- configurable categories,
- event budgets,
- CSV/XLSX export,
- SCHOOL_ADMIN read access.

## 18.8 Club events

Core+ may propose.

Fields:

```text
title
description
start/end
expected_attendees
event_type
visibility
room_required
planned_budget?
proposal_pdf?
```

Flow:

```text
event proposal
→ optional manual/smart room selection
→ linked RoomRequest
→ SCHOOL_ADMIN review
→ atomic room re-check
→ approve event + confirm room + publish calendar
```

Material edits require re-approval.

Material:

- date,
- time,
- room,
- major capacity change,
- visibility,
- event type.

Non-material:

- typo,
- description,
- poster image,
- contact text.

Cancellation:

- immediate,
- room released,
- calendar unpublished,
- notification + audit.

Club has no separate AI engine.
It consumes Facility Planning.

---

# 19. Discussion Hub V1

This is not the product’s technology centerpiece. Keep it clean and modest.

## 19.1 Structure

```text
Category
→ Forum
→ Thread
→ Post
```

Thread types:

```text
DISCUSSION
QUESTION
ANNOUNCEMENT
```

Question may have:

```text
SOLVED
ACCEPTED_ANSWER
```

## 19.2 Access

- Active Student: read/write.
- Teacher: read/write.
- SCHOOL_ADMIN: read/write/moderate.
- ADMIN_IT: technical access; moderation not a daily job.
- Graduated student: read-only.
- Mentor: no general forum access V1 unless later needed.

## 19.3 Identity

Use real identity.

Show:

- full name,
- class when applicable,
- role badges.

No anonymous posting V1.

## 19.4 Posts

Flat chronological replies.

Support:

- quote,
- @mention,
- edit,
- backend edit history,
- soft delete,
- rich text basics,
- image/PDF/DOCX attachments.

No video upload.

## 19.5 Reactions

```text
LIKE
HELPFUL
```

No downvotes.

## 19.6 Discovery

- Latest
- Featured
- Unanswered
- keyword search
- controlled tags
- pinned/locked threads

No AI search required V1.

## 19.7 Moderation

Post immediately; moderate reactively.

Report categories:

- harassment,
- bullying,
- spam,
- hateful content,
- sexual content,
- personal information,
- cheating,
- misinformation,
- other.

Multiple reports aggregate into one ModerationCase.

Actions:

```text
NO_ACTION
WARN
HIDE_POST
DELETE_POST
LOCK_THREAD
SUSPEND_FORUM_ACCESS
ESCALATE
```

Moderator never edits user content.

Every action requires reason + audit.

Forum suspension is separate from whole-account suspension.

## 19.8 AI moderation

Optional only.

If added:

- may flag,
- may temporarily hide extreme/high-confidence risk,
- must never auto-delete,
- human moderator is final authority,
- forum still works if AI service is down.

---

# 20. UI/UX design system

The UI must feel intentionally designed, not AI-generated.

## 20.1 Visual direction

Aim for:

- quiet premium school-tech aesthetic,
- generous whitespace,
- crisp typography,
- subtle depth,
- restrained gradients,
- clean data visualization,
- responsive layout,
- high information density only where justified.

Avoid:

- glassmorphism everywhere,
- excessive gradients,
- rainbow AI colors,
- giant meaningless hero text,
- over-rounded everything,
- generic “AI sparkle” iconography,
- random glowing blobs.

## 20.2 Brand

Create an ED4U visual system with:

- wordmark,
- symbol,
- primary neutral palette,
- one distinctive accent,
- semantic status colors,
- consistent spacing scale,
- typography scale,
- icon system.

Do not reuse EduSync logo/wordmark.

## 20.3 Motion

Use motion for:

- page transitions,
- panel open/close,
- list reorder,
- calendar navigation,
- Match Space node movement,
- hover focus,
- success transitions,
- loading state.

Rules:

- motion must explain state,
- no distracting perpetual animation,
- respect `prefers-reduced-motion`,
- 150–300ms for common UI transitions,
- longer only for deliberate data visualizations.

## 20.4 Loading

No blank screens.

Use:

- skeletons,
- optimistic state only when safe,
- progress indicators for imports/uploads,
- proper disabled states during mutations.

## 20.5 Empty states

Every major screen requires a designed empty state with:

- clear reason,
- next action,
- no dead ends.

---

# 21. Primary navigation

Recommended role-aware sidebar:

```text
TỔNG QUAN
- Dashboard

HỌC TẬP & HỖ TRỢ
- Mentor
- Match Space

VẬN HÀNH
- Calendar
- Applications
- Appointments
- Rooms
- School Events
- Clubs

CỘNG ĐỒNG
- Discussion Hub

CÔNG CỤ
- Notifications
- Search

TÀI KHOẢN
- Profile
- Security
```

Admin adds:

```text
QUẢN TRỊ
- Members
- Timetable
- Rooms & Features
- Approvals
- Forum Moderation
- Audit
- System Settings (ADMIN_IT only)
```

Navigation must be permission-aware.

---

# 22. Dashboard experiences

## 22.1 Student dashboard

Show:

- today’s timetable,
- next appointment,
- next mentor session,
- room request status,
- club activity,
- upcoming school events,
- recent notifications.

Primary actions:

- Find mentor,
- Open Match Space,
- Request teacher appointment,
- Request room,
- View calendar.

## 22.2 Teacher dashboard

Show:

- today’s teaching timetable,
- pending appointment requests,
- current applications,
- upcoming meetings,
- school events.

## 22.3 SCHOOL_ADMIN dashboard

Show:

- pending approvals,
- competing room requests,
- club proposals,
- upcoming high-priority events,
- moderation queue,
- recent audit highlights.

## 22.4 ADMIN_IT dashboard

Show:

- account provisioning,
- import users,
- password resets,
- role assignments,
- system health,
- audit/security summary.

Do not expose business/private content unless needed.

---

# 23. Data seeding

Seed one realistic school.

Example tenant:

```text
ED4U Demo High School
```

Seed:

- 10+ classes,
- 20+ teachers,
- 100+ students,
- 30+ graduated users,
- 20+ verified mentors,
- 20+ rooms,
- 8+ room types/features,
- full weekday timetable,
- 3 clubs,
- sample club finance,
- sample events,
- sample forum threads,
- sample applications,
- sample appointments.

Use deterministic seed values.

Create demo credentials for:

- ADMIN_IT
- SCHOOL_ADMIN
- TEACHER
- STUDENT
- GRADUATED student
- MENTOR
- CLUB President/Core

All seeded standard users should still follow first-login password behavior unless a dedicated local demo bypass is clearly marked development-only.

---

# 24. Benchmark strategy

Benchmarks are built **alongside** engines, not after everything is done.

## 24.1 Dataset split

For each intelligence engine:

```text
70% development
30% held-out final test
```

Do not tune on the held-out test set.

## 24.2 Mentor Engine benchmark

Engineering metrics:

- hard constraint violation rate,
- valid result rate,
- determinism,
- crashes,
- duplicate recommendations,
- invalid scores,
- latency p50/p95/max.

Human ranking benchmark:

- 30–60 scenarios,
- 2–3 independent reviewers if possible,
- NDCG@3,
- Precision@3,
- Top-3 agreement,
- inter-reviewer agreement.

Do not claim human quality metrics before labels exist.

## 24.3 Facility Engine benchmark

Create controlled school state:

- real-like timetable,
- room capacities/features,
- confirmed bookings,
- blocks,
- pending holds.

Scenarios:

```text
100–300 requests
```

Baselines:

1. first feasible room,
2. deterministic filter + smallest adequate capacity.

Metrics:

- hard-constraint violation rate,
- feasible solution rate,
- soft-preference objective score,
- latency,
- top-3 diversity,
- no-solution correctness.

Target:

```text
hard-constraint violation rate = 0
```

## 24.4 Benchmark reports

Generate machine-readable JSON and human-readable Markdown.

Store:

```text
benchmark/reports/latest.json
benchmark/reports/latest.md
```

Include:

- git commit,
- engine version,
- config version,
- dataset hashes,
- machine/runtime metadata.

---

# 25. Security requirements

## 25.1 Authentication

- Argon2id password hashes.
- HttpOnly secure session cookie.
- SameSite=Lax or stricter where compatible.
- Session rotation/revocation.
- Rate-limit login.
- Generic login failure message.
- Force temporary password change.

## 25.2 Authorization

Every server mutation re-checks:

- authenticated user,
- tenant membership,
- membership status,
- system roles,
- resource ownership/relation.

Never trust client-provided tenant ID.

## 25.3 Tenant isolation

Even with one tenant in V1:

- every tenant-owned table includes tenant/school key,
- every tenant-owned query scopes by tenant,
- tests include cross-tenant fixtures to prove denial.

## 25.4 AI data minimization

Do not send unnecessary identity fields to external LLMs.

For matching/planning, prefer:

```text
skills
availability
budget
capacity
room features
time windows
```

rather than:

```text
full name
student ID
DOB
private messages
private documents
```

## 25.5 File security

- validate MIME,
- private storage,
- authorize every download,
- no public permanent URLs,
- sanitize filenames,
- protect path traversal.

---

# 26. Coding standards

## 26.1 TypeScript

- `strict: true`.
- No `any` unless justified in a comment.
- Prefer discriminated unions for state machines.
- Use Zod at trust boundaries.
- No non-null assertion unless invariant is proven.
- Domain code must not depend on React.

## 26.2 Server architecture

Use vertical feature modules.

Example:

```text
src/features/facility/
├── domain/
├── service/
├── repo/
├── actions/
├── components/
└── tests/
```

Avoid huge `utils.ts`.

Avoid route handlers containing business logic.

## 26.3 Transactions

Every multi-write state transition that must be atomic uses a DB transaction.

Examples:

- approve room booking,
- approve room-backed event,
- role succession,
- finance void+correction,
- accept mentor booking,
- accept teacher appointment + calendar + chat creation.

## 26.4 State machines

Model states explicitly.

Do not allow arbitrary string mutation.

Create transition functions such as:

```ts
canTransition(from, to, actorContext)
```

Test every legal and illegal transition.

## 26.5 Error handling

Create typed domain errors:

```text
ForbiddenError
NotFoundError
ConflictError
ValidationError
StateTransitionError
```

UI maps errors to useful Vietnamese messages.

Never show raw stack traces to users.

## 26.6 Logging

Structured logs only.

Include:

- request ID,
- user ID where safe,
- tenant ID,
- action,
- error class.

Never log plaintext passwords or secrets.

---

# 27. Test strategy

## 27.1 Unit tests

Required for:

- permission logic,
- state machines,
- timetable collision,
- room collision,
- soft-hold behavior,
- event visibility,
- finance ledger invariants,
- teacher transfer,
- club role hierarchy,
- mentor adapters,
- intelligence helpers.

## 27.2 Integration tests

Use real test database for:

- account provisioning,
- first-login password change,
- cross-tenant denial,
- room approval transaction,
- concurrent room approval,
- club creation approval,
- event+room atomic approval,
- finance correction,
- appointment accept → calendar+chat,
- mentor recommendation persistence,
- mentor booking re-check.

## 27.3 E2E tests

Playwright golden paths:

### Student
- login with temporary password,
- change password,
- view timetable,
- use Mentor matching,
- open Match Space,
- request teacher appointment,
- upload application PDF,
- request room using smart planner,
- join club,
- open forum.

### Teacher
- accept appointment,
- see calendar update,
- chat appears,
- review application,
- transfer case.

### SCHOOL_ADMIN
- approve room request,
- approve club,
- approve event,
- resolve competing requests,
- moderate forum.

### ADMIN_IT
- import users,
- export initial credentials,
- reset password,
- assign role.

## 27.4 Concurrency tests

Mandatory for room booking.

Simulate two admins approving conflicting requests concurrently.

Expected:

- exactly one confirmed booking,
- the other returns Conflict,
- no duplicate occupancy.

---

# 28. Accessibility checks

Minimum:

- keyboard navigation,
- visible focus,
- semantic headings,
- form labels,
- dialog focus trapping,
- sufficient contrast,
- reduced-motion support,
- Match Space list/table alternative,
- screen-reader labels for icons.

Use automated axe checks in Playwright plus manual keyboard test.

---

# 29. Performance targets

Local demo targets:

- dashboard first meaningful render feels immediate on seeded data,
- p95 ordinary server action < 500ms locally where no external AI call,
- Match Space remains smooth with ~100 visible mentor nodes,
- calendar navigation no visible blocking,
- facility solver returns typical Top-3 within interactive latency.

External LLM calls must have:

- timeout,
- retry policy,
- deterministic fallback,
- loading state.

Manual workflows must still function if LLM provider is down.

---

# 30. Implementation phases

## Phase 0 — Baseline and repo creation

- create `~/ED4U`,
- initialize git,
- create workspace,
- record source commits,
- import Mentor Engine,
- rename to ED4U,
- establish lint/typecheck/test/build scripts,
- create `.env.example`.

**DoD**

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

all pass.

## Phase 1 — UI system + app shell

Build:

- ED4U brand,
- typography,
- color tokens,
- Button/Input/Card/Dialog/Table/Tabs/Badge/Toast,
- responsive shell,
- sidebar/topbar,
- loading/empty/error components.

Use old web only as component reference.

**DoD**

- no EduSync branding,
- responsive,
- keyboard navigable,
- browser console clean.

## Phase 2 — Identity & access

Implement:

- users,
- memberships,
- role assignments,
- ADMIN_IT provisioning,
- Excel import,
- temporary passwords,
- forced password change,
- session management,
- permission guards.

**DoD**

- user can be created/imported,
- initial creds exported once,
- login works with member code,
- first login forces password change,
- Teacher+Admin allowed,
- Teacher+Mentor rejected,
- graduated restrictions enforced.

## Phase 3 — Academic Core + timetable

Implement:

- school year,
- semester,
- classes,
- subjects,
- periods,
- rooms base,
- timetable CRUD/import,
- conflict validation.

**DoD**

- invalid Excel rejected transactionally,
- student/teacher timetables render,
- room occupancy derived correctly.

## Phase 4 — Calendar Core

Implement:

- Day/Week/Month,
- unified projections,
- My Calendar,
- School Events,
- Room Schedule,
- visibility.

**DoD**

- no duplicated timetable events in DB,
- views render correct role scope,
- no unauthorized event leakage.

## Phase 5 — Applications + Teacher Appointments

Implement:

- versioned application PDFs,
- statuses,
- teacher transfer,
- teacher routing,
- appointment requests,
- reschedule,
- accept/reject,
- contextual chat.

**DoD**

- acceptance atomically creates calendar+chat,
- transfer requires receiver approval,
- old submission versions remain auditable.

## Phase 6 — Mentor integration

Implement:

- mentor profiles,
- alumni eligibility,
- verification,
- adapter to Mentor Engine,
- match request UI,
- Top-K results,
- recommendation persistence,
- booking transaction.

**DoD**

- production DB remains outside engine,
- tenant scope enforced,
- engine output validated,
- booking re-checks live state.

## Phase 7 — Mentor Match Space

Implement:

- radial deterministic map,
- zoom/pan,
- filters,
- side panel,
- score breakdown,
- constraint lens,
- accessible list fallback,
- smooth transitions.

**DoD**

- distance truthfully maps to match score,
- no embedding claim unless actually used,
- node click explains real engine features,
- 60fps-ish interaction on normal dev hardware for seeded data,
- reduced motion supported.

## Phase 8 — Facility Core + approvals

Implement:

- room types,
- features,
- blocks,
- operational hours,
- room requests,
- soft holds,
- approvals,
- concurrency-safe booking,
- room availability UI.

**DoD**

- timetable blocks recommendation,
- confirmed bookings block recommendation,
- soft holds penalize but do not hard-lock,
- cancellation frees room immediately.

## Phase 9 — Facility Intelligence Engine

Implement:

- canonical schemas,
- optional natural-language parser,
- hard filter,
- scoring/optimizer,
- Top-3,
- explanation,
- alternative suggestions.

**DoD**

- zero hard-constraint violations on benchmark,
- deterministic canonical engine,
- no direct DB access,
- manual fallback always works.

## Phase 10 — Clubs

Implement:

- proposal PDF,
- lifecycle,
- membership,
- role hierarchy,
- advisors,
- docs,
- finance,
- events,
- Facility Engine integration.

**DoD**

- club role permissions enforced,
- ledger immutable after approval,
- event+room approval atomic,
- archived club read-only.

## Phase 11 — Discussion Hub

Implement minimal forum:

- categories/forums,
- threads/posts,
- questions/answers,
- reactions,
- attachments,
- reports,
- moderation,
- search.

**DoD**

- real identity,
- graduated users read-only,
- moderation audited,
- soft-delete,
- no public private-message system.

## Phase 12 — Benchmarks

Finalize:

- mentor engineering benchmark,
- mentor human-label template,
- facility benchmark,
- baseline comparisons,
- Markdown reports.

**DoD**

- reproducible from one command,
- dataset hashes/version metadata included,
- no fake human-quality metrics.

## Phase 13 — Hardening and demo polish

Run:

- lint,
- typecheck,
- unit,
- integration,
- build,
- E2E,
- axe,
- browser visual QA,
- mobile QA,
- concurrency tests,
- seeded demo walkthrough.

Fix every Critical/High issue.

---

# 31. Quality-gate command

Create one command:

```bash
npm run verify
```

It must run, in order:

```text
1. format check
2. lint
3. typecheck
4. prisma validate
5. unit tests
6. integration tests
7. mentor benchmark smoke check
8. facility benchmark smoke check
9. production build
10. Playwright E2E
11. accessibility smoke tests
```

`verify` must exit non-zero on any failure.

---

# 32. CI

Even for hackathon, add GitHub Actions.

On PR/push:

- install with lockfile,
- lint,
- typecheck,
- unit tests,
- DB-backed integration tests,
- build.

Full browser E2E may run on main or explicitly if runtime is heavy.

No merge to main with failing checks.

---

# 33. Demo walkthrough

Build the product around a judge-friendly 4–6 minute story.

## Scene 1 — Student

Student logs in and sees:

- timetable,
- upcoming school events,
- mentor CTA.

Student enters:

> “IELTS 6.0, muốn lên 7.0, yếu Writing, rảnh tối thứ 3/5, ngân sách 200k.”

ED4U shows Top mentors.

Open **Match Space**.

Nodes animate around the student.

Click top mentor.

Show:

- 91 match score,
- feature comparison,
- deterministic reasons,
- trade-off.

## Scene 2 — Operations intelligence

Student/Club Core says:

> “Workshop AI, 80 người, chiều thứ Sáu, cần máy chiếu, ưu tiên phòng máy.”

Facility Engine returns Top 3.

Show:

- timetable collisions were excluded,
- pending requests affect risk,
- room capacity efficiency.

Student selects plan and submits.

## Scene 3 — Admin

SCHOOL_ADMIN receives request.

Shows:

- why ED4U recommended the room,
- hard constraints passed,
- competing request warning.

Admin approves.

Calendar updates.

Room Schedule updates.

Event appears according to visibility.

## Scene 4 — Human governance

Show that intelligence does not bypass humans:

```text
AI proposes
→ rules validate
→ human approves
→ system commits
```

This is a core judging message.

---

# 34. Final release Definition of Done

ED4U V1 is complete only when all are true.

## Product

- [ ] ED4U branding everywhere.
- [ ] Fresh repo is self-contained.
- [ ] Local setup documented.
- [ ] Deterministic seed works.
- [ ] All primary user roles have usable dashboards.
- [ ] No dead navigation links.
- [ ] No placeholder “coming soon” in required flows.

## Identity

- [ ] Username is immutable `school_member_code`.
- [ ] Internal UUID is used for references.
- [ ] Temporary password flow works.
- [ ] ADMIN_IT import works.
- [ ] Multi-role model works.
- [ ] prohibited role combinations rejected.
- [ ] graduated-state restrictions work.

## Academic/Calendar

- [ ] timetable import validates conflicts.
- [ ] day/week/month calendar works.
- [ ] room occupancy combines timetable + bookings + blocks.
- [ ] event visibility enforced.

## Teacher workflows

- [ ] versioned application PDF flow works.
- [ ] transfer requires receiver accept.
- [ ] appointment accept creates calendar + chat atomically.
- [ ] reject/reschedule paths work.

## Mentor

- [ ] imported engine tests pass.
- [ ] engine package branded ED4U.
- [ ] adapter is tenant-safe.
- [ ] Match Space works.
- [ ] booking re-checks live state.
- [ ] benchmark report generated.

## Facility

- [ ] manual booking works.
- [ ] smart planner works.
- [ ] Top 3 explainable options.
- [ ] zero hard-constraint violations in benchmark.
- [ ] pending soft hold behavior correct.
- [ ] approval is concurrency safe.
- [ ] cancellation frees room.

## Clubs

- [ ] proposal approval works.
- [ ] hierarchy enforced.
- [ ] docs permissions work.
- [ ] finance is bookkeeping only.
- [ ] approved ledger rows immutable.
- [ ] event+room approval works.

## Discussion

- [ ] forum hierarchy works.
- [ ] moderation works.
- [ ] graduated users are read-only.
- [ ] soft delete and audit work.

## UI/UX

- [ ] desktop tested.
- [ ] tablet tested.
- [ ] mobile tested.
- [ ] empty/loading/error states exist.
- [ ] no console errors.
- [ ] reduced-motion supported.
- [ ] Match Space has accessible fallback.
- [ ] no obvious “AI-generated template” aesthetic.

## Engineering

- [ ] `npm run verify` passes.
- [ ] production build passes.
- [ ] no Critical/High known bugs.
- [ ] no secrets committed.
- [ ] no raw passwords stored.
- [ ] audit coverage for privileged actions.
- [ ] cross-tenant tests pass.
- [ ] concurrency tests pass.
- [ ] README setup works from clean checkout.

---

# 35. Required documentation

Before calling V1 complete, create:

```text
README.md
docs/architecture.md
docs/data-model.md
docs/permissions.md
docs/benchmark.md
docs/demo-script.md
docs/runbook.md
docs/provenance.md
docs/adr/
```

Important ADRs:

```text
ADR-001 UUID identity + school_member_code username
ADR-002 Separate membership from system roles
ADR-003 Keep tenant_id in single-school V1
ADR-004 Mentor Engine isolated from application DB
ADR-005 Calendar as projection, not timetable duplication
ADR-006 Soft-hold room requests
ADR-007 Facility engine hard-vs-soft constraints
ADR-008 Approval Core instead of generic workflow builder
ADR-009 Club finance as immutable bookkeeping ledger
ADR-010 Match Space distance semantics
```

---

# 36. Agent operating protocol

The coding agent should work in small verified phases.

For every phase:

1. Read this plan.
2. Read relevant existing source files.
3. Read relevant `skills/*.md`.
4. Consult Context7/current docs for APIs.
5. Write/update an implementation checklist.
6. Implement one cohesive slice.
7. Run unit tests.
8. Run typecheck.
9. Run lint.
10. Run integration tests if DB touched.
11. Open affected pages in browser.
12. Inspect console/network.
13. Test loading/empty/error states.
14. Test responsive UI.
15. Commit with a clear message.
16. Only then continue.

Do not batch ten features and test at the end.

---

# 37. Commit strategy

Recommended commits:

```text
chore: bootstrap ED4U monorepo
refactor: import and rebrand mentor engine
feat: add identity and role foundations
feat: add academic core and timetable
feat: add unified calendar
feat: add student applications and teacher appointments
feat: integrate mentor intelligence engine
feat: add mentor match space
feat: add facility booking core
feat: add facility planning intelligence engine
feat: add club domain
feat: add discussion hub
test: add intelligence benchmarks
chore: harden release quality gates
feat: polish hackathon demo experience
```

Each commit should leave the repo in a testable state.

---

# 38. Explicit anti-goals for V1

Do not spend hackathon time on:

- parent accounts,
- cross-school mentor matching,
- actual payment processing,
- wallet/escrow,
- blockchain,
- student-to-student private messaging,
- video hosting,
- full Google Drive clone,
- no-code workflow builder,
- Week A/B timetable,
- teacher substitute scheduling,
- full ERP replacement,
- generic chatbot,
- AI in every feature,
- training a custom foundation model,
- arbitrary deep multi-agent orchestration.

These can be future roadmap items.

---

# 39. Success criterion

ED4U should no longer feel like:

> “a school dashboard with many modules and one AI feature.”

It should feel like:

> **a coherent school operating platform whose intelligence layer helps people make difficult decisions safely, explainably, and measurably.**

The judge should be able to see this directly in the product:

```text
Mentor need
→ intelligence
→ explainable match
→ Match Space
→ human choice

Facility need
→ intelligence
→ hard-constraint safety
→ optimized Top 3
→ human approval
→ real calendar/room mutation
```

That is the V1 technology story.

---

# 40. Final instruction to the coding agent

Do not optimize for the number of features implemented.

Optimize for:

1. correctness,
2. end-to-end completeness,
3. demonstrable intelligence,
4. visual polish,
5. safe state transitions,
6. reproducible benchmarks,
7. reliable localhost demo.

A smaller flow that works flawlessly is more valuable than a larger surface full of unfinished pages.

**ED4U must be demo-ready, judge-ready, and technically defensible.**
