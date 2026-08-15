# Changelog

All notable changes to `@ed4u/mentor-engine` are recorded here.

## [1.0.0] — Phase 9: Packaging & ED4U Integration Boundary (V1)

### Added

- `matchMentors()` — the single high-level entry point. Composes the verified
  modules (filter → rank → explain) and returns a complete, serializable
  `MatchResponse` with `engineVersion`, `schemaVersion`, `configVersions`,
  request resolution, recommendations and diagnostics. No network, database or
  filesystem access; explicit `noFeasibleMatch` rather than relaxed constraints.
- `MentorDataAdapter<T>` / `RequestDataAdapter<T>` / `EngineDataAdapter<TM, TR>`
  under `src/adapters/`, plus a worked example against mock database rows that
  preserves PRESENT / ABSENT / UNKNOWN credential semantics and drops tenant,
  identity and analytics fields. No ORM or web framework is imported anywhere.
- `INTEGRATION.md` — the frozen request/response JSON contract, the version
  fields a persisted match run must keep, adapter guidance, and the reserved
  `POST /v1/match/mentor` shape for a possible future out-of-process
  implementation (not implemented in V1).
- `scripts/externalConsumer.ts` (`npm run verify:external`) — packs the tarball,
  installs it into a throwaway project outside this tree, imports **only**
  `@ed4u/mentor-engine`, runs IELTS/SAT/HSK matches, JSON round-trips the
  response, and independently audits every recommendation against the hard
  constraints. Falls back to direct tarball extraction where project-scoped
  installs are blocked; either path uses only published files.
- `tests/packaging.test.ts` (29 tests) — stable exports, version reporting,
  response versioning, determinism, no DB/web imports, no filesystem writes or
  sockets in the core, optional parser, infeasible semantics, adapter behaviour
  and tarball contents.

### Changed

- `MatchResponse` gained `configVersions` (ontology/aliases/weights), because a
  stored score is only reproducible if you know which config produced it.
- `MatchResponse` now also carries `packageVersion`; `PACKAGE_VERSION` is exported
  and tested against `package.json`, so persisted runs identify the exact artifact.
- A caller-supplied ranking config reports its own validated `config.version`
  instead of always claiming the default `weights.v1`.
- `matchMentors()` validates `topK` as a finite positive integer rather than
  inheriting accidental `Array.slice()` behaviour for 0, negatives, fractions,
  `NaN`, or `Infinity`.
- `SemanticParser` now receives a typed `ParserInvocationInput` with optional
  `AbortSignal`; async timeout also aborts a gateway-owned signal for cooperative
  provider cancellation.
- `npm run verify:external` now compiles a strict external NodeNext TypeScript
  consumer with `skipLibCheck: false` before running it, catching broken public
  `.d.ts` files. `RankingConfig` is declared explicitly so emitted declarations
  no longer import the JSON config asset just to define a type.
- Package version is now `1.0.0`; `ENGINE_VERSION` remains
  `mentor-engine-v1.0.0` (semantic contract) and both are asserted.

### Fixed (Phase 8 follow-ups)

- **Residual text could vanish.** The parser treated a whole clause as consumed
  if it contained any recognised token, so "I need IELTS writing with a funny
  mentor" silently dropped "funny mentor", "IELTS 7" dropped the ambiguous bare
  number, and injected instructions sharing a clause with real criteria
  disappeared. Extraction now runs over a **length-preserving fold** and records
  exact consumed spans; everything else is returned as residual and reported as
  unresolved. Coverage now reflects it instead of claiming 100%.
- **Caller-owned identity was forgeable.** A parser could set
  `candidate.requestId` and spoof its own name/version. `ParseResult` no longer
  carries identity at all; the gateway overwrites `requestId` from the input
  (including on the failure path) and reads name/version from the configured
  parser object.
- **Parser output was barely checked.** `ParseResultSchema` now validates
  status, candidate, `unhandled` and `notes` strictly; anything malformed becomes
  a normal `FAILED` result instead of leaking `undefined` downstream.
- **PII redaction was per-parser.** It now happens in the gateway before *any*
  parser sees the text, with an explicit opt-out for trusted local parsers, and
  `parser.piiRedacted` records that it happened without keeping the original.
- **Async parsers could hang forever.** Added a configurable timeout (default
  5s) and `AbortSignal` pass-through; timeout, rejection and provider failure all
  become `FAILED`. `parseStudentRequestSync` now rethrows only its own
  `AsyncParserError` — a parser's own `TypeError` degrades gracefully.
