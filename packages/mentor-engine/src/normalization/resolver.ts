/**
 * Request resolver: open-world input, closed-world execution.
 *
 * A student may express anything. The engine may execute only what the
 * versioned ontology can represent. This module holds that line:
 *
 * - every criterion the caller supplied ends up in exactly one of
 *   `resolution.resolved` or `resolution.unresolved` — nothing is dropped;
 * - unresolved criteria keep their original text verbatim, plus a machine-
 *   readable reason;
 * - a criterion that cannot be executed never influences the canonical request;
 * - `coverage` states, as a number, how much of the request the engine can act
 *   on, so a UI can be honest about the rest.
 *
 * The resolver is pure and deterministic: same input and same config in, byte-
 * identical output out.
 */

import {
  canonicalizeAvailabilitySlot,
  canonicalizePrice,
  canonicalizeSimple,
  canonicalizeSkill,
  foldKey,
} from "./canonicalizer.js";
import {
  computeCoverage,
  deriveResolutionStatus,
} from "./statuses.js";
import type { CriterionKind, UnresolvedReason } from "./statuses.js";
import { StudentRequestSchema } from "../schemas/request.js";
import type { StudentRequest } from "../schemas/request.js";
import type {
  RequestResolution,
  ResolvedCriterion,
  UnresolvedCriterion,
} from "../schemas/result.js";
import { HskLevelSchema, IeltsBandSchema, SatTotalSchema } from "../schemas/validation.js";
import type { Domain } from "../schemas/validation.js";
import { toValidationIssues } from "../schemas/validation.js";
import type { ValidationIssue } from "../schemas/validation.js";

/* -------------------------------------------------------------------------- */
/* Input shape                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A request as it arrives from an adapter, a form, or the Phase 8 parser.
 *
 * Everything is `unknown` on purpose: the resolver's job is to be the place
 * where untrusted, human-shaped input is confronted with the ontology. Callers
 * must not pre-clean values, because pre-cleaning is where information gets
 * silently lost.
 */
export interface RawStudentRequest {
  requestId?: unknown;
  goal?: {
    domain?: unknown;
    currentScore?: unknown;
    targetScore?: unknown;
    focusSkills?: unknown;
    /** Fields the contract does not define are reported, not dropped. */
    [field: string]: unknown;
  };
  hardConstraints?: {
    verifiedOnly?: unknown;
    /**
     * One budget, or several extracted mentions. Several *distinct* values are
     * treated as a contradiction rather than silently reduced to the minimum.
     */
    maxPricePerHour?: unknown;
    minCredentialScore?: unknown;
    requiredExpertise?: unknown;
    requireAllAvailability?: unknown;
    [field: string]: unknown;
  };
  availability?: unknown;
  softPreferences?: {
    teachingStyles?: unknown;
    languages?: unknown;
    gender?: unknown;
    [field: string]: unknown;
  };
  /** Free-text criteria with no canonical representation (yet). */
  additionalPreferences?: unknown;
  [field: string]: unknown;
}

/** Fields the canonical contract defines, per container. */
const KNOWN_FIELDS = {
  "": ["requestId", "goal", "hardConstraints", "availability", "softPreferences", "additionalPreferences"],
  goal: ["domain", "currentScore", "targetScore", "focusSkills"],
  hardConstraints: [
    "verifiedOnly",
    "maxPricePerHour",
    "minCredentialScore",
    "requiredExpertise",
    "requireAllAvailability",
  ],
  softPreferences: ["teachingStyles", "languages", "gender"],
} as const satisfies Record<string, readonly string[]>;

/** Result of resolving a raw request against the ontology. */
export interface ResolvedRequest {
  /** Full, honest account of every criterion the caller supplied. */
  resolution: RequestResolution;
  /**
   * The canonical request, or `null` when no executable request could be built
   * (e.g. the domain itself could not be resolved). Never partially valid: it
   * has passed {@link StudentRequestSchema}.
   */
  request: StudentRequest | null;
  /** Schema issues, when canonical assembly produced an invalid request. */
  issues: ValidationIssue[];
}

/* -------------------------------------------------------------------------- */
/* Criterion accumulator                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Collects criteria while keeping the output deterministic and duplicate-free.
 *
 * Duplicate criteria (same kind, same folded text) are recorded once. Counting
 * them twice would let a student inflate or deflate their own coverage score by
 * repeating themselves.
 */
