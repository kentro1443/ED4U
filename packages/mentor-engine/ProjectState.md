# ED4U Mentor Intelligence Engine — Project State

> Handoff document for the Orchestrator. This file describes the current V1 engine as it exists now, the contracts it exposes, the logic it executes, the guarantees it makes, the limitations that still exist, and the exact boundary for integrating it into the ED4U website.

## 0. Snapshot

- Package: `@ed4u/mentor-engine`
- Package/artifact version: `1.0.0`
- Semantic engine version: `mentor-engine-v1.0.0`
- Schema version: `mentor-engine-schema-v1.0.0`
- Ontology version: `ontology.v1`
- Alias-table version: `aliases.v1`
- Default ranking-config version: `weights.v1`
- Runtime: Node.js `>=20`, ESM TypeScript package
- Runtime dependency: `zod` only
- Framework dependencies: none
- Database/network/filesystem access during matching: none
- LLM dependency: none
- Current parser: deterministic/rule-based; LLM parser is optional future infrastructure, not required for deployment
- Current technical release state: V1 engine is release-ready for server-side integration testing
- Human match-quality state: **NOT_MEASURED**; there are no human labels yet, so no NDCG/Precision/agreement quality claim may be made

Latest verified gate after release hardening: `573/573` tests PASS, typecheck PASS, lint PASS, build PASS, benchmark PASS, strict external NodeNext TypeScript consumer PASS, external runtime consumer PASS.
## 1. What this engine is

This is a deterministic, explainable mentor–student matching engine. It is **not** a web app, database service, booking system, LLM agent, recommender API server, or authentication system. It is a reusable decision package that takes a canonical student request plus a candidate mentor set and returns an auditable ranked recommendation response.

Core thesis:

```text
Human request
    ↓
Normalize / resolve meaning
    ↓
Validate against a closed executable schema
    ↓
Hard-constraint eligibility filter
    ↓
Request-aware deterministic ranking
    ↓
Factual explanation + tradeoffs
    ↓
Top-K recommendations
    ↓
Human chooses; server performs booking/workflow
```

The load-bearing rule is:

> **AI may propose. Deterministic code validates. Human authorizes.**
## 2. Non-negotiable invariants

1. **Open-world input, closed-world execution.** A student may say anything; the engine executes only criteria represented by the versioned ontology/schema. Unsupported/ambiguous text is preserved and reported, never silently dropped.
2. **Hard constraints are absolute.** A mentor violating one is removed before ranking and can never return because of a high score.
3. **Unknown data is not negative data.** Missing rating/credential/experience is not treated as `0`; credential state is explicitly `PRESENT | ABSENT | UNKNOWN`.
4. **No invented mentor facts.** Explanations only state facts present in canonical mentor data.
5. **Deterministic decisions.** Same canonical request, mentors, and config yield the same eligibility, order, scores, reasons, and tradeoffs. `diagnostics.latencyMs` is intentionally nondeterministic telemetry.
6. **No LLM selects mentors.** The optional semantic parser may translate natural language into candidate structured criteria only. It cannot see or rank mentors through its public interface.
7. **Human confirmation remains outside the engine.** The engine recommends; the website/server decides whether a user can select/book and must re-check live state before mutating anything.
8. **Core stays framework-independent.** No Prisma, Next.js, Supabase, tenant/session/RBAC, HTTP client, or UI dependency belongs in the core package.

## 3. Repository map

```text
src/engine.ts                    high-level `matchMentors()` orchestration
src/schemas/                     canonical Mentor / StudentRequest / MatchResponse contracts
src/normalization/               deterministic aliases, canonicalization, resolver, coverage
src/filtering/hardConstraints.ts eligibility only
src/features/featureBuilder.ts   bounded feature computation
src/ranking/rankerV1.ts          weighted scoring + total deterministic ordering
src/explanation/explainer.ts     reasons + tradeoffs
src/parsing/                     optional natural-language parser boundary
src/adapters/                    framework-independent adapter interfaces + example
config/                          ontology, aliases, weights; all versioned JSON
scripts/                         generation, benchmark, gold-set, external-consumer checks
data/                            mock mentors/requests, adversarial data, gold template, benchmark report
tests/                           10 test suites, currently 573 tests
INTEGRATION.md                   transport-neutral integration contract
README.md                        developer reference
CHANGELOG.md                     phase/release history
```
## 4. The primary public API

The website should normally call only the package surface exported from `src/index.ts`.

```ts
import {
  matchMentors,
  validateMentors,
  validateStudentRequest,
  resolveStudentRequest,
} from "@ed4u/mentor-engine";
```

Primary orchestration call:

```ts
const response = matchMentors({
  request,      // canonical + already validated StudentRequest
  mentors,      // canonical + already validated Mentor[]
  topK: 5,      // optional, default 5; finite positive integer only
  config,       // optional RankingConfig; defaults to weights.v1
  resolution,   // optional RequestResolution from resolver/parser
});
```

`matchMentors()` intentionally does **not** schema-validate its canonical inputs. Validation is an explicit boundary responsibility. It does validate `topK` and the ranker validates the ranking config. Do not pass raw DB rows or raw form payloads directly into `matchMentors()`.

Internally `matchMentors()` only composes already-tested modules:

```text
applyHardConstraints(request, mentors)
→ rankMentors(request, eligible, { topK, config })
→ explainRecommendations(request, ranked, eligible, { config })
→ MatchResponse
```
## 5. Canonical Mentor contract

