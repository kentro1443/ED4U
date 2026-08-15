# @ed4u/mentor-engine

Deterministic, explainable mentor–student matching engine for ED4U.

> **Status: V1 complete (Phases 1–9)** — canonical domain model, validation,
> ontology, deterministic normalization, reproducible mock data, hard constraint
> filtering, feature engineering with the baseline ranker, explainable Top-K
> recommendations, the evaluation harness, the optional semantic parser, and the
> packaged integration boundary.
>
> **Not yet integrated into the ED4U server** — that waits on reviewer
> verification. See [INTEGRATION.md](INTEGRATION.md) for the frozen contract.

The engine is a pure package: no network calls, no database access, no
filesystem writes during matching, no web-framework imports. Its only runtime
dependency is [`zod`](https://zod.dev).

## Install & scripts

```bash
npm install
npm test        # vitest
npm run typecheck
npm run lint
npm run build   # emits dist/
npm run benchmark
npm run verify:external  # strict external NodeNext TS typecheck + runtime consumer
```

## Quick start

```ts
import { matchMentors, validateMentors, validateStudentRequest } from "@ed4u/mentor-engine";

const mentors = validateMentors(rowsFromYourDatabase.map(toCanonicalMentor));
const request = validateStudentRequest(formPayload);
if (!mentors.ok || !request.ok) throw new Error("invalid input");

const response = matchMentors({ request: request.value, mentors: mentors.value, topK: 5 });
```

`matchMentors` is the single high-level entry point: canonical request +
canonical mentors → hard filtering → ranking → explanation → one serializable
`MatchResponse`. It performs no network, database or filesystem access, needs no
LLM, and returns the same decision output for the same inputs/config. The only
intentionally nondeterministic field is observational timing (`diagnostics.latencyMs`).

When nobody qualifies it says so — `recommendations: []` and
`diagnostics.noFeasibleMatch: true` — rather than relaxing a constraint the
student set. Full contract in **[INTEGRATION.md](INTEGRATION.md)**.

## What Phase 1 provides

The stable data contract every later phase builds on.

| Export | Purpose |
| --- | --- |
| `MentorSchema` / `Mentor` | Canonical mentor record |
| `StudentRequestSchema` / `StudentRequest` | Canonical student request |
| `MatchResponse` and friends | Response contract (types only; producers land in Phases 2–6) |
| `validateMentor` / `validateMentors` / `validateStudentRequest` | Non-throwing validators |
| `SCHEMA_VERSION` / `ENGINE_VERSION` / `PACKAGE_VERSION` | Schema, semantic engine, and exact artifact versions |
| `SCHEMA_BOUNDS`, `DOMAINS`, `SKILLS`, … | Bounds and closed vocabularies |

```ts
import { validateMentor, validateStudentRequest } from "@ed4u/mentor-engine";

const result = validateMentor(rowFromDatabase);
if (!result.ok) {
  console.error(result.issues); // [{ path, code, message }, …]
} else {
  result.value; // Mentor
}
```

## What Phase 2 provides

Deterministic normalization: raw, human-written criteria in, canonical values
out — plus an honest account of everything the engine *cannot* execute.

```text
OPEN-WORLD INPUT  →  CLOSED-WORLD EXECUTION
```

```ts
import { resolveStudentRequest } from "@ed4u/mentor-engine";

const { resolution, request } = resolveStudentRequest({
  requestId: "R001",
  goal: { domain: "ielts", focusSkills: ["Writing"] },
  additionalPreferences: ["mentor nói chuyện chill"],
});

resolution.coverage; // 0.6667
resolution.resolved; // [{ kind: "DOMAIN", raw: "ielts", canonical: "IELTS", status: "RESOLVED" }, …]
resolution.unresolved; // [{ raw: "mentor nói chuyện chill", status: "UNSUPPORTED", reason: "NO_CANONICAL_FEATURE" }]
request; // canonical StudentRequest, or null when nothing executable could be built
```

Every criterion the caller supplies lands in exactly one of `resolved` or
`unresolved`; `coverage` is `resolved / (resolved + unresolved)`.

| Status | Meaning |
| --- | --- |
| `RESOLVED` | Mapped onto a canonical value; the engine will act on it. |
| `AMBIGUOUS` | Maps onto several canonical values; `candidates` lists them. |
| `UNSUPPORTED` | Understood, but the ontology has no feature for it. |
| `MISSING_DATA` | Canonical in principle, but the context needed is absent. |
| `REJECTED` | Structurally invalid, or contradicted by another criterion. |

`SEMANTICALLY_RESOLVED` is reserved for the Phase 8 parser; V1 never emits it.

**Versioned config lives in [`config/`](config/), not in code:**
`ontology.v1.json` (the closed vocabulary) and `aliases.v1.json` (exact alias
tables, English and Vietnamese). Lookups fold text first — lowercase, diacritics
stripped, separators collapsed — so `"Kiên Nhẫn"`, `"kien nhan"` and
`"KIEN  NHAN"` hit the same entry. No fuzzy matching, no LLM, no edit distance.

What the normalizer deliberately refuses to guess:

- vague availability (`"tối thứ 3"`, `"evening"`) — inventing an hour would
  fabricate a preference the student never stated;
- prices inside prose (`"khoảng 200k trở lại"`, `"150k-200k"`);
- a domain for a bare skill (`"writing"` stays `AMBIGUOUS` between IELTS and HSK
  until the goal domain is known);
- booleans from strings (`"yes"` never becomes a hard constraint);
- which of two contradictory budgets the student meant — both are reported.

## What Phase 3 provides

Reproducible mock data, committed under [`data/`](data/) and regenerable with:

```bash
npm run generate        # seed 42 -> 500 mentors, 1,000 requests, 100 adversarial cases
npx tsx scripts/generateDataset.ts --seed 7 --mentors 50 --requests 100 --adversarial 20
```

| File | Contents |
| --- | --- |
| `data/mentors.mock.json` | 500 mentors, all schema-valid |
| `data/requests.mock.json` | 1,000 normal requests, all schema-valid |
| `data/adversarial.mock.json` | 100 labelled hostile fixtures |
| `data/manifest.json` | generator/schema/ontology versions, seed, per-file SHA-256, distribution summary |

Regeneration is **byte-identical**: `Math.random()` is never used (seeded
mulberry32 only) and the "current year" is a constant, so a dataset rebuilt next
January still matches the one committed today. The manifest deliberately carries
no timestamp for the same reason. A test compares the committed files against
freshly generated output, so drift fails CI.

Fields are drawn *conditionally*, not independently — independently random data
ranks trivially and hides the bugs that matter:

- IELTS section bands cluster within ±1.0 of the overall, with writing and
  speaking skewing lower (the real pattern);
- SAT sections always sum to the total;
- teaching experience is bounded by age, sessions follow experience, and a
  rating only exists once there are ≥5 sessions behind it;
- price follows credential strength, experience and verification;
- expertise is only ever claimed in domains the mentor holds a credential for.

The set deliberately includes unverified mentors, incomplete profiles, mentors
with no availability, and mentors with no rating — with **missing left missing**
(no invented zeros, and credential keys omitted rather than nulled when unknown).

The 100 adversarial fixtures cover ten labelled situations — no mentor within
budget, no compatible availability, all candidates unverified, unknown skill,
missing credential, empty preference set, impossible hard constraints, rare
domain combination, duplicate mentor IDs, corrupted record — each carrying a
description, the expected engine behavior, and an explicit `expectsSchemaValid`
flag (30 of them are invalid *on purpose*). They are never mixed into the normal
datasets, so validity rates stay meaningful.

## What Phase 4 provides

Eligibility — who *may* be offered, never who is best. The filter contains no
scores, no weights and no sorting.

```ts
import { applyHardConstraints } from "@ed4u/mentor-engine";

const { status, eligible, rejected, diagnostics } = applyHardConstraints(request, mentors);
```

A real funnel over the 500-mentor fixture (IELTS, verified only, ≤200,000 VND,
two slots):

```json
{
  "candidateCount": 500,
  "eligibleCount": 3,
  "filteredOut":          { "DOMAIN": 141, "UNVERIFIED": 74, "PRICE": 267, "AVAILABILITY": 15 },
  "filteredOutByReason":  { "DOMAIN": 141, "UNVERIFIED": 93, "PRICE": 460, "AVAILABILITY": 429 }
}
```

Two count maps, because they answer different questions. `filteredOut` counts
each removed mentor **once**, under their primary reason, so it sums exactly to
`candidateCount - eligibleCount` and reads as a funnel. `filteredOutByReason`
counts every failed constraint, so it answers "how many were too expensive"
regardless of what else was wrong.

Constraints supported in V1: `verifiedOnly`, domain eligibility,
`maxPricePerHour` (inclusive), availability overlap (`requireAllAvailability`
switches between *every* requested slot and *any* one), `minCredentialScore`
(inclusive, on the domain's own scale), `requiredExpertise` (all of them), plus
duplicate-id detection within a candidate set.

### Filter reason vocabulary

Both diagnostic maps are keyed by these reasons, evaluated in this order (which
also fixes the order of reasons recorded for a mentor failing several):

| Reason | Meaning |
| --- | --- |
| `INVALID_RECORD` | Structurally unusable — e.g. a duplicate mentor id within one candidate set |
| `DOMAIN` | Does not teach the requested domain |
| `UNVERIFIED` | Unverified while the request demanded verified mentors |
| `PRICE` | Hourly price above the stated maximum |
| `AVAILABILITY` | No usable overlap with the requested slots |
| `CREDENTIAL_MINIMUM` | Holds a credential in the domain, but below the required minimum |
| `CREDENTIAL_ABSENT` | Explicitly holds no credential in the domain (`null`) |
| `CREDENTIAL_UNKNOWN` | Credential is unknown (key omitted), so the minimum cannot be verified |
| `REQUIRED_EXPERTISE` | Does not teach every explicitly required skill |

The three credential reasons are separate on purpose. Merging them would report
"does not have a 7.0" when the truth is "we were never told what they have" —
a claim about data we do not hold.

Load-bearing guarantees, each with tests behind it:

- **Nothing is relaxed.** When nobody survives, `status` is `NO_FEASIBLE_MATCH`
  — never the "closest" mentors with a caveat.
- **A hard violation is unrecoverable.** Verified at 0% across the full
  benchmark (1,000 requests × 500 mentors) using an *independent*
  re-implementation of the rules, so the filter cannot vouch for itself.
- **Unknown ≠ absent.** A credential minimum removes a mentor whose credential
  is `UNKNOWN` (it cannot be verified) under `CREDENTIAL_UNKNOWN` — distinct
  from `CREDENTIAL_ABSENT` for a mentor who told us they hold nothing, and from
  `CREDENTIAL_MINIMUM` for one who holds too little. Without a stated minimum,
  unknown data removes nobody.
- **No ranking leaks in.** Eligible mentors come back in input order; that
  ordering carries no quality signal.

## What Phase 5 provides

Transparent scoring. Filter first, then rank what survived:

```ts
import { applyHardConstraints, rankMentors } from "@ed4u/mentor-engine";

const { eligible } = applyHardConstraints(request, mentors);
const ranked = rankMentors(request, eligible, { topK: 3 });
```

```json
{
  "mentorId": "M0056",
  "rank": 1,
  "matchScore": 73.89,
  "scoreBreakdown": {
    "subjectExpertise": 0.43, "focusSkillStrength": 1, "availabilityFit": 0.5,
    "budgetFit": 0.3, "experience": 1, "rating": 0.65, "teachingStyleFit": 1
  },
  "weights": {
    "subjectExpertise": 0.21, "focusSkillStrength": 0.38, "availabilityFit": 0.13,
    "budgetFit": 0.09, "experience": 0.09, "rating": 0.04, "teachingStyleFit": 0.06
  },
  "dataCoverage": 1
}
```

Every score is reproducible by hand: `matchScore = 100 × Σ(weight × feature)`.

**`matchScore` is a ranking score.** It is not a probability, not a predicted
outcome, and must never be labelled a "chance of success". Nothing has been
calibrated against real outcomes, because no outcome data exists yet.

### The seven features

All pure, all bounded to `[0, 1]`, all reading **only** the goal domain — a
perfect SAT score cannot raise an IELTS request's score.

| Feature | Base weight | Missing when |
| --- | --- | --- |
| `subjectExpertise` | 0.25 | credential in the domain is ABSENT or UNKNOWN |
| `focusSkillStrength` | 0.30 | no focus skills requested |
| `availabilityFit` | 0.15 | no slots requested |
| `budgetFit` | 0.10 | no budget stated |
| `experience` | 0.10 | neither sessions nor months recorded |
| `rating` | 0.05 | mentor has no rating |
| `teachingStyleFit` | 0.05 | no styles requested, or mentor declares none |

Weights live in [`config/weights.v1.json`](config/weights.v1.json), never
hard-coded. They are **request-aware**: naming a focus skill boosts
`focusSkillStrength` ×1.5, naming teaching styles boosts `teachingStyleFit`
×1.4, and weights are renormalised afterwards, so a boost shifts share rather
than inflating the total.

`experience` saturates — 0 sessions → 0.00, 5 → ~0.4, 20 → ~0.8, 50+ → ~1.0 —
so seniority cannot swamp everything else.

### Missing data is redistributed, never invented

A feature with no evidence returns `null`; its weight is shared among the
features that do have evidence, and the loss is reported as `dataCoverage`.
A mentor with no rating is **not** a mentor with a bad rating, and substituting
`0` (or `0.5`) would fabricate an observation.

The trade-off is deliberate and worth knowing: redistribution means a mentor
with sparse data is scored on what *is* known rather than penalised for the gap,
so a well-evidenced mentor and a sparse one can score alike. `dataCoverage`
is what distinguishes them, it breaks ties in favour of the better-evidenced
mentor, and Phase 6 surfaces it in the explanation.

Inapplicable features (no budget stated) are excluded from `dataCoverage`
entirely — the student left that blank, not the mentor.

### Ties break by an explicit total order

`matchScore` → `dataCoverage` → `subjectExpertise` → `focusSkillStrength` →
`sessionsCompleted` → lower `pricePerHour` → `mentorId`. The last key is unique
within a candidate set, so ordering never depends on input order — verified by
ranking the same candidates forwards and reversed.

### The ranker does no filtering

It ranks exactly what it is handed and removes nobody; hand it an ineligible
mentor and it will score them. Eligibility lives in one place so it can be
audited in one place — asserted by a test that the ranker's output contains no
eligibility vocabulary at all.

## What Phase 6 provides

Top-K recommendations a human can argue with:

```ts
import { applyHardConstraints, topKRecommendations } from "@ed4u/mentor-engine";

const { eligible } = applyHardConstraints(request, mentors);
const recommendations = topKRecommendations(request, eligible, { topK: 3 });
```

```json
{
  "mentorId": "M0075",
  "rank": 1,
  "matchScore": 72.14,
  "dataCoverage": 1,
  "reasons": [
    "IELTS Writing 7.5 matches your focus on IELTS Writing",
    "IELTS 8.0 overall",
    "Available at 1 of your 2 requested times (THU_19_00)",
    "360,000 VND/hour is within your 400,000 VND budget",
    "99 completed sessions over 24 months of teaching"
  ],
  "tradeoffs": [
    "Lower IELTS score than M0307 (7.5 vs 8.0)",
    "No rating on record yet",
    "No teaching styles listed"
  ]
}
```

Every sentence is assembled from a structured fact that was **actually
observed** on the canonical record. No language model, no template that fires on
a guess:

- a mentor with no rating never gets a sentence about their rating — they get
  the tradeoff `"No rating on record yet"` instead;
- a mentor whose Writing band was never published is described as *teaching*
  Writing, never as being good at it;
- every number in a sentence appears in that mentor's record — swept across the
  fixture set, not just spot-checked.

Reasons are ordered by the weight of the feature behind them, so the most
decision-relevant fact leads and the cap (5 reasons, 4 tradeoffs) trims the
least relevant first. Missing-data disclosures are ordered by how much the gap
should weigh on the decision — an unverified mentor is the fact a student most
needs, so it can never be the one that falls off.

**Tradeoffs are scoped to the returned set.** Naming a mentor outside the Top-K
would point the student at someone they were never offered. The consequence is
deliberate: Top-3 and Top-10 give identical ranks, scores and reasons but
different tradeoffs, because the set being compared against genuinely differs.

**`matchScore` is never described as a probability, a confidence or a chance of
success** — a test scans every generated sentence for that vocabulary. Nothing
here has been calibrated against real outcomes, because no outcome data exists.

## What Phase 7 provides

A benchmark that can fail.

```bash
npm run benchmark              # full fixture set, writes data/benchmark/report.json
npx tsx scripts/benchmark.ts --requests 200 --topK 3
npm run goldset:template       # regenerate the empty human gold-set scenarios
```

Measured on 1,000 requests × 500 mentors:

| Engineering metric | Result | Target |
| --- | --- | --- |
| Hard constraint violations | **0 (0.00%)** | 0% |
| Valid result rate | **100.00%** | — |
| Unhandled crashes | **0** | 0 |
| Duplicate recommendations | **0** | 0 |
| Invalid / non-finite scores | **0** | 0 |
| Determinism | **100.00%** | 100% |
| Latency p50 / p95 / max | **0.28 / 0.38 / 1.67 ms** | p95 < 200 ms |

The harness exits non-zero — naming the exact `requestId` and `mentorId` — on any
hard-constraint violation, crash, invalid score, duplicate recommendation, or
determinism failure. Its detectors are themselves unit-tested against
deliberately broken input, because a benchmark whose checks have never been seen
to fire would report a clean run no matter what the engine did.

### Baselines

- **Baseline A** — eligible mentors sorted by their credential in the goal
  domain. The ranking a spreadsheet gives you.
- **Baseline B** — static weights, no request-aware boosts, and missing data
  counted as zero instead of redistributed. Isolates exactly what `rankerV1`
  adds.

Divergence on the fixture set: `rankerV1` picks the same top mentor as Baseline A
**32.9%** of the time (mean top-3 overlap 0.39), and as Baseline B **83.5%**
(overlap 0.84).

**That is a divergence measurement, not a quality claim.** It says the rankers
disagree; it says nothing about which is right.

### Human-quality metrics: NOT_MEASURED

NDCG@3, Precision@3 and pairwise agreement are reported as `null` with
`status: "NOT_MEASURED"`, and will stay that way until real reviewers label the
gold set. They are never estimated, simulated, or derived from the engine's own
output — scoring against invented labels would report the engine agreeing with
itself, dressed up as human agreement.

`npm run goldset:template` produces 60 scenarios × 8 candidates with **every
label array empty**. Candidates are sampled at random from the eligible pool and
listed in id order, deliberately *not* in the engine's ranking order, so
reviewers are not anchored to the thing being evaluated. See
[`data/gold/README.md`](data/gold/README.md) for the format and procedure.

## What Phase 8 provides

Natural language **in front of** the verified engine, never inside it.

```ts
import { deterministicParser, parseStudentRequestSync } from "@ed4u/mentor-engine";

const parsed = parseStudentRequestSync(
  { text: "Em IELTS 6.0, cần lên 7.0. Writing yếu, khoảng 300k/buổi. Muốn người dạy kiên nhẫn.", requestId: "R001" },
  deterministicParser,
);

parsed.request;    // canonical StudentRequest, or null
parsed.resolution; // the same honest report as any other input
parsed.candidate;  // exactly what the parser proposed, before judgement
```

That Vietnamese sentence produces
`{ domain: "IELTS", currentScore: 6, targetScore: 7, focusSkills: ["IELTS.WRITING"] }`,
a 300,000 VND budget and `PATIENT` — then flows straight into the filter and
ranker unchanged.

### The boundary

| A parser may | A parser may not |
| --- | --- |
| Read the student's text | See a single mentor record |
| Propose candidate criteria | Decide which criteria are executed |
| Say "I am unsure" | Choose or rank a mentor |
| Leave things unresolved | Invent an attribute nobody stated |

This is structural, not a rule anyone has to remember. A parser returns a
`RawStudentRequest` — the same untrusted shape a web form produces — and it goes
through the *unchanged* Phase 2 resolver and Phase 1 schemas. There is no second
path. A parser that hallucinates a budget produces a reported criterion, not a
silent constraint; a test drives a deliberately lying parser to prove it.

The engine works with **no parser at all**, and a test greps the filtering,
feature, ranking, explanation and resolver sources to confirm none of them
imports the parsing layer.

### Offline by default

`deterministicParser` is rule-based: no model, no network, no API key. It reuses
the Phase 2 alias tables, so adding an alias improves the parser and the resolver
at once. The whole suite runs against it, so parser behaviour is reproducible on
any machine. An LLM-backed parser drops into the same interface.

Where it cannot be certain, it refuses to guess — "tối thứ 3" stays raw text and
is reported as unresolved rather than becoming 19:00, because inventing an hour
would fabricate a commitment the student never made.

### Failure and PII

A parser that throws, rejects, returns nonsense, or exceeds the configured timeout
yields a normal `UNRESOLVED` result with `parser.status: "FAILED"` — the engine
carries on. Async parser invocations receive a gateway-owned `AbortSignal`; timeout
or caller cancellation aborts that signal so cooperative remote providers can stop
work. Contact details
(emails, phone numbers, URLs, social handles) are redacted before text leaves the
process, and matching never requires identity data in the first place.

Frozen fixtures in [`data/parser/fixtures.json`](data/parser/fixtures.json) cover
Vietnamese, English, mixed, ambiguous wording, vague availability, unknown
preferences, malformed scores, contradictory budgets and goals, unsupported
domains, and prompt-injection-like text. Injected instructions are preserved as
data and change neither eligibility nor ranking — asserted end to end.

## Canonical vocabularies (V1)

- **Domains** — `IELTS`, `SAT`, `HSK`
- **Skills** — `DOMAIN.SKILL`, e.g. `IELTS.WRITING`, `SAT.READING_WRITING`, `HSK.LISTENING`
- **Availability** — weekly recurring slots `WEEKDAY_HH_MM` on the hour or half
  hour, e.g. `TUE_19_00`. Slots are weekly buckets, not calendar dates.
- **Teaching styles** — `PATIENT`, `STRUCTURED`, `EXAM_FOCUSED`, `CONVERSATIONAL`,
  `INTENSIVE`, `FLEXIBLE`, `ANALYTICAL`, `MOTIVATING`
- **Languages** — `VI`, `EN`, `ZH`

## Validation rules

| Field | Rule |
| --- | --- |
| IELTS bands | `0.0–9.0`, step `0.5` |
| IELTS overall | when all four sections are present, must equal their mean rounded to the nearest half band, ties up (7.25 → 7.5, 7.75 → 8.0, 7.125 → 7.0). Overall-only and partial credentials are exempt — an unknown section cannot be checked |
| SAT total | integer `400–1600`; must equal `math + readingWriting` when both are present |
| SAT sections | integer `200–800` |
| HSK level | integer `1–6` |
| rating | `0–5` |
| pricePerHour | non-negative integer (VND) |
| birthYear | `SCHEMA_BOUNDS.birthYear` (`1940–2015`) |
| ids | non-empty, non-blank |
| availability, expertise | canonical values, duplicate-free |
| unknown enum values / unknown object keys | explicit validation failure |

Cross-field rules on the request: `focusSkills` and `hardConstraints.requiredExpertise`
must belong to `goal.domain`, and `currentScore` / `targetScore` /
`minCredentialScore` must be valid on that domain's own scale.

## Design decisions worth knowing

- **Missing means unknown.** Optional mentor fields stay absent when unknown;
  no defaults are invented. Credentials are three-valued and stay that way:
  key omitted = **UNKNOWN**, `null` = **KNOWN ABSENT**, object = **KNOWN
  PRESENT**. Read them with `credentialKnowledge()` — a truthiness check
  collapses "we never asked" into "they don't have it", which is the difference
  between reporting missing data and inventing a fact.
- **Closed vocabularies, open input.** Unknown enum values fail validation.
  Free-text criteria travel in `additionalPreferences`, preserved verbatim for
  Phase 2 to resolve or explicitly report as unresolved.
- **Strict objects.** Unknown keys are rejected so adapter drift surfaces
  immediately rather than being silently dropped.
- **Deterministic reporting.** Validation issues are sorted by path, so the same
  invalid input always produces the same report.
- **Fixed bounds.** `SCHEMA_BOUNDS` uses constants, never `new Date()`, so a
  record validates identically today and next year.

## Verifying it yourself

Everything below runs offline. No API keys, no database, no network.

### 0. Setup (once)

```bash
cd mentor-intelligence-engine
npm install
```

### 1. The full gate — the one command that matters

```bash
npm test && npm run typecheck && npm run lint && npm run build
```

Expected: all tests pass, then three silent successes (silence = pass for tsc and
eslint). Anything else is a real failure. Clean up the build output with
`rm -rf dist` if you like.

Run one suite at a time if you prefer:

```bash
npx vitest run tests/schemas.test.ts        # Phase 1 — schema + validation
npx vitest run tests/normalization.test.ts  # Phase 2 — ontology + resolver
npx vitest run tests/generation.test.ts     # Phase 3 — mock data
npx vitest run tests/hardConstraints.test.ts # Phase 4 — eligibility filter
npx vitest run tests/features.test.ts       # Phase 5 — feature functions
npx vitest run tests/ranking.test.ts        # Phase 5 — ranker properties
npx vitest run tests/explanation.test.ts    # Phase 6 — explanations
npx vitest run tests/evaluation.test.ts     # Phase 7 — metrics, baselines, harness
npx vitest run tests/parsing.test.ts        # Phase 8 — parser boundary
npx vitest run tests/packaging.test.ts      # Phase 9 — public surface & packaging
npx vitest                                  # watch mode
npx vitest run -t "IELTS"                   # only tests matching a name
```

### 2. Check reproducibility for yourself

```bash
shasum -a 256 data/*.json > /tmp/before.txt
npm run generate
shasum -a 256 data/*.json > /tmp/after.txt
diff /tmp/before.txt /tmp/after.txt && echo "identical"
```

`diff` must print nothing. `npm run generate` also prints the distribution
summary and ends with `All normal records passed schema validation.`

Try a different seed and a smaller dataset (this overwrites `data/`, so
regenerate with `npm run generate` afterwards):

```bash
npx tsx scripts/generateDataset.ts --seed 7 --mentors 50 --requests 100 --adversarial 20
npm run generate    # restore the committed seed-42 dataset
```

### 3. Try the validators by hand

Create `try.ts` anywhere in the package and run it with `npx tsx try.ts`:

```ts
import { validateMentor, resolveStudentRequest } from "./src/index.js";

// A mentor whose IELTS overall contradicts its sections -> rejected.
console.log(
  validateMentor({
    id: "M1", name: "Test", birthYear: 2000, verified: true,
    credentials: { ielts: { overall: 8, listening: 7, reading: 7, writing: 7, speaking: 7 } },
    expertise: ["IELTS.WRITING"], availability: ["TUE_19_00"], pricePerHour: 200000,
  }),
);
// -> { ok: false, issues: [{ path: 'credentials.ielts.overall', ... }] }

// Messy human input -> canonical request + an honest report.
console.log(
  JSON.stringify(
    resolveStudentRequest({
      requestId: "R1",
      goal: { domain: "ielts", focusSkills: ["Writing"] },
      hardConstraints: { maxPricePerHour: "200k" },
      availability: ["thứ 3 19:00", "tối thứ 5"],
      softPreferences: { teachingStyles: ["kiên nhẫn"] },
      additionalPreferences: ["mentor nói chuyện chill"],
      budget: 999,
    }),
    null, 2,
  ),
);
```

What to look for in that second output:

- `resolution.coverage` — how much of the request the engine can act on;
- `resolution.resolved` — `ielts → IELTS`, `Writing → IELTS.WRITING`,
  `thứ 3 19:00 → TUE_19_00`, `kiên nhẫn → PATIENT`, `200k → 200000`;
- `resolution.unresolved` — `tối thứ 5` (too vague to pin to an hour),
  `mentor nói chuyện chill` (no canonical feature), and `budget: 999`
  (unknown field, reported rather than dropped);
- `request` — the canonical, schema-valid request the engine would run on.

### 4. Poke at the data

```bash
node -e "const m=require('./data/mentors.mock.json'); console.log(m.length, JSON.stringify(m[0],null,1))"
node -e "const a=require('./data/adversarial.mock.json'); console.log(JSON.stringify(a[0],null,1))"
cat data/manifest.json
```

### 5. Prove a test would actually catch a regression

Tests are only worth what they detect. Break something on purpose:

```bash
# Corrupt one mentor's IELTS overall in the committed data...
node -e "const f='data/mentors.mock.json';const fs=require('fs');const m=JSON.parse(fs.readFileSync(f));
const i=m.findIndex(x=>x.credentials.ielts&&x.credentials.ielts.writing!==undefined);
m[i].credentials.ielts.overall=9;fs.writeFileSync(f,JSON.stringify(m,null,2)+'\n')"

npx vitest run tests/generation.test.ts   # must FAIL (drift + hash + validity)
npm run generate                          # restore
npx vitest run tests/generation.test.ts   # green again
```

### What "passing" does and does not mean

Passing tests here prove the engine is **internally consistent, deterministic
and honest about what it cannot do**. They prove nothing about match *quality* —
there is no ranking yet (Phase 5–6), and no human-labelled gold set (Phase 7).
Any quality claim before those exist would be fabricated.

## Layout

```text
data/                           generated fixtures + manifest (committed, regenerable)
scripts/random.ts               seeded PRNG (mulberry32) and rounding helpers
scripts/generateMentors.ts      correlated mentor generation + distribution summary
scripts/generateRequests.ts     normal requests + labelled adversarial fixtures
scripts/generateDataset.ts      orchestrator: writes data/ and the manifest
config/ontology.v1.json         closed vocabulary (versioned, human-editable)
config/aliases.v1.json          exact alias tables (versioned, human-editable)
config/weights.v1.json          ranking weights and scales (versioned, human-editable)
src/schemas/validation.ts       vocabularies, bounds, scalar schemas, result helpers
src/schemas/mentor.ts           Mentor + credentials + credentialKnowledge
src/schemas/request.ts          StudentRequest + goal / hard constraints / soft preferences
src/schemas/result.ts           MatchResponse contract (types only)
src/schemas/validate.ts         non-throwing validation entry points
src/normalization/statuses.ts   criterion kinds, reason codes, coverage arithmetic
src/normalization/canonicalizer.ts  text folding, alias index, per-value canonicalization
src/normalization/resolver.ts   raw request -> resolution report + canonical request
src/filtering/hardConstraints.ts    eligibility filter + diagnostics (no ranking)
src/features/featureBuilder.ts  pure bounded feature functions
src/ranking/rankerV1.ts         weighting, scoring, deterministic tie-breaks
src/explanation/explainer.ts    factual reasons and tradeoffs from observed data
src/ranking/baseline.ts         Baseline A and B, for comparison
scripts/metrics.ts              pure metric functions (NDCG, precision, tau, percentile)
scripts/benchmark.ts            evaluation harness + versioned JSON report
scripts/generateGoldSetTemplate.ts  empty human gold-set scenarios (never labels)
scripts/goldSet.ts              gold-set validation and scoring
src/parsing/types.ts            SemanticParser interface + PII redaction
src/parsing/deterministicParser.ts  offline rule-based parser (no model needed)
src/parsing/parseRequest.ts     the one door natural language enters through
src/index.ts                    public surface
tests/schemas.test.ts           Phase 1 test suite
tests/normalization.test.ts     Phase 2 test suite
tests/generation.test.ts        Phase 3 test suite
tests/hardConstraints.test.ts   Phase 4 test suite
tests/features.test.ts          Phase 5 feature tests
tests/ranking.test.ts           Phase 5 ranker tests
tests/explanation.test.ts       Phase 6 explanation tests
tests/evaluation.test.ts        Phase 7 harness tests
tests/parsing.test.ts           Phase 8 parser-boundary tests
```