- **Partial labels distorted quality metrics.** NDCG@3 now requires complete
  labels over the evaluation universe (an unlabeled candidate is not relevance
  0), Precision@3 requires the whole top-3 to be judged, and pairwise agreement
  stays measurable from partial labels. Each measurement reports why a metric was
  not measured.

## [1.0.0-phase8] — Phase 8: Semantic Request Parser (Optional AI Layer)

### Added

- `src/parsing/types.ts` — the `SemanticParser` interface, `ParseInput` /
  `ParseResult`, and `redactPii` / `containsPii`. A parser sees text and returns
  a `RawStudentRequest`; it has no access to mentors, scores or ranking.
- `src/parsing/deterministicParser.ts` — offline rule-based parser (no model, no
  network, no API key) reusing the Phase 2 alias tables. The whole suite runs
  against it, so parser behaviour is reproducible everywhere.
- `src/parsing/parseRequest.ts` — `parseStudentRequest` / `parseStudentRequestSync`.
  Parser output goes through the unchanged resolver and schemas; there is no
  second path into the engine. A throwing, rejecting or nonsense-returning parser
  yields a normal `UNRESOLVED` result rather than an exception.
- `data/parser/fixtures.json` — 15 frozen cases: Vietnamese, English, mixed,
  ambiguous, vague availability, unknown preference, malformed score,
  contradictory budget, contradictory goal, unsupported domain, two
  prompt-injection cases, PII, empty and noise input.
- Phase 8 test suite (40 tests), including a deliberately lying parser proving
  invented criteria are validated like any other, and an end-to-end check that
  injected instructions change neither eligibility nor ranking.

### Fixed (Phase 7 follow-ups)

- **Gold-set metrics compared different candidate sets.** Human labels for a
  scenario's 8 sampled candidates were scored against the engine's Top-K over the
  *entire* eligible pool, making NDCG@3, Precision@3 and pairwise agreement
  invalid. `scripts/goldSet.ts` now resolves each scenario's exact
  `candidateMentorIds`, re-checks them against the scenario's own hard
  constraints, ranks that subset independently, and scores only within it.
  Regression tests prove a mentor outside `candidateMentorIds` cannot move any
  number, and that a scenario stays measurable when none of its candidates appear
  in the global Top-5.
- **Human labels were loaded without validation.** `gold-labels.v1` now has a
  runtime schema plus semantic checks: unknown scenario ids, requestId
  mismatches, mentors outside the scenario, duplicate mentor labels, duplicate
  scenarios, blank/missing reviewer ids, non-integer or out-of-range relevance,
  malformed JSON and stale format versions. Every issue names the reviewer,
  scenario and mentor. Malformed files are reported, never silently skipped.
  Partial labelling is permitted and its cost is reported as coverage.
- **A zero-workload benchmark could report PASS.** CLI options are now strictly
  validated (finite positive integers; unknown flags, missing values and bare
  arguments rejected), and `runBenchmark` records an `EMPTY_WORKLOAD` failure for
  an empty run. Zero-denominator rates are `null` — "not measured" — instead of
  `1`, which had let 0 violations out of 0 recommendations read as a 100% rate.
- **Invalid request fixtures were silently skipped.** Every committed normal
  request must now validate; any failure aborts with a non-zero exit naming the
  fixture index and requestId, matching the existing mentor-fixture behaviour.
- **Reports could not be tied to code.** The report now records the package
  version (`@ed4u/mentor-engine@…`) alongside the semantic engine version,
  plus the git commit SHA and working-tree cleanliness when available (`null`
  when not — this repository has no commits yet).
- **No human-vs-human baseline.** `interReviewerAgreement` is computed and
  reported separately whenever two or more reviewers label the same scenario, and
  reported as `NOT_MEASURED` otherwise. Per-reviewer results stay visible instead
  of being flattened into one ambiguous count.

## [1.0.0-phase7] — Phase 7: Evaluation Harness & Verification

### Added

- `src/ranking/baseline.ts` — Baseline A (credential sort) and Baseline B
  (static, non-request-aware weighting that counts missing data as zero).
- `scripts/metrics.ts` — pure metric functions: `percentile`, `ndcgAtK`,
  `precisionAtK`, `pairwiseAgreement`, `kendallTau`, `topKOverlap`,
  `meanOfMeasured`. All return `null` rather than 0 when nothing was measurable.
