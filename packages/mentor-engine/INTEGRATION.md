# Integration contract

The canonical JSON contract between ED4U's server and this engine, frozen at
V1. Everything here is transport-neutral: the same payloads work whether the
engine is a local package call or, later, an HTTP service.

## The one call

```ts
import { matchMentors } from "@ed4u/mentor-engine";

const response = matchMentors({ request, mentors, topK: 5 });
```

`matchMentors` composes the verified pipeline — hard filtering, ranking,
explanation — and returns a complete, serializable `MatchResponse`. It performs
no network, database or filesystem access. Given the same canonical inputs and
config it returns the same **decision output**; `diagnostics.latencyMs` is
observational telemetry and is intentionally not byte-deterministic.

It expects **already-validated canonical input**. Validation is the adapter's
boundary; re-validating inside would hide adapter bugs behind a second chance.

```ts
const mentors = validateMentors(rows.map(exampleMentorAdapter.toCanonicalMentor));
if (!mentors.ok) throw new Error(JSON.stringify(mentors.issues));
```

## Request contract

```json
{
  "requestId": "R001",
  "goal": {
    "domain": "IELTS",
    "currentScore": 6.0,
    "targetScore": 7.0,
    "focusSkills": ["IELTS.WRITING"]
  },
  "hardConstraints": {
    "verifiedOnly": true,
    "maxPricePerHour": 200000,
    "minCredentialScore": 7.0,
    "requiredExpertise": [],
    "requireAllAvailability": false
  },
  "availability": ["TUE_19_00", "THU_19_00"],
  "softPreferences": { "teachingStyles": ["PATIENT"], "languages": [] },
  "additionalPreferences": ["mentor nói chuyện chill"]
}
```

## Response contract

`topK`, when supplied, must be a finite positive integer (`>= 1`). Invalid values
fail loudly; an empty result is reserved for genuine hard-constraint
infeasibility, not accidental truncation semantics.

If a caller supplies a custom `RankingConfig`, its non-empty `version` is
reported verbatim as `configVersions.weights`; persisted audit data therefore
identifies the config that actually produced the ranking.

```json
{
  "engineVersion": "mentor-engine-v1.0.0",
  "packageVersion": "1.0.0",
  "schemaVersion": "mentor-engine-schema-v1.0.0",
  "configVersions": { "ontology": "ontology.v1", "aliases": "aliases.v1", "weights": "weights.v1" },
  "requestResolution": { "status": "PARTIALLY_RESOLVED", "coverage": 0.86, "resolved": [], "unresolved": [] },
  "recommendations": [
    {
      "mentorId": "M0075",
      "rank": 1,
      "matchScore": 72.14,
      "scoreBreakdown": { "subjectExpertise": 0.714, "focusSkillStrength": 0.8 },
      "appliedWeights": { "subjectExpertise": 0.21, "focusSkillStrength": 0.38 },
      "reasons": ["IELTS Writing 7.5 matches your focus on IELTS Writing"],
      "tradeoffs": ["No rating on record yet"],
      "dataCoverage": 1
    }
  ],
  "diagnostics": {
    "candidateCount": 500,
    "eligibleCount": 33,
    "filteredOut": { "DOMAIN": 141, "UNVERIFIED": 74, "PRICE": 267 },
    "filteredOutByReason": { "DOMAIN": 141, "UNVERIFIED": 93, "PRICE": 460 },
    "latencyMs": 0.31
  }
}
```

### Version fields to persist

A stored match run is only reproducible if you keep all of these. The scores are
a function of every one of them:

| Field | Why |
| --- | --- |
| `engineVersion` | The semantic matching contract |
| `packageVersion` | The exact distributable artifact that executed the match |
| `schemaVersion` | The data contract the payload conforms to |
| `configVersions.ontology` | Which vocabulary was closed over |
| `configVersions.aliases` | Which alias tables were in force |
| `configVersions.weights` | The exact ranking config version that produced the scores |

Persist the `request` alongside the response. `appliedWeights` and
`scoreBreakdown` are full precision, so any stored recommendation can be
re-derived: `matchScore ≈ 100 × Σ(appliedWeights[f] × scoreBreakdown[f])`.

### No feasible match

```json
{ "recommendations": [], "diagnostics": { "eligibleCount": 0, "noFeasibleMatch": true, "filteredOut": { "PRICE": 500 } } }
```

Constraints are never relaxed to manufacture a result. `filteredOut` tells the
student *why* nobody qualified, so the UI can suggest which constraint to loosen
— that decision belongs to the human.

## Adapters

The adapter is the only place that knows both ED4U's database and this
engine. It lives in the **server**, not in this package.

```ts
export interface MentorDataAdapter<T> { toCanonicalMentor(source: T): Mentor; }
export interface RequestDataAdapter<T> { toCanonicalRequest(source: T): StudentRequest; }
```

See [`src/adapters/exampleAdapter.ts`](src/adapters/exampleAdapter.ts) for a
worked example against mock database rows. The decision that matters most:

> **A `NULL` column is usually UNKNOWN, not ABSENT.** Omit the credential key
> when nobody has checked; emit `null` only when the mentor is known to hold
> nothing. Getting this backwards makes the engine assert a fact about a
> certificate nobody ever looked at.

Tenant ids, sessions, RBAC, analytics and student identity stay on the server
side. The engine never sees them, so it cannot rank on them.

## Optional semantic parser

`matchMentors` takes canonical structured input and needs no LLM. Natural
language is a **pre-processing layer** that can be removed entirely:

```ts
const parsed = parseStudentRequestSync({ text, requestId }, deterministicParser);
if (parsed.request !== null) {
  matchMentors({ request: parsed.request, mentors, resolution: parsed.resolution });
}
```

Pass `parsed.resolution` through so the response reports what the student asked
for that the engine could not execute.

## Future: a remote implementation

If a future version needs Python for ML or optimisation, the contract above is
what moves, unchanged, behind:

```text
POST /v1/match/mentor
Content-Type: application/json

{ "request": { … }, "mentors": [ … ], "topK": 5 }
→ 200 { …MatchResponse… }
```

The caller should not be able to tell whether the implementation is a local
TypeScript package or a remote service. **No Python service is implemented in
V1** — this section exists so the JSON contract is not accidentally designed into
a corner that only in-process calls can satisfy.