A mentor is storage-agnostic. Required fields:

```ts
interface Mentor {
  id: string;
  name: string;
  birthYear: number;
  verified: boolean;
  credentials: Credentials;
  expertise: Skill[];          // non-empty
  availability: AvailabilitySlot[];
  pricePerHour: number;        // integer VND

  gender?: "female" | "male" | "other" | "undisclosed";
  school?: string;
  bio?: string;
  teachingExperienceMonths?: number;
  sessionsCompleted?: number;
  rating?: number;             // 0..5
  teachingStyles?: TeachingStyle[];
  languages?: ("VI" | "EN" | "ZH")[];
  achievements?: string[];
}
```

Supported domains are `IELTS`, `SAT`, and `HSK`. Skills are fully-qualified values such as `IELTS.WRITING`, `SAT.MATH`, and `HSK.READING`.

Availability is a weekly recurring bucket: `WEEKDAY_HH_MM`, e.g. `TUE_19_00`. V1 accepts only `00` or `30` minute granularity. These are **not calendar dates** and carry no timezone. Production adapters must choose the relevant school/user timezone before converting schedule data into these buckets.
### 5.1 Credential model: the most important adapter rule

Credentials are three-valued, and this distinction must survive database mapping and JSON serialization:

```ts
credentials.ielts = { overall: 8, ... }  // PRESENT
credentials.ielts = null                 // ABSENT: explicitly known to hold none
// credentials.ielts key omitted          // UNKNOWN: not recorded / never checked
```

Never collapse `UNKNOWN` into `ABSENT`. If production data cannot prove absence, omit the key.

Credential shapes:

```ts
IELTS: { overall, listening?, reading?, writing?, speaking? }
SAT:   { total, math?, readingWriting? }
HSK:   { level }
```

Validation rules include:

- IELTS: `0.0–9.0`, step `0.5`. If all four sections exist, `overall` must equal their mean rounded to the nearest half-band using the project rule.
- SAT total: integer `400–1600`; sections `200–800`; when both sections exist, `math + readingWriting === total`.
- HSK: integer level `1–6`.
- Unknown object keys are rejected.
- Optional missing fields remain missing; do not manufacture defaults.

Use exported `credentialKnowledge(credentials, domain)` when the website/adapter must distinguish `PRESENT`, `ABSENT`, and `UNKNOWN`.
## 6. Canonical StudentRequest contract

```ts
interface StudentRequest {
  requestId: string;
  goal: {
    domain: "IELTS" | "SAT" | "HSK";
    currentScore?: number;
    targetScore?: number;
    focusSkills: Skill[];
  };
  hardConstraints: {
    verifiedOnly: boolean;
    maxPricePerHour?: number;
    minCredentialScore?: number;
    requiredExpertise: Skill[];
    requireAllAvailability: boolean;
  };
  availability: AvailabilitySlot[];
  softPreferences: {
    teachingStyles: TeachingStyle[];
    languages: ("VI" | "EN" | "ZH")[];
    gender?: "female" | "male" | "other" | "undisclosed";
  };
  additionalPreferences: string[];
}
```

Score fields are validated on the request domain's own scale. Focus skills and required expertise must belong to `goal.domain`. Unknown keys are rejected by the canonical Zod schema.

`additionalPreferences` is intentionally free text. Remaining items there do not execute unless the resolver can deterministically map them to a supported canonical feature (currently an exact teaching-style alias may be promoted). Otherwise they remain visible but non-executable.
## 7. Raw request resolution: open-world input → closed-world execution

Use `resolveStudentRequest(raw)` when input is human-shaped, form-shaped, alias-heavy, or otherwise not guaranteed canonical.

```ts
const resolved = resolveStudentRequest(raw);
// {
//   resolution: RequestResolution,
//   request: StudentRequest | null,
//   issues: ValidationIssue[]
// }
```

The resolver is deterministic and exact-alias based. It resolves the domain first, then domain-dependent scores/skills. It also canonicalizes prices, weekdays/times, teaching styles, languages, gender, and booleans without truthiness coercion.

Important behavior:

- Unknown fields become explicit `UNSUPPORTED / UNKNOWN_FIELD` criteria instead of disappearing.
- Ambiguous skills remain `AMBIGUOUS`; for example bare `writing` without domain context can refer to multiple domains.
- Vague availability such as `tối thứ 3` is not converted to an invented hour.
- Several conflicting budgets are rejected as `CONTRADICTORY_BUDGET` rather than silently taking min/max.
- `targetScore <= currentScore` is rejected as `CONTRADICTORY_SCORE_GOAL`.
- Strings such as `"false"` are not coerced into booleans.
- If the domain cannot be resolved, `request` is `null`; matching must not proceed.
- Every criterion is assigned to `resolved` or `unresolved`, and `coverage` reports the executable share.

Website policy should never hide unresolved criteria. A partially-resolved request may technically produce a canonical request, but the UI should surface what will and will not affect matching before the student confirms.
### 7.1 Resolution statuses

Per criterion, the engine can report:

- `RESOLVED` — exact/alias match, safe to execute.
- `SEMANTICALLY_RESOLVED` — reserved for semantic parser output that is accepted into the same validation path.
- `AMBIGUOUS` — more than one meaning remains possible.
- `UNSUPPORTED` — understood as input but no executable feature/ontology entry exists.
- `MISSING_DATA` — cannot interpret safely without required context.
- `REJECTED` — invalid or contradictory.