- `scripts/benchmark.ts` — the harness. `npm run benchmark` writes a versioned
  `data/benchmark/report.json` and exits non-zero, naming request and mentor ids,
  on any hard-constraint violation, crash, invalid score, duplicate
  recommendation or determinism failure. `auditRecommendations()` is exported so
  the detectors themselves are unit-testable.
- `scripts/generateGoldSetTemplate.ts` + `data/gold/` — 60 scenarios × 8
  candidates with every label array empty, plus `data/gold/README.md` documenting
  the scenario and label formats and the reviewing procedure.
- Phase 7 test suite (45 tests): worked examples for every metric, baseline
  behaviour, all eight audit detectors firing on deliberately broken input,
  benchmark reproducibility, and the anti-fabrication guarantees.

### Measured (1,000 requests × 500 mentors)

- Hard constraint violations: **0 (0.00%)**
- Valid result rate: **100.00%** · Unhandled crashes: **0**
- Duplicate recommendations: **0** · Invalid scores: **0**
- Determinism: **100.00%**
- Latency p50 / p95 / max: **0.28 / 0.38 / 1.67 ms** (target: p95 < 200 ms)

### Not measured

NDCG@3, Precision@3 and pairwise agreement are `null` with
`status: "NOT_MEASURED"`. No human labels exist, none were fabricated, and none
will be produced by any script here.

### Fixed (Phase 6 follow-ups)

- **Critical disclosures could be displaced by comparative tradeoffs.** Four
  comparative observations filled the cap and silently dropped "Not yet verified
  by ED4U". Tradeoffs now carry explicit priority tiers — `CRITICAL`
  (unverified, no credential on record), `COMPARATIVE`, `INFORMATIONAL` — and the
  cap is applied after a stable sort by tier, so a safety-relevant disclosure can
  never be pushed out by a routine comparison. Regression test uses an unverified
  mentor who is simultaneously behind on sessions, price, credential and
  schedule, with a companion test proving all four comparatives really do fire.
- **Explanation config was unvalidated.** `validateRankingConfig()` now checks
  `explanation.maxReasons` (integer ≥ 1) and `explanation.maxTradeoffs`
  (integer ≥ 0), rejecting negatives, fractions, NaN, infinities and non-numbers.
  `explainRecommendations()` validates its config itself, because it is a public
  entry point reachable without going through `rankMentors()`.
- **`MentorRecommendation` dropped the weights needed to audit the score.**
  Added `appliedWeights` (full precision), so a stored recommendation can be
  re-derived on its own: `matchScore ≈ 100 × Σ(appliedWeights × scoreBreakdown)`.
  Verified across the fixture set and after a JSON round-trip.

## [1.0.0-phase6] — Phase 6: Explainable Top-K Ranking

### Added

- `src/explanation/explainer.ts` — `topKRecommendations()` (rank + explain) and
  `explainRecommendations()` (explain a stored ranking). Produces
  `MentorRecommendation` objects with factual `reasons` and `tradeoffs`.
- Reason builders for credential, focus-skill band, availability overlap,
  budget, experience, rating, teaching styles and verification, each guarded by
  the presence of the data it describes; plus a guaranteed expertise-based
  fallback so no recommendation is ever returned without a reason.
- Tradeoffs: comparative disadvantages against the other returned candidates
  (sessions, price, credential, schedule fit) and missing-data disclosures,
  ordered so the highest-stakes gap is never the one trimmed by the cap.
- `explanation.maxReasons` / `explanation.maxTradeoffs` in `weights.v1.json`.
- Phase 6 test suite (37 tests), including a fixture-wide sweep asserting no
  sentence claims data the mentor does not have, and a scan for probability /
  confidence vocabulary.

### Notes

- Explanations are generated from structured facts only — no LLM, per PLAN.md.
- VND formatting is hand-rolled rather than `toLocaleString`, which varies with
  host locale and would make explanations differ between machines.
- Tradeoffs are scoped to the **returned** set, so Top-3 and Top-10 share ranks,
  scores and reasons but differ in tradeoffs. Documented and tested.

### Fixed (Phase 5 follow-ups)