class CriterionLog {
  private readonly resolvedList: ResolvedCriterion[] = [];
  private readonly unresolvedList: UnresolvedCriterion[] = [];
  private readonly seen = new Set<string>();

  /** Returns false when this exact criterion was already recorded. */
  private claim(kind: CriterionKind, raw: string): boolean {
    const key = `${kind}::${foldKey(raw)}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }

  /** Records a criterion the engine will execute. */
  resolve(kind: CriterionKind, raw: string, canonical: string): void {
    if (!this.claim(kind, raw)) return;
    this.resolvedList.push({ kind, raw, canonical, status: "RESOLVED" });
  }

  /** Records a criterion the engine will not execute, and why. */
  reject(
    kind: CriterionKind,
    raw: string,
    status: UnresolvedCriterion["status"],
    reason: UnresolvedReason,
    candidates?: string[],
  ): void {
    if (!this.claim(kind, raw)) return;
    this.unresolvedList.push(
      candidates === undefined
        ? { kind, raw, status, reason }
        : { kind, raw, status, reason, candidates: [...candidates].sort() },
    );
  }

  /** Builds the immutable resolution report. */
  toResolution(): RequestResolution {
    return {
      status: deriveResolutionStatus(this.resolvedList.length, this.unresolvedList.length),
      coverage: computeCoverage(this.resolvedList.length, this.unresolvedList.length),
      resolved: this.resolvedList,
      unresolved: this.unresolvedList,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Renders any input as text for verbatim preservation in the report.
 *
 * Strings pass through untouched — that is the whole point, the student's own
 * words must survive. Non-strings are JSON-encoded so an object or array in an
 * unexpected place is still legible in the report rather than becoming
 * `[object Object]`. Values JSON cannot encode (circular structures, BigInt)
 * fall back to a type marker.
 */
function asRaw(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value) ?? `[${typeof value}]`;
  } catch {
    return `[unserializable ${typeof value}]`;
  }
}

/** Coerces a possibly-scalar field into a list, preserving order. */
function asList(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** True when a value is a blank or whitespace-only string. */
function isBlank(value: unknown): boolean {
  return typeof value === "string" && value.trim() === "";
}

/** True for plain objects (not arrays, not null). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads one of the request's nested containers, reporting a malformed one.
 *
 * A `goal` that arrives as a string is not an empty goal — it is a structural
 * error the caller needs to see.
 *
 * @returns The container, or `{}` when it is absent or unusable.
 */
function readContainer(
  log: CriterionLog,
  path: "goal" | "hardConstraints" | "softPreferences",
  value: unknown,
): Record<string, unknown> {
  if (value === undefined) return {};
  if (!isPlainObject(value)) {
    log.reject("REQUEST_STRUCTURE", `${path}: ${asRaw(value)}`, "REJECTED", "INVALID_TYPE");
    return {};
  }
  return value;
}

/**
 * Reports every field the canonical contract does not define.
 *
 * An unrecognised field is a criterion the student (or an out-of-date adapter)
 * expressed and the engine cannot execute. Dropping it silently is exactly the
 * failure mode this phase exists to prevent, so each one becomes an explicit
 * `UNSUPPORTED` criterion — which also means it counts against coverage.
 *
 * The value is embedded in `raw` so nothing is lost: the canonical request is
 * a strict object and has nowhere to carry an unknown field.
 *
 * Keys are visited in sorted order so the report does not depend on the key
 * order of the incoming JSON.
 *
 * @param container - The object to inspect.
 * @param path - Dotted prefix for reporting, `""` for the request root.
 */
function reportUnknownFields(
  log: CriterionLog,
  container: Record<string, unknown>,
  path: keyof typeof KNOWN_FIELDS,
): void {
  const known = new Set<string>(KNOWN_FIELDS[path]);
  const prefix = path === "" ? "" : `${path}.`;

  for (const key of Object.keys(container).sort()) {
    if (known.has(key)) continue;
    log.reject(
      "UNKNOWN_FIELD",
      `${prefix}${key}: ${asRaw(container[key])}`,
      "UNSUPPORTED",
      "UNKNOWN_FIELD",
    );
  }
}

/** Validates a score against a domain's own scale. */
function isScoreOnScale(domain: Domain, score: number): boolean {
  const schema =
    domain === "IELTS" ? IeltsBandSchema : domain === "SAT" ? SatTotalSchema : HskLevelSchema;
  return schema.safeParse(score).success;
}

/**
 * Resolves a list of free-text values against a simple closed vocabulary.
 *
 * @returns The canonical values, in ontology-stable sorted order.
 */
function resolveSimpleList(
  log: CriterionLog,
  kind: CriterionKind,
  category: "teachingStyle" | "language" | "gender",
  values: unknown[],
): string[] {
  const canonical: string[] = [];

  for (const value of values) {
    const raw = asRaw(value);
    if (isBlank(value)) {
      log.reject(kind, raw, "REJECTED", "EMPTY_CRITERION");
      continue;
    }
    if (typeof value !== "string") {
      log.reject(kind, raw, "REJECTED", "INVALID_TYPE");
      continue;
    }

    const outcome = canonicalizeSimple(category, value);
    switch (outcome.kind) {
      case "MATCH":
        log.resolve(kind, raw, outcome.canonical);
        if (!canonical.includes(outcome.canonical)) canonical.push(outcome.canonical);
        break;
      case "AMBIGUOUS":
        log.reject(kind, raw, "AMBIGUOUS", "MULTIPLE_CANDIDATES", outcome.candidates);
        break;
      default:
        log.reject(kind, raw, "UNSUPPORTED", "UNKNOWN_VALUE");
        break;
    }
  }

  return canonical.sort();
}

/**
 * Resolves a list of skill expressions, using the goal domain as context.
 *
 * @param domain - The resolved goal domain, or `undefined` when unknown.
 */
function resolveSkillList(
  log: CriterionLog,
  kind: CriterionKind,
  values: unknown[],
  domain: Domain | undefined,
): string[] {
  const canonical: string[] = [];

  for (const value of values) {
    const raw = asRaw(value);
    if (isBlank(value)) {
      log.reject(kind, raw, "REJECTED", "EMPTY_CRITERION");
      continue;
    }
    if (typeof value !== "string") {
      log.reject(kind, raw, "REJECTED", "INVALID_TYPE");
      continue;
    }

    const outcome = canonicalizeSkill(value, domain);
    switch (outcome.kind) {
      case "MATCH":
        log.resolve(kind, raw, outcome.canonical);
        if (!canonical.includes(outcome.canonical)) canonical.push(outcome.canonical);
        break;
      case "AMBIGUOUS":
        // Without a domain this is genuinely ambiguous; with one it means the
        // domain offers several matching skills. Either way, do not guess.
        log.reject(
          kind,
          raw,
          "AMBIGUOUS",
          domain === undefined ? "MISSING_DOMAIN_CONTEXT" : "MULTIPLE_CANDIDATES",
          outcome.candidates,
        );
        break;
      case "NOT_IN_DOMAIN":
        log.reject(
          kind,
          raw,
          "REJECTED",
          kind === "REQUIRED_EXPERTISE" ? "DOMAIN_MISMATCH" : "SKILL_NOT_IN_DOMAIN",
          outcome.candidates,
        );
        break;
      default:
        log.reject(kind, raw, "UNSUPPORTED", "UNKNOWN_SKILL");
        break;
    }
  }

  return canonical.sort();
}

/** Resolves availability expressions into canonical weekly slots. */
function resolveAvailability(log: CriterionLog, values: unknown[]): string[] {
  const canonical: string[] = [];

  for (const value of values) {
    const raw = asRaw(value);
    if (isBlank(value)) {
      log.reject("AVAILABILITY", raw, "REJECTED", "EMPTY_CRITERION");
      continue;
    }
    if (typeof value !== "string") {
      log.reject("AVAILABILITY", raw, "REJECTED", "INVALID_TYPE");
      continue;
    }

    const outcome = canonicalizeAvailabilitySlot(value);
    switch (outcome.kind) {
      case "MATCH":
        log.resolve("AVAILABILITY", raw, outcome.canonical);
        if (!canonical.includes(outcome.canonical)) canonical.push(outcome.canonical);
        break;
      case "BAD_GRANULARITY":
        log.reject("AVAILABILITY", raw, "UNSUPPORTED", "UNSUPPORTED_SLOT_GRANULARITY");
        break;
      default:
        log.reject("AVAILABILITY", raw, "UNSUPPORTED", "UNKNOWN_VALUE");
        break;
    }
  }

  return canonical.sort();
}

/**
 * Resolves the budget, treating several distinct values as a contradiction.
 *
 * @returns The agreed budget, or `undefined` when there is none to execute.
 */
function resolveBudget(log: CriterionLog, values: unknown[]): number | undefined {
  const canonicalByRaw = new Map<string, number>();

  for (const value of values) {
    const raw = asRaw(value);
    if (isBlank(value)) {
      log.reject("BUDGET", raw, "REJECTED", "EMPTY_CRITERION");
      continue;
    }
    const price = canonicalizePrice(value);
    if (price === undefined) {
      log.reject("BUDGET", raw, "REJECTED", "INVALID_PRICE");
      continue;
    }
    canonicalByRaw.set(raw, price);
  }

  const distinct = new Set(canonicalByRaw.values());
  if (distinct.size === 0) return undefined;

  if (distinct.size > 1) {
    // Report every mention, so the UI can ask the student which one they meant.
    const candidates = [...distinct].sort((a, b) => a - b).map(String);
    for (const raw of canonicalByRaw.keys()) {
      log.reject("BUDGET", raw, "REJECTED", "CONTRADICTORY_BUDGET", candidates);
    }
    return undefined;
  }

  const agreed = [...distinct][0] as number;
  for (const raw of canonicalByRaw.keys()) log.resolve("BUDGET", raw, String(agreed));
  return agreed;
}

/* -------------------------------------------------------------------------- */
/* Resolver                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Resolves a raw student request against the versioned ontology.
 *
 * Ordering matters and is fixed: the domain is resolved first because skills,
 * scores and credential minimums are only interpretable relative to it. When
 * the domain cannot be resolved, no canonical request is produced at all —
 * matching on a guessed exam would be worse than returning nothing.
 *
 * @param raw - Untrusted request from an adapter, form, or parser.
 * @returns The resolution report, and the canonical request when executable.
 */
export function resolveStudentRequest(raw: RawStudentRequest): ResolvedRequest {
  const log = new CriterionLog();
  const goal = readContainer(log, "goal", raw.goal);
  const hard = readContainer(log, "hardConstraints", raw.hardConstraints);
  const soft = readContainer(log, "softPreferences", raw.softPreferences);

  // Report unrecognised fields first, so a stale adapter shows up at the top of
  // the report rather than buried under the criteria it did manage to send.
  reportUnknownFields(log, raw, "");
  reportUnknownFields(log, goal, "goal");
  reportUnknownFields(log, hard, "hardConstraints");
  reportUnknownFields(log, soft, "softPreferences");

  /* --- Domain (must come first; everything else reads it) ---------------- */
  let domain: Domain | undefined;
  const rawDomain = goal.domain;

  if (rawDomain === undefined) {
    log.reject("DOMAIN", asRaw(rawDomain), "MISSING_DATA", "MISSING_DOMAIN_CONTEXT");
  } else if (isBlank(rawDomain)) {
    log.reject("DOMAIN", asRaw(rawDomain), "REJECTED", "EMPTY_CRITERION");
  } else if (typeof rawDomain !== "string") {
    log.reject("DOMAIN", asRaw(rawDomain), "REJECTED", "INVALID_TYPE");
  } else {
    const outcome = canonicalizeSimple("domain", rawDomain);
    if (outcome.kind === "MATCH") {
      domain = outcome.canonical as Domain;
      log.resolve("DOMAIN", rawDomain, domain);
    } else if (outcome.kind === "AMBIGUOUS") {
      log.reject("DOMAIN", rawDomain, "AMBIGUOUS", "MULTIPLE_CANDIDATES", outcome.candidates);
    } else {
      log.reject("DOMAIN", rawDomain, "UNSUPPORTED", "UNSUPPORTED_DOMAIN");
    }
  }

  /* --- Scores ------------------------------------------------------------ */
  /**
   * Decides a score's outcome *without* logging it.
   *
   * Logging is deferred because a score's fate can depend on the other score:
   * a target of 6.5 is perfectly valid on its own and impossible next to a
   * current score of 7. Recording it as RESOLVED and then again as REJECTED
   * would put one criterion in both buckets, double-count it in coverage, and
   * break the one-criterion-one-status invariant.
   */
  const judgeScore = (
    value: unknown,
  ):
    | { verdict: "ABSENT" }
    | { verdict: "OK"; raw: string; score: number }
    | { verdict: "BAD"; raw: string; status: "REJECTED" | "MISSING_DATA"; reason: UnresolvedReason } => {
    if (value === undefined) return { verdict: "ABSENT" };
    const rawScore = asRaw(value);

    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { verdict: "BAD", raw: rawScore, status: "REJECTED", reason: "INVALID_TYPE" };
    }
    if (domain === undefined) {
      // A bare "6.0" means nothing until we know which exam it is on.
      return {
        verdict: "BAD",
        raw: rawScore,
        status: "MISSING_DATA",
        reason: "MISSING_DOMAIN_CONTEXT",
      };
    }
    if (!isScoreOnScale(domain, value)) {
      return {
        verdict: "BAD",
        raw: rawScore,
        status: "REJECTED",
        reason: "INVALID_SCORE_FOR_DOMAIN",
      };
    }
    return { verdict: "OK", raw: rawScore, score: value };
  };

  const currentJudgement = judgeScore(goal.currentScore);
  const targetJudgement = judgeScore(goal.targetScore);

  // A target that is not above the current score is impossible, not merely odd.
  // Reject only the goal; the observed current score is still a fact.
  const contradictoryGoal =
    currentJudgement.verdict === "OK" &&
    targetJudgement.verdict === "OK" &&
    targetJudgement.score <= currentJudgement.score;

  let currentScore: number | undefined;
  if (currentJudgement.verdict === "OK") {
    currentScore = currentJudgement.score;
    log.resolve("CURRENT_SCORE", currentJudgement.raw, String(currentJudgement.score));
  } else if (currentJudgement.verdict === "BAD") {
    log.reject("CURRENT_SCORE", currentJudgement.raw, currentJudgement.status, currentJudgement.reason);
  }

  let targetScore: number | undefined;
  if (targetJudgement.verdict === "BAD") {
    log.reject("TARGET_SCORE", targetJudgement.raw, targetJudgement.status, targetJudgement.reason);
  } else if (targetJudgement.verdict === "OK") {
    if (contradictoryGoal) {
      log.reject("TARGET_SCORE", targetJudgement.raw, "REJECTED", "CONTRADICTORY_SCORE_GOAL");
    } else {
      targetScore = targetJudgement.score;
      log.resolve("TARGET_SCORE", targetJudgement.raw, String(targetJudgement.score));
    }
  }

  /* --- Skills ------------------------------------------------------------ */
  const focusSkills = resolveSkillList(log, "FOCUS_SKILL", asList(goal.focusSkills), domain);
  const requiredExpertise = resolveSkillList(
    log,
    "REQUIRED_EXPERTISE",
    asList(hard.requiredExpertise),
    domain,
  );

  /* --- Hard constraints -------------------------------------------------- */
  const maxPricePerHour = resolveBudget(log, asList(hard.maxPricePerHour));

  let minCredentialScore: number | undefined;
  if (hard.minCredentialScore !== undefined) {
    const rawMin = asRaw(hard.minCredentialScore);
    if (typeof hard.minCredentialScore !== "number") {
      log.reject("MIN_CREDENTIAL", rawMin, "REJECTED", "INVALID_TYPE");
    } else if (domain === undefined) {
      log.reject("MIN_CREDENTIAL", rawMin, "MISSING_DATA", "MISSING_DOMAIN_CONTEXT");
    } else if (!isScoreOnScale(domain, hard.minCredentialScore)) {
      log.reject("MIN_CREDENTIAL", rawMin, "REJECTED", "INVALID_SCORE_FOR_DOMAIN");
    } else {
      minCredentialScore = hard.minCredentialScore;
      log.resolve("MIN_CREDENTIAL", rawMin, String(minCredentialScore));
    }
  }

  /**
   * Resolves a boolean flag, rejecting anything that is not a real boolean.
   *
   * Truthiness coercion is banned here: reading `"false"` as `true` would
   * silently strengthen or weaken a hard constraint.
   */
  const resolveFlag = (kind: "VERIFIED_ONLY" | "REQUIRE_ALL_AVAILABILITY", value: unknown) => {
    if (value === undefined) return undefined;
    const rawFlag = asRaw(value);
    if (typeof value !== "boolean") {
      log.reject(kind, rawFlag, "REJECTED", "INVALID_TYPE");
      return undefined;
    }
    log.resolve(kind, rawFlag, String(value));
    return value;
  };

  const verifiedOnly = resolveFlag("VERIFIED_ONLY", hard.verifiedOnly);
  const requireAllAvailability = resolveFlag(
    "REQUIRE_ALL_AVAILABILITY",
    hard.requireAllAvailability,
  );

  /* --- Availability and soft preferences --------------------------------- */
  const availability = resolveAvailability(log, asList(raw.availability));
  const teachingStyles = resolveSimpleList(
    log,
    "TEACHING_STYLE",
    "teachingStyle",
    asList(soft.teachingStyles),
  );
  const languages = resolveSimpleList(log, "LANGUAGE", "language", asList(soft.languages));

  // Gender is single-valued: several distinct values are a contradiction, not a
  // list to pick from.
  const rawGenders = asList(soft.gender);
  let gender: string | undefined;
  if (rawGenders.length > 1) {
    for (const value of rawGenders) {
      log.reject("GENDER", asRaw(value), "REJECTED", "CONTRADICTORY_PREFERENCE");
    }
  } else {
    gender = resolveSimpleList(log, "GENDER", "gender", rawGenders)[0];
  }

  /* --- Free text: preserved, never executed ------------------------------ */
  const additionalPreferences: string[] = [];
  for (const value of asList(raw.additionalPreferences)) {
    const rawPreference = asRaw(value);
    if (isBlank(value)) {
      log.reject("ADDITIONAL_PREFERENCE", rawPreference, "REJECTED", "EMPTY_CRITERION");
      continue;
    }
    if (typeof value !== "string") {
      log.reject("ADDITIONAL_PREFERENCE", rawPreference, "REJECTED", "INVALID_TYPE");
      continue;
    }
    // Free text may still name something canonical ("kiên nhẫn"). Try the
    // vocabularies it could plausibly belong to before declaring it unsupported.
    const style = canonicalizeSimple("teachingStyle", value);
    if (style.kind === "MATCH") {
      log.resolve("ADDITIONAL_PREFERENCE", rawPreference, style.canonical);
      if (!teachingStyles.includes(style.canonical)) teachingStyles.push(style.canonical);
      continue;
    }
    additionalPreferences.push(value);
    log.reject("ADDITIONAL_PREFERENCE", rawPreference, "UNSUPPORTED", "NO_CANONICAL_FEATURE");
  }
  teachingStyles.sort();

  /* --- Canonical assembly ------------------------------------------------ */
  const resolution = log.toResolution();

  if (domain === undefined) {
    // Nothing is executable without a domain: return the report only.
    return { resolution, request: null, issues: [] };
  }

  const candidate = {
    requestId: typeof raw.requestId === "string" ? raw.requestId : "",
    goal: {
      domain,
      ...(currentScore === undefined ? {} : { currentScore }),
      ...(targetScore === undefined ? {} : { targetScore }),
      focusSkills,
    },
    hardConstraints: {
      verifiedOnly: verifiedOnly ?? false,
      ...(maxPricePerHour === undefined ? {} : { maxPricePerHour }),
      ...(minCredentialScore === undefined ? {} : { minCredentialScore }),
      requiredExpertise,
      requireAllAvailability: requireAllAvailability ?? false,
    },
    availability,
    softPreferences: {
      teachingStyles,
      languages,
      ...(gender === undefined ? {} : { gender }),
    },
    additionalPreferences,
  };

  const parsed = StudentRequestSchema.safeParse(candidate);
  if (!parsed.success) {
    return { resolution, request: null, issues: toValidationIssues(parsed.error) };
  }

  return { resolution, request: parsed.data, issues: [] };
}