Overall request resolution is `RESOLVED`, `PARTIALLY_RESOLVED`, or `UNRESOLVED`.

The website should treat the resolution report as a UX contract, not debug noise. Recommended behavior:

```text
RESOLVED            → safe to show parsed constraints and continue
PARTIALLY_RESOLVED  → show unresolved items; ask clarification when decision-relevant
UNRESOLVED/request=null → do not match; ask for required information
```

Do not silently discard residual free text just because enough structured fields exist to run the engine.

## 8. Optional natural-language parser

Natural language parsing already exists as an **optional preprocessing layer**. It is not required to use or deploy the matching engine.

Current default parser implementation is deterministic and offline. The production website can initially use structured forms and skip this layer entirely.
Parser entry points:

```ts
parseStudentRequestSync(input, parser, options?)
parseStudentRequest(input, parser, options?)
```

Public parser interface:

```ts
interface SemanticParser {
  readonly name: string;
  readonly version: string;
  parse(input: ParserInvocationInput): ParseResult | Promise<ParseResult>;
}

interface ParserInvocationInput {
  text: string;
  requestId: string;
  locale?: string;
  signal?: AbortSignal;
}
```

The parser can only propose a `RawStudentRequest`; it does not receive mentors. The trusted gateway overwrites `requestId`, derives parser identity from the configured parser object, validates parser output, then sends the candidate through the same resolver/schema used by forms.

Async parser calls default to a 5-second timeout. A gateway-owned `AbortSignal` is passed to the parser; caller cancellation and timeout abort that signal. Parser throw/reject/timeout/malformed output becomes a normal `FAILED` parse result instead of taking down matching.

PII redaction is on by default before any parser sees the text: recognized email, phone, URL, and social-handle patterns are replaced. The opt-out exists only for trusted local use.
### 8.1 LLM policy for future deployment

No LLM is needed now. If a future LLM parser is added, keep the following boundary:

```text
natural language
→ deterministic parser first (optional)
→ LLM parser fallback for difficult semantics (optional)
→ RawStudentRequest candidate
→ resolver + schema validation
→ user clarification/confirmation when needed
→ matchMentors()
```

The LLM may extract meaning but must not see the mentor pool, rank mentors, choose Top-K, relax hard constraints, fabricate a time/score/budget, or bypass validation.

Recommended product rule:

> **LLM may extract. LLM may not decide.**

For first website deployment, prefer a structured form. Natural-language input can later be offered as a convenience feature that pre-fills the form and asks the user to confirm parsed criteria.

## 9. Hard-constraint filter

`applyHardConstraints(request, mentors)` decides eligibility only. It does not score or sort. Eligible mentors are returned in input order.

Supported hard constraints are:

1. mentor must teach at least one skill in the requested domain;
2. `verifiedOnly`: if true, mentor must be verified;
3. `maxPricePerHour`: inclusive upper bound;
4. availability: any requested slot by default, or **all** requested slots when `requireAllAvailability=true`;
5. `minCredentialScore`: inclusive minimum on the requested domain's own scale;
6. `requiredExpertise`: mentor must teach every required skill;
7. duplicate candidate IDs are invalid within a candidate set.
Credential minimum behavior is deliberately strict:

```text
PRESENT and score >= minimum → pass
PRESENT and score < minimum  → CREDENTIAL_MINIMUM
ABSENT                       → CREDENTIAL_ABSENT
UNKNOWN                      → CREDENTIAL_UNKNOWN
```

If there is no credential minimum, UNKNOWN/ABSENT alone does not disqualify a mentor.

When nobody survives, the filter returns `NO_FEASIBLE_MATCH`. It never auto-relaxes price, verification, availability, credential, or expertise constraints.

Diagnostics expose two maps:

- `filteredOut`: each rejected mentor counted once under their primary reason; sums to `candidateCount - eligibleCount`.
- `filteredOutByReason`: every failed reason counted, so one mentor can increment several buckets.

Filter reason vocabulary:

`INVALID_RECORD`, `DOMAIN`, `UNVERIFIED`, `PRICE`, `AVAILABILITY`, `CREDENTIAL_MINIMUM`, `CREDENTIAL_ABSENT`, `CREDENTIAL_UNKNOWN`, `REQUIRED_EXPERTISE`.

Use exported `satisfiesHardConstraints(request, mentor)` as an independent audit hook for tests/server diagnostics.

## 10. Feature engineering

Only mentors that already passed the hard filter should be ranked. Feature values are bounded to `[0,1]`; `null` means there is no usable observation, not a bad score.
V1 features and default base weights:

| Feature | Weight | Meaning |
| --- | ---: | --- |
| `subjectExpertise` | 0.25 | strength of headline credential in requested domain |
| `focusSkillStrength` | 0.30 | evidence for specifically requested skills |
| `availabilityFit` | 0.15 | fraction of requested slots covered |
| `budgetFit` | 0.10 | price headroom under stated budget |
| `experience` | 0.10 | saturating combination of sessions and teaching months |
| `rating` | 0.05 | rating normalized over configured usable range |
| `teachingStyleFit` | 0.05 | fraction of requested styles matched |

Request-aware boosts are applied before normalization:

- if focus skills are specified: `focusSkillStrength × 1.5`;
- if teaching styles are specified: `teachingStyleFit × 1.4`.