- **`focusSkillStrength` treated unknown as perfect.** A mentor teaching a
  requested skill with no published band scored 1.0 — beating a mentor with a
  real, measured band. Now the value distinguishes three cases: *not modelled*
  (HSK has no per-skill scores for anyone → teaching evidence is the whole
  story, full evidence), *modelled but unpublished* (credit only the observed
  `taughtWeight` share, reduced evidence), and *published* (full formula, full
  evidence). Regression tests prove an overall-only mentor cannot outrank a
  measured one at any band from 6.0 to 8.5.
- **Partial evidence was reported as full coverage.** Features now carry a
  fractional `evidence` share, and `dataCoverage` is
  `Σ(weight × evidence) / Σ(applicable weight)` — so a half-known mentor reads
  as half-covered instead of fully covered.
- **`matchScore` was not reproducible from the response.** `scoreBreakdown` and
  `weights` were rounded to 2dp, leaving up to half a point unaccounted for.
  Both are now full precision and only the displayed score is rounded; a test
  recomputes `100 × Σ(weight × feature)` for every ranked mentor and requires
  agreement within 0.005.
- **`validateRankingConfig()` only checked `baseWeights`.** It now validates the
  whole configuration — request-aware multipliers, credential/section scales,
  focus-skill sub-weights, experience weights and rates, rating bounds, budget
  floor — rejecting non-finite, negative, out-of-range and degenerate values
  (a collapsed scale, a zero rate, unknown feature keys). A negative
  `focusSkillBoost` now throws instead of silently producing a zero-weight score.
  17 table-driven rejection tests.
- **The coverage tie-break test did not test the tie-break.** Both mentors were
  identical, so it only exercised the `mentorId` fallback. It now constructs a
  genuine tie — solving for the rating that makes a documented mentor score
  exactly what an undocumented one scores — and verifies the result holds with
  the ids swapped, proving coverage outranks id rather than merely agreeing.

## [1.0.0-phase5] — Phase 5: Feature Engineering & Baseline Ranker

### Added

- `config/weights.v1.json` — versioned ranking configuration: base weights,
  request-aware boosts, credential and section scales, saturation rates, rating
  range, budget floor, and an explicit missing-data policy. No ranking number is
  hard-coded in TypeScript.
- `src/features/featureBuilder.ts` — seven pure feature functions, each bounded
  to `[0, 1]` or returning `null` for "no data": `subjectExpertise`,
  `focusSkillStrength`, `availabilityFit`, `budgetFit`, `experience` (saturating),
  `rating`, `teachingStyleFit`. Plus `featureApplicability()` (what the *request*
  asks for) and `sectionScoreForSkill()`.
- `src/ranking/rankerV1.ts` — `rankMentors()` with request-aware weighting,
  weight redistribution over available features, `dataCoverage`, a documented
  total tie-break order (`TIE_BREAK_ORDER`), and optional `topK`. Also
  `requestAwareWeights()` and `validateRankingConfig()`.
- Phase 5 test suites: `tests/features.test.ts` (35) and `tests/ranking.test.ts`
  (29), including PLAN.md's three property tests — a better relevant score never
  reduces the score, a better irrelevant score never improves it, and identical
  inputs produce identical rankings.

### Notes

- `matchScore` is a ranking score on 0–100, reproducible by hand as
  `100 × Σ(weight × feature)`. It is not a probability and is never labelled one.
- Missing data is redistributed, never substituted. The trade-off — a sparse
  mentor is scored on what is known rather than penalised for the gap — is
  documented, surfaced as `dataCoverage`, and used as the first tie-break.
- The ranker applies no eligibility logic and removes nobody; a test asserts its
  output contains no eligibility vocabulary.

## [1.0.0-phase4] — Phase 4: Hard Constraint Filter

### Added