Relevant configuration values live in `config/weights.v1.json`, not hard-coded in the ranker. A custom config must carry its own non-empty `version`, and that exact version is emitted in `MatchResponse.configVersions.weights`.

Important feature details:

- `subjectExpertise`: normalizes IELTS/SAT/HSK headline credential using configured floor/ceiling; ABSENT/UNKNOWN credential → `null`.
- `focusSkillStrength`: per focus skill, teaching evidence contributes 0.4 and a published IELTS/SAT section score contributes 0.6. If a modeled section score is unpublished, only observed teaching evidence is credited and evidence coverage drops. HSK has no per-skill scores in V1, so teaching evidence is the complete focus-skill signal there.
- `availabilityFit`: `coveredSlots / requestedSlots`.
- `budgetFit`: rewards headroom; a mentor priced exactly at the maximum still scores configured floor `0.2` rather than zero.
- `experience`: saturating curve `1 - exp(-rate × x)` so early experience matters more than very large seniority increments; sessions and months are combined only when known.
- `rating`: normalized between configured `3.0` and `5.0`; missing rating → `null`.
- `teachingStyleFit`: fraction of requested styles declared by mentor; if the mentor has no style data, returns `null`, not `0`.

### 10.1 Missing-data policy

Default policy is `REDISTRIBUTE`.

If an applicable feature has no observed value, its scoring weight is redistributed among features with data. This avoids pretending a missing rating/credential is a zero. Separately, `dataCoverage` reports how much applicable evidence was actually observed.

Consequences for UI/integration:

- a sparse mentor can still receive a strong `matchScore` based on what is known;
- therefore `dataCoverage` must be retained and should be shown or otherwise considered in UX;
- do **not** rename `dataCoverage` to “confidence” unless a future calibrated confidence model actually exists;
- do not infer that a higher `matchScore` means a probability of success.

## 11. Ranking

`rankMentors()` combines feature values with normalized applied weights. Final displayed `matchScore` is rounded to two decimals, while `scoreBreakdown` and `appliedWeights` remain full precision.

Audit formula:

```text
matchScore ≈ 100 × Σ(appliedWeights[f] × scoreBreakdown[f])
```

Tolerance is only final display rounding (`<= 0.005`).
Tie-break order is explicit and total:

```text
matchScore descending
→ dataCoverage descending
→ subjectExpertise descending
→ focusSkillStrength descending
→ sessionsCompleted descending
→ pricePerHour ascending
→ mentorId lexicographically
```

The ranker never filters. If someone calls `rankMentors()` directly with an ineligible mentor, it will rank that mentor. Production code should normally call `matchMentors()` instead of composing the pipeline incorrectly.

### 11.1 Important V1 fields that are NOT decision features yet

The canonical schema intentionally contains more data than V1 currently scores. The Orchestrator must not claim these fields influence matching when they do not.

Currently **not directly used by ranking/filtering**:

- student `goal.currentScore`;
- student `goal.targetScore`;
- student preferred `languages`;
- student preferred `gender`;
- remaining `additionalPreferences` after deterministic resolution;
- mentor `birthYear`;
- mentor `gender`;
- mentor `school`;
- mentor `bio`;
- mentor `languages`;
- mentor `achievements`.

`verified` affects eligibility only when `verifiedOnly=true`; otherwise it does not add to `matchScore`, though verification status can appear in explanations/tradeoffs. `minCredentialScore` and `requiredExpertise` are hard filters, not scoring boosts.

This is a deliberate V1 scope limitation. Do not invent hidden logic in the website to make these fields “count” without changing/versioning the engine and tests.
## 12. Explanation layer

`explainRecommendations()` converts a stored ranking plus canonical mentor records into factual `reasons` and `tradeoffs`. `topKRecommendations()` is a convenience wrapper that ranks eligible mentors and then explains them.

Explanation guarantees:

- no LLM is used;
- every sentence is derived from observed structured data;
- a missing rating never becomes rating praise;
- an unpublished IELTS/SAT section score is never invented;
- missing/unverified facts are disclosed instead of hidden;
- output order is deterministic.

Default caps from `weights.v1.json`:

- maximum reasons: `5`;
- maximum tradeoffs: `4`.

Reasons are ordered by the request-adjusted weight of the feature that produced them. Examples: focus-skill score, headline credential, availability, budget, experience, rating, teaching-style match, verification, expertise fallback.

Tradeoffs are compared only against the **returned Top-K set**, not all eligible mentors. Therefore Top-3 and Top-10 may have identical ranks/scores/reasons for their common mentors but different comparative tradeoffs.

Tradeoff priority:

1. `CRITICAL`: unverified mentor, credential missing/known absent;
2. `COMPARATIVE`: fewer sessions, higher price, weaker credential, worse schedule than a returned peer;
3. `INFORMATIONAL`: missing section score, rating, teaching history, teaching-style data.

Critical disclosures are selected before lower-priority observations when the cap is reached.
## 13. MatchResponse contract

Every `matchMentors()` call returns a JSON-serializable response:

```ts
interface MatchResponse {
  engineVersion: string;
  packageVersion: string;
  schemaVersion: string;
  configVersions: {
    ontology: string;
    aliases: string;
    weights: string;
  };
  requestResolution: RequestResolution;
  recommendations: MentorRecommendation[];
  diagnostics: MatchDiagnostics;
}
```

Recommendation shape:

```ts
interface MentorRecommendation {
  mentorId: string;
  rank: number;
  matchScore: number;           // 0..100 ranking score, NOT probability
  scoreBreakdown: Record<string, number>;
  appliedWeights: Record<string, number>;
  reasons: string[];
  tradeoffs: string[];
  dataCoverage: number;         // 0..1 evidence coverage
}
```
Diagnostics shape:

```ts
interface MatchDiagnostics {
  candidateCount: number;
  eligibleCount: number;
  filteredOut: Partial<Record<FilterReason, number>>;
  filteredOutByReason: Partial<Record<FilterReason, number>>;
  latencyMs: number;
  noFeasibleMatch?: boolean;
  focusSkills?: Skill[];
}
```

If no mentor survives hard constraints:

```json
{
  "recommendations": [],
  "diagnostics": {
    "eligibleCount": 0,
    "noFeasibleMatch": true
  }
}
```

This means genuine infeasibility only. Invalid `topK` is rejected with an exception; it is not converted into `NO_FEASIBLE_MATCH`.

For persistence/audit, keep the canonical request plus the whole response, especially `engineVersion`, `packageVersion`, `schemaVersion`, all three `configVersions`, `scoreBreakdown`, and `appliedWeights`.
## 14. Adapter boundary: how production data enters the engine

Public contracts:

```ts
interface MentorDataAdapter<T> {
  toCanonicalMentor(source: T): Mentor;
}

interface RequestDataAdapter<T> {
  toCanonicalRequest(source: T): StudentRequest;
}
```

The real ED4U adapter belongs in the **ED4U server**, not in this package. It is the only layer that should know both production DB models and engine models.

Reference implementation: `src/adapters/exampleAdapter.ts`.

Key adapter duties:

1. map DB field names into canonical fields;
2. convert host strings into ontology values instead of passing them through blindly;
3. preserve credential `PRESENT / ABSENT / UNKNOWN` semantics;
4. omit optional fields when the database does not actually know the value;
5. convert production availability into canonical weekly slots;
6. remove tenant/auth/analytics/identity fields the engine does not need;
7. return the mapped object and let the engine validators reject bad data rather than silently “fixing” it.

After adapting mentors, always call `validateMentors()`. After adapting a canonical request, call `validateStudentRequest()`. Any validation failure is an integration/data error that should be logged and fixed, not auto-repaired inside matching.
## 15. Recommended website integration pipeline

Run the engine **server-side only**. Do not bundle the mentor pool or matching logic into the browser.

Recommended request flow:

```text
Authenticated student
      ↓
ED4U server checks auth/RBAC/tenant
      ↓
Load only mentors eligible at the product level
(correct tenant/school, role, active status, accepting students, etc.)
      ↓
Server adapter → canonical Mentor[]
      ↓
validateMentors()
      ↓
Form payload / parser output → RawStudentRequest or canonical StudentRequest
      ↓
resolveStudentRequest() and/or validateStudentRequest()
      ↓
If unresolved/invalid: ask user to clarify; do not guess
      ↓
matchMentors({ request, mentors, topK, resolution })
      ↓
Persist match run + version fields
      ↓
Return recommendation cards to UI
      ↓
Student chooses mentor
      ↓
Server re-checks live availability/permissions
      ↓
Booking/workflow transaction
```

The matching package never books, sends messages, mutates the database, or authorizes the user.
### 15.1 ED4U product-level assumptions outside the package

These are integration rules, not engine schema enforcement:

- `MENTOR` represents an alumni mentor; there should not be a separate `ALUMNI` auth role.
- The engine has no `role`, `tenantId`, `schoolId`, `accountStatus`, or `acceptingStudents` field. Therefore the server must scope/filter the candidate pool before adaptation.
- Suggested server-side role vocabulary remains `STUDENT`, `MENTOR`, `TEACHER`, `ADMIN` and optional `SUPER_ADMIN`.
- Alumni/mentor metadata such as former school, graduation year, and alumni-verification status belongs in production mentor-profile/verification tables; expose only canonical fields required by the engine.
- Do not let one tenant's mentors enter another tenant's match candidate set. The adapter example intentionally drops tenant data because tenancy must already have been enforced server-side.

### 15.2 Availability caveat

Engine availability is a **snapshot of weekly recurring slots**, not a reservation system. Even if a mentor matched `TUE_19_00`, the slot may be taken before the student clicks Book.

Therefore booking must perform a fresh production-database availability check inside the booking transaction. Never treat an engine recommendation as a reservation.

### 15.3 Client/UI responsibilities

The UI may display:

- mentor name/profile information loaded from the server by `mentorId`;
- rank and `matchScore`, explicitly labelled as a matching/ranking score;
- reasons;
- tradeoffs;
- `dataCoverage` as evidence/profile coverage;
- unresolved request criteria;
- no-feasible-match diagnostics and possible user-controlled constraint edits.

The UI must not label `matchScore` as probability, success chance, predicted score improvement, or AI confidence.
## 16. Package/deployment mechanics

`package.json` currently declares:

```json
{
  "name": "@ed4u/mentor-engine",
  "version": "1.0.0",
  "type": "module",
  "engines": { "node": ">=20" },
  "private": true
}
```

Important implications:

- The package is usable locally, in a workspace, via a file dependency, or via a packed tarball.
- `private: true` means it is intentionally not publishable to the public npm registry as-is.
- The published/packed runtime surface contains `dist/`, `config/`, and docs; it excludes `src/`, tests, scripts, playground, and mock data.
- Runtime dependency is only `zod`.
- The strict external-consumer test verifies both `.d.ts` compatibility and runtime use from the packed tarball in a NodeNext TypeScript project with `skipLibCheck: false`.

For a first ED4U integration, preferred options are either a monorepo/workspace dependency or installing a locally packed tarball into the server project. Do not copy internal source files into the website repo.

Example local packaging:

```bash
cd ~/AI-Engine/mentor-intelligence-engine
npm run build
npm pack
# install the resulting .tgz from the ED4U server project
```
## 17. API / protocol status

There is **no HTTP service implemented today**. The production V1 integration target is an in-process TypeScript package call on the ED4U server.

The JSON contract is deliberately transport-neutral so a future out-of-process service can preserve the same request/response semantics. Reserved future shape:

```text
POST /v1/match/mentor
Content-Type: application/json

{
  "request": { ...canonical StudentRequest... },
  "mentors": [ ...canonical Mentor objects... ],
  "topK": 5
}

→ 200 { ...MatchResponse... }
```

Do not build this HTTP microservice unless there is a real deployment reason. A local package call is simpler, faster, and avoids sending the candidate mentor dataset across another network boundary.

If the ED4U website uses Next.js, expose the engine only from server code (route handler/server action/service). The browser should send the student's request; the server should load candidate mentors and call the package.

Recommended server service boundary:

```ts
async function findMentorsForStudent(
  authenticatedContext,
  formOrRawRequest,
): Promise<MatchResponse>
```

That service should own auth, tenancy, DB reads, adapter mapping, validation, persistence, and error translation. The package should own only matching decisions.
## 18. Security, privacy, and trust boundaries

The engine intentionally knows less than the website.

Server-side responsibilities that must never be delegated to the engine:

- authenticate the student;
- authorize mentor-search/booking actions;
- enforce tenant/school boundaries;
- enforce account status and mentor opt-in/accepting-students rules;
- protect private contact details and verification evidence;
- rate-limit any public endpoint;
- perform booking transactions and conflict checks;
- control which fields are returned to the browser.

The engine does not need the student's name, email, phone, account id, or social handles to rank mentors. Keep identity outside the canonical request whenever possible.

If a remote LLM parser is added later, the existing gateway redacts recognized PII before parser invocation, validates the parser result, preserves caller-owned `requestId`, applies timeouts/cancellation, and routes the candidate back through deterministic resolution. This is defense-in-depth, not a claim that regex redaction catches every possible identifier.

Prompt-injection-like natural-language text is data, not authority. A parser instruction such as “return mentor M0001 first” must remain unresolved text and must never reach ranking controls.

## 19. What to persist for audit/reproducibility

For every production match run, persist at least:

1. canonical `StudentRequest` actually executed;
2. complete `MatchResponse`;
3. `engineVersion`;
4. `packageVersion`;
5. `schemaVersion`;
6. `configVersions.ontology`;
7. `configVersions.aliases`;
8. `configVersions.weights`;
9. selected mentor id, if the student chooses one;
10. subsequent booking/session/outcome/review ids as separate product events.
Persisting `scoreBreakdown` + `appliedWeights` allows later audit of how each recommendation score was produced. Persisting config/package versions prevents two materially different ranking policies from being mistaken for the same release.

Do not persist `latencyMs` as part of a deterministic decision hash; it is runtime telemetry and changes between calls.

## 20. Evaluation state

Current benchmark command:

```bash
npm run benchmark
```

Latest verified full run after release hardening:

```text
1,000 requests × 500 mentors
hard-constraint violations : 0
valid-result rate          : 100%
unhandled crashes          : 0
duplicate recommendations  : 0
invalid scores             : 0
determinism                : 100%
feasible / infeasible      : 768 / 232
latency p50                : 0.377 ms
latency p95                : 0.658 ms
latency max                : 10.337 ms
```

The p95 target is `<200 ms` on the 500-mentor fixture and is comfortably met in local in-process testing. These timings are not a production SLO; they exclude DB/network/server overhead.

The benchmark also compares against two deliberately simpler baselines. Divergence from a baseline is **not** evidence of higher quality.
### 20.1 Human quality is intentionally unmeasured

A gold-set template exists with 60 scenarios × 8 candidates, but `data/gold/labels/` contains no real reviewer labels. Therefore:

```text
NDCG@3             = null
Precision@3        = null
Pairwise agreement = null
Human-human agreement = null
status             = NOT_MEASURED
```

Do not put any “AI matching accuracy = X%” number on the website, pitch deck, or API docs yet.

When real reviewers are available, the gold-set evaluator ranks exactly the same candidate subset the reviewer judged. Partial labels are handled conservatively: NDCG requires complete scenario labels, Precision@3 requires all engine Top-3 to be judged, and pairwise agreement can use sufficiently comparable partial pairs.

## 21. Test/release gate

Current test inventory: 10 files, `573` tests.

Release verification commands:

```bash
cd ~/AI-Engine/mentor-intelligence-engine
npm test
npm run typecheck
npm run lint
npm run build
npm run benchmark
npm pack --dry-run
npm run verify:external
```

`verify:external` packs the actual package, installs/extracts it into a throwaway project outside the repo, performs a strict NodeNext TypeScript typecheck with `skipLibCheck: false`, compiles it, and runs the consumer under plain Node. This specifically protects the package boundary, not just source-level tests.
## 22. Known limitations / things the Orchestrator must not overclaim