- `src/filtering/hardConstraints.ts` — pure, framework-independent eligibility
  filter over validated canonical inputs. Supports `verifiedOnly`, domain
  eligibility, `maxPricePerHour` (inclusive), availability overlap with
  `requireAllAvailability` semantics, `minCredentialScore` (inclusive, on the
  domain's own scale), `requiredExpertise` (all of them), and duplicate-id
  detection within a candidate set.
- `applyHardConstraints(request, mentors)` returning `status`
  (`FEASIBLE` / `NO_FEASIBLE_MATCH`), `eligible` in input order, `rejected` with
  every failed constraint, and diagnostics with two count maps: `filteredOut`
  (each mentor once, under their primary reason — sums to
  `candidateCount - eligibleCount`) and `filteredOutByReason` (every failed
  constraint counted).
- `satisfiesHardConstraints(request, mentor)` — an audit hook for benchmarks and
  tests to check a recommendation's legality without consulting the filter's own
  bookkeeping.
- `CONSTRAINT_ORDER` — the fixed evaluation order that makes multi-failure
  output and diagnostics key order deterministic.
- `headlineCredentialScore(credentials, domain)` — IELTS overall / SAT total /
  HSK level, the scale `minCredentialScore` is compared against.
- Phase 4 test suite (48 tests), including the ten Phase 3 adversarial labels
  turned into executable assertions and a 0% hard-constraint violation invariant
  measured across 1,000 requests × 500 mentors with an independent
  re-implementation of the rules.

### Changed

- `FILTER_REASONS` split the single credential reason into three:
  `CREDENTIAL_MINIMUM` (holds a credential, below the bar), `CREDENTIAL_ABSENT`
  (explicit `null`), and `CREDENTIAL_UNKNOWN` (key omitted — the minimum cannot
  be verified). Collapsing them would report "does not have a 7.0" when the truth
  is "we were never told", which is a claim about data we do not hold.

## [1.0.0-phase3.1] — IELTS consistency and test-integrity fixes

### Added

- `ieltsOverallFromSections()` — computes the overall band from the four
  sections using the IELTS rule (mean rounded to the nearest half band, ties up:
  7.25 → 7.5, 7.75 → 8.0, 7.125 → 7.0). Exact integer arithmetic in half-band
  units, so no floating-point drift.

### Fixed

- **IELTS credentials could contradict themselves.** `IeltsCredentialSchema` now
  rejects a declared `overall` that disagrees with its own four sections. 62 of
  the 294 fully-specified IELTS credentials in the seed-42 dataset were
  inconsistent (e.g. M0003 declared 7.0 on sections implying 6.5); the ranker
  would have rewarded bands nobody achieved. Overall-only and partially
  specified credentials remain valid — an unknown section cannot be checked
  against anything, and inventing one would be worse than skipping the check.
- **The generator produced those inconsistencies.** The drawn band is now a
  *target*: sections are drawn around it, then `overall` is derived from them.
  Generator version bumped to `mock-generator-v1.1.0`; dataset regenerated
  (0/294 inconsistent) and manifest hashes updated.
- **The seeded-RNG regression test did not test the RNG.** It built each
  "sequence" by constructing a new `SeededRandom` per element, so it compared 50
  copies of the first value and would have passed with the stepping completely
  broken. It now draws full sequences from single persistent instances, asserts
  the sequence actually advances, asserts two seeds share no values, and checks
  per-instance independence.
- **The manifest integrity test did not check integrity.** It compared byte
  counts only. It now recomputes SHA-256 for every data file and asserts equality
  with `manifest.json`, plus a check that a one-byte change would be detected.

### Changed

- `credential range validation > accepts the IELTS boundary bands 0.0 and 9.0`
  now uses overall-only credentials; overriding `overall` alone on a
  four-section fixture correctly trips the new consistency rule.

## [1.0.0-phase3] — Phase 3: Reproducible Mock Data Generator

### Added

- `scripts/random.ts`: seeded mulberry32 PRNG (`SeededRandom`) with weighted,
  normal, shuffle and sample draws. `Math.random()` is banned in generation.
- `scripts/generateMentors.ts`: correlated mentor generation (credentials →
  expertise → experience → sessions → rating → price) plus `summarizeMentors()`.
  `REFERENCE_YEAR` is a constant so age arithmetic never depends on the clock.
- `scripts/generateRequests.ts`: normal request generation, the labelled
  adversarial fixture set (`ADVERSARIAL_LABELS`, 10 situations), and
  `summarizeRequests()`.
- `scripts/generateDataset.ts`: the only filesystem-touching script; validates
  every normal record before writing, emits `data/*.json` + `data/manifest.json`,
  prints the distribution summary, and exits non-zero if a normal record fails.
- `data/`: 500 mentors, 1,000 requests, 100 adversarial cases, and a manifest
  recording generator/engine/schema/ontology versions, seed derivation, per-file
  SHA-256 and byte counts, and the full distribution summary. No timestamp, by
  design.
- `npm run generate`; Phase 3 test suite (42 tests) including a drift test that
  compares the committed data against freshly generated output.

### Fixed

- `resolveStudentRequest()` reported nothing for unrecognised fields, so a
  criterion sent under an unknown key (`budget`, `goal.deadlineWeeks`,
  `softPreferences.vibe`) vanished silently — the exact failure Phase 2 exists
  to prevent. Unknown fields at the root and inside `goal`, `hardConstraints`
  and `softPreferences` are now `UNSUPPORTED` / `UNKNOWN_FIELD` criteria that
  carry the dropped value and count against coverage. A container that is not an
  object is reported as `REQUEST_STRUCTURE` / `INVALID_TYPE` instead of being
  read as empty.
- A contradictory score goal (`currentScore: 7`, `targetScore: 6.5`) logged the
  target twice — first RESOLVED, then REJECTED — inflating coverage and breaking
  the one-criterion-one-status invariant. Score outcomes are now judged before
  anything is logged, so the target is recorded exactly once as
  `REJECTED` / `CONTRADICTORY_SCORE_GOAL`.

### Changed

- `CRITERION_KINDS` gained `UNKNOWN_FIELD` and `REQUEST_STRUCTURE`;
  `UNRESOLVED_REASONS` gained `UNKNOWN_FIELD`.
- `RawStudentRequest` accepts unknown keys (index signatures) so the resolver,
  not the type system, is what reports them.

## [1.0.0-phase2] — Phase 2: Ontology, Normalization & Unknown Input Handling

### Added

- Versioned config in `config/`: `ontology.v1.json` (closed vocabulary for
  domains, skills, teaching styles, languages, genders, availability and
  credential fields) and `aliases.v1.json` (exact English/Vietnamese alias
  tables).
- `foldKey()` text folding and the folded alias index; `lookupAlias()`.
- Canonicalizers: `canonicalizeSkill()` (domain-aware), `canonicalizeSimple()`,
  `canonicalizeAvailabilitySlot()`, `canonicalizePrice()`.
- `resolveStudentRequest()` — turns an untrusted `RawStudentRequest` into a
  `RequestResolution` report plus a schema-valid canonical `StudentRequest`
  (or `null` when nothing executable can be built).
- Criterion kinds (`CRITERION_KINDS`) and reason codes (`UNRESOLVED_REASONS`);
  `computeCoverage()` and `deriveResolutionStatus()`.
- Contradiction reporting: conflicting budgets, target score not above current
  score, cross-domain required expertise, conflicting gender preferences.
- Phase 2 test suite (55 tests).

### Changed

- `ResolvedCriterion` / `UnresolvedCriterion` gained a `kind` field naming the
  request field a criterion came from. Additive; the PLAN.md example payload
  remains a subset.
- Credential semantics are now explicitly three-valued and documented as such:
  key omitted = UNKNOWN, `null` = KNOWN ABSENT, object = KNOWN PRESENT. Added
  `credentialKnowledge()` and `getCredential()`; `CredentialsSchema` uses
  `.nullable().optional()` so the distinction survives validation and JSON
  round-trips. Filtering and explanation must branch on all three states.

### Notes

- No LLM, no fuzzy matching, no network access. `SEMANTICALLY_RESOLVED` is
  defined but never emitted until Phase 8.

## [1.0.0-phase1] — Phase 1: Canonical Domain Model & Validation

### Added

- Canonical mentor model (`MentorSchema`, `Mentor`) with IELTS / SAT / HSK
  credentials, expertise, weekly availability slots and pricing.
- Canonical student request model (`StudentRequestSchema`, `StudentRequest`)
  separating hard constraints from soft preferences, and preserving free-text
  criteria in `additionalPreferences`.
- Response contract types (`MatchResponse`, `RequestResolution`,
  `MentorRecommendation`, `MatchDiagnostics`, `ResolutionStatus`,
  `FilterReason`) — shapes only; producers arrive in Phases 2–6.
- Non-throwing validators `validateMentor`, `validateMentors` (also rejects
  duplicate mentor IDs) and `validateStudentRequest`, returning deterministic,
  path-sorted issues.
- Closed vocabularies (`DOMAINS`, `SKILLS`, `TEACHING_STYLES`, `LANGUAGES`,
  `GENDERS`, availability slot format) and centralised `SCHEMA_BOUNDS`.
- Version constants `SCHEMA_VERSION` (`mentor-engine-schema-v1.0.0`) and
  `ENGINE_VERSION` (`mentor-engine-v1.0.0`).
- Test suite covering all Phase 1 validation cases (52 tests).

### Notes

- Only runtime dependency is `zod`. No web framework, database client or
  network transport is referenced anywhere in the package.
- `matchMentors()` is intentionally not implemented yet.