1. **Match quality is not human-validated yet.** Engineering correctness is strong; recommendation relevance versus expert human judgement is still unknown.
2. **Weights are hand-chosen.** They are configurable and auditable, but not learned from outcomes.
3. **No Learning-to-Rank/ML model exists.** That should come only after real interaction/outcome data exists.
4. **The deterministic parser is literal.** It intentionally misses phrasings outside its patterns instead of guessing.
5. **No LLM parser ships.** This is not a blocker for structured-form deployment.
6. **Current/target score do not currently change ranking directly.** They are validated and preserved for product context/future features.
7. **Language and gender preferences are canonical schema fields but do not currently influence V1 filtering/ranking.**
8. **Availability is weekly-bucket matching, not calendar scheduling.** No dates, recurrence exceptions, or timezone conversion live in the engine.
9. **Explanations are English-only strings in V1.** A Vietnamese UI should either translate at presentation time or later move to structured explanation facts; do not let a translation layer change decision logic.
10. **Tradeoffs are one-dimensional comparisons** against the visible Top-K, not multi-objective natural-language synthesis.
11. **No outcome calibration exists.** `matchScore` has no probabilistic interpretation.
12. **The package is private.** Public npm publishing is disabled unless package policy changes.

## 23. Orchestrator: DO / DO NOT

### DO

- Treat `@ed4u/mentor-engine` as a server-side pure decision dependency.
- Build an ED4U-specific adapter outside the engine package.
- Scope mentor queries by tenant, role, activity, and accepting-students status before adaptation.
- Validate adapted mentors and requests before `matchMentors()`.
- Preserve `UNKNOWN` vs `ABSENT` credential semantics.
- Surface unresolved criteria and no-feasible-match reasons to the student.
- Persist exact version/config fields for match runs.
- Re-check live availability and authorization before booking.
- Keep the parser optional.
- Run the complete release gate after any engine/config contract change.
- Version ranking-config changes; do not modify weights silently under the same version string.

### DO NOT

- Do not import Prisma/Next/Supabase into engine core.
- Do not pass raw database rows directly to `matchMentors()`.
- Do not send all mentor records to the browser and run matching client-side.
- Do not let an LLM choose a mentor, modify hard constraints, or bypass resolver/schema validation.
- Do not auto-relax a user's hard constraint when there is no feasible match.
- Do not default unknown rating/experience/credential values to zero.
- Do not infer age/gender/personality and add them to ranking without an explicit reviewed engine change.
- Do not call `matchScore` probability/confidence/success rate.
- Do not claim human match-quality metrics until real independent reviewers label the gold set.
- Do not duplicate hard-filter logic in the website; the website may add product-level eligibility before the engine, but engine hard constraints should remain centralized.

## 24. Suggested production service pseudocode

```ts
import {
  matchMentors,
  validateMentors,
  resolveStudentRequest,
  type MatchResponse,
} from "@ed4u/mentor-engine";
```
```ts
export async function findMentorsForStudent(ctx, raw): Promise<MatchResponse> {
  // 1. Auth/RBAC/tenant checks happen here.
  const rows = await db.mentor.findMany({
    where: {
      tenantId: ctx.tenantId,
      role: "MENTOR",
      accountStatus: "ACTIVE",
      acceptingStudents: true,
    },
    // Include credential/profile/availability data needed by the adapter.
  });

  // 2. Adapt and validate the exact candidate snapshot.
  const canonical = rows.map((row) => eduSyncMentorAdapter.toCanonicalMentor(row));
  const mentorValidation = validateMentors(canonical);
  if (!mentorValidation.ok) throw new EngineDataMappingError(mentorValidation.issues);

  // 3. Resolve human/form-shaped input. If the form already emits canonical
  //    StudentRequest, validateStudentRequest() may be used instead.
  const resolved = resolveStudentRequest({ ...raw, requestId: createMatchRequestId() });
  if (resolved.request === null) throw new ClarificationRequired(resolved.resolution, resolved.issues);

  // 4. Product UX may require confirmation when partially resolved.
  if (needsClarification(resolved.resolution)) {
    throw new ClarificationRequired(resolved.resolution, resolved.issues);
  }

  // 5. Pure engine decision.
  const response = matchMentors({
    request: resolved.request,
    mentors: mentorValidation.value,
    topK: 5,
    resolution: resolved.resolution,
  });
```
```ts
  // 6. Persist the exact executed request + response/version trace.
  await db.matchRun.create({
    data: {
      requestId: resolved.request.requestId,
      studentId: ctx.userId,
      canonicalRequestJson: resolved.request,
      responseJson: response,
      engineVersion: response.engineVersion,
      packageVersion: response.packageVersion,
      schemaVersion: response.schemaVersion,
      ontologyVersion: response.configVersions.ontology,
      aliasesVersion: response.configVersions.aliases,
      weightsVersion: response.configVersions.weights,
    },
  });

  return response;
}
```

The database model names above are illustrative. The architectural boundary is the important part.

## 25. Booking flow after a recommendation

A selected recommendation is not automatically valid forever. Recommended server flow:

```text
student selects mentorId from stored MatchRun
→ verify mentorId was actually in that run's recommendations
→ re-check user permissions / tenant
→ reload mentor active/accepting status
→ re-check live availability against requested real calendar time
→ create booking atomically / handle conflict
→ emit notifications/audit event
```

Never allow a client to submit an arbitrary mentor id and claim it came from the engine without server-side verification.
## 26. Versioning/configuration protocol

Three independent configuration artifacts participate in behavior:

- `config/ontology.v1.json` — executable vocabulary;
- `config/aliases.v1.json` — deterministic raw-text aliases;
- `config/weights.v1.json` — feature scales, weights, boosts, missing-data policy, explanation caps.

Changing one without versioning it breaks reproducibility. Required protocol for any behavior change:

1. edit the relevant config/code intentionally;
2. bump the config/package/semantic version as appropriate;
3. add regression tests proving the intended change;
4. regenerate fixtures only when the generator/data contract intentionally changes;
5. run the entire release gate;
6. persist new version identifiers in future match runs.

Custom ranking configs are supported, but `RankingConfig.version` must be a non-empty string and is echoed back as `configVersions.weights`. Never run a custom weight policy while labeling it `weights.v1`.

Current default score scales:

- credential IELTS: floor `5.5`, ceiling `9`;
- credential SAT: floor `1000`, ceiling `1600`;
- credential HSK: floor `1`, ceiling `6`;
- IELTS section: floor `4.5`, ceiling `9`;
- SAT section: floor `400`, ceiling `800`;
- rating: floor `3`, ceiling `5`.

## 27. Canonical vocabulary summary

Domains: `IELTS`, `SAT`, `HSK`.
Skills:

- IELTS: `IELTS.LISTENING`, `IELTS.READING`, `IELTS.WRITING`, `IELTS.SPEAKING`;
- SAT: `SAT.MATH`, `SAT.READING_WRITING`;
- HSK: `HSK.LISTENING`, `HSK.READING`, `HSK.WRITING`.

Teaching styles:

`PATIENT`, `STRUCTURED`, `EXAM_FOCUSED`, `CONVERSATIONAL`, `INTENSIVE`, `FLEXIBLE`, `ANALYTICAL`, `MOTIVATING`.

Languages: `VI`, `EN`, `ZH`.

Availability weekday codes: `MON`, `TUE`, `WED`, `THU`, `FRI`, `SAT`, `SUN`.

The alias layer supports English/Vietnamese forms and uses deterministic folding: Unicode NFD, diacritic removal, explicit `đ→d`, lowercase, separator collapse, punctuation cleanup. No fuzzy matching/edit distance is used in V1.

## 28. Important lower-level exports

The package intentionally exposes lower-level functions for testing, custom orchestration, and audit, including:

- `validateMentor`, `validateMentors`, `validateStudentRequest`;
- `resolveStudentRequest`;
- canonicalizers and ontology/version constants;
- `applyHardConstraints`, `satisfiesHardConstraints`;
- feature functions and `buildFeatures`;
- `rankMentors`, `validateRankingConfig`;
- `topKRecommendations`, `explainRecommendations`;
- deterministic parser and parser gateway functions;
- adapter interfaces and example adapters.

The website should still prefer `matchMentors()` as the decision entry point so filtering/ranking/explanation cannot accidentally be composed in the wrong order.
## 29. Current working-tree state

At handoff time, the engine lives inside Git root `/Users/huan/AI-Engine` and the release-hardening changes are **not yet committed**. Modified engine files currently include the release-hardening fixes to engine/config traceability, parser cancellation typing, strict external TypeScript verification, docs, tests, and the latest benchmark report.

Notable untracked files:

- `ProjectState.md` — this handoff document;
- `src/version.ts` — exact `PACKAGE_VERSION` constant used by `MatchResponse`;
- `try-natural.ts` — local scratch/demo file, not part of the packed package.

Before handing control to another coding agent or beginning website integration, create a clean checkpoint commit after reviewing the diff. Do not accidentally add scratch/demo files unless intentionally desired.

## 30. Recommended immediate next step

The engine itself does not need more feature work before integration testing. The next engineering task should be an **ED4U server integration adapter/service**, not an LLM parser and not a new ranker.

Suggested integration milestone:

```text
1. Install/link @ed4u/mentor-engine into ED4U server
2. Map production mentor DB rows → canonical Mentor
3. Map mentor-search form payload → RawStudentRequest / StudentRequest
4. Add adapter validation + explicit error handling
5. Add tenant/RBAC/candidate-pool query rules
6. Call matchMentors() server-side
7. Persist a MatchRun snapshot with all versions
8. Return recommendation DTOs to existing website UI
9. Add user selection → live availability re-check → booking workflow
10. Add integration tests using production-like fixtures
```

Do not add an LLM in this milestone. A structured form is enough to exercise the engine safely. Natural-language/LLM parsing is a separate UX enhancement that can be layered on later without changing matching logic.

## 31. Final state statement for the Orchestrator

The current V1 is a **deterministic, explainable, framework-independent matching package** with a stable canonical contract and verified package boundary. Its strongest guarantees are hard-constraint safety, explicit unknown/missing-data treatment, deterministic ranking, score auditability, factual explanations, parser containment, and reproducible version/config traces.

The website integration should preserve those boundaries rather than reimplement them. The ED4U server owns data access, identity, tenancy, permissions, product-level candidate eligibility, persistence, live scheduling, and booking. The engine owns only the transformation:

```text
validated request + validated candidate mentors
→ eligible mentors
→ deterministic ranked Top-K
→ auditable reasons/tradeoffs/diagnostics
```

Human match quality remains an open empirical question until real reviewers label the prepared gold set. Engineering correctness and integration readiness are currently verified; recommendation-quality claims are not.
