/**
 * Explanations: why this mentor, and what you give up by taking them.
 *
 * Every sentence produced here is assembled from a *structured fact that was
 * actually observed* on the canonical record. There is no language model, no
 * template that fires on a guess, and no phrasing that can outrun the data:
 *
 * - a mentor with no rating never gets a sentence about their rating;
 * - a mentor whose Writing band was never published is described as teaching
 *   Writing, not as being good at it;
 * - a number that appears in a sentence appears in the mentor's record.
 *
 * The same ranking always produces the same text: facts are emitted in a fixed
 * order, and comparisons pick their counterpart deterministically.
 *
 * ## `matchScore` is a ranking score
 *
 * Nothing in this module describes it as a probability, a confidence, or a
 * chance of success, and nothing should. No model here has been calibrated
 * against real outcomes — no outcome data exists yet — so any such phrasing
 * would be a claim we cannot support.
 */

import { FEATURE_NAMES, rankingConfig, sectionScoreForSkill } from "../features/featureBuilder.js";
import type { FeatureName, RankingConfig } from "../features/featureBuilder.js";
import { credentialKnowledge, headlineCredentialScore } from "../schemas/mentor.js";
import type { Mentor } from "../schemas/mentor.js";
import type { StudentRequest } from "../schemas/request.js";
import type { MentorRecommendation } from "../schemas/result.js";
import { domainOfSkill } from "../schemas/validation.js";
import type { Domain, Skill } from "../schemas/validation.js";
import { rankMentors, validateRankingConfig } from "../ranking/rankerV1.js";
import type { RankedMentor, RankOptions } from "../ranking/rankerV1.js";

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/** Human-readable labels for canonical skills. */
const SKILL_LABELS: Record<Skill, string> = {
  "IELTS.LISTENING": "IELTS Listening",
  "IELTS.READING": "IELTS Reading",
  "IELTS.WRITING": "IELTS Writing",
  "IELTS.SPEAKING": "IELTS Speaking",
  "SAT.MATH": "SAT Math",
  "SAT.READING_WRITING": "SAT Reading & Writing",
  "HSK.LISTENING": "HSK Listening",
  "HSK.READING": "HSK Reading",
  "HSK.WRITING": "HSK Writing",
};

/**
 * Formats a VND amount with thousands separators.
 *
 * Hand-rolled rather than `toLocaleString`, which varies with the host locale
 * and would make explanations differ between machines.
 */
function formatVnd(amount: number): string {
  return `${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} VND`;
}

/** Formats a domain's headline score the way that domain is normally written. */
function formatCredential(domain: Domain, score: number): string {
  if (domain === "IELTS") return `IELTS ${score.toFixed(1)} overall`;
  if (domain === "SAT") return `SAT ${score} total`;
  return `HSK level ${score}`;
}

/** Formats an IELTS band (`8` → `"8.0"`); other domains print as integers. */
function formatSectionScore(domain: Domain, score: number): string {
  return domain === "IELTS" ? score.toFixed(1) : String(score);
}

/** Pluralises a count with its noun. */
function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/* -------------------------------------------------------------------------- */
/* Reasons                                                                    */
/* -------------------------------------------------------------------------- */

/** A reason, tagged with the feature it came from so it can be ranked. */
interface WeightedReason {
  /** Feature this fact belongs to; drives ordering. `null` sorts last. */
  feature: FeatureName | null;
  text: string;
}

/**
 * Builds every factual reason supported by observed data.
 *
 * Each block is guarded by the presence of the data it describes; a block whose
 * data is missing emits nothing rather than hedged prose.
 */
function collectReasons(
  request: StudentRequest,
  mentor: Mentor,
  config: RankingConfig,
): WeightedReason[] {
  const reasons: WeightedReason[] = [];
  const domain = request.goal.domain;

  /* Credential ------------------------------------------------------------ */
  if (credentialKnowledge(mentor.credentials, domain) === "PRESENT") {
    const score = headlineCredentialScore(mentor.credentials, domain);
    if (score !== undefined) {
      const minimum = request.hardConstraints.minCredentialScore;
      reasons.push({
        feature: "subjectExpertise",
        text:
          minimum === undefined
            ? formatCredential(domain, score)
            : `${formatCredential(domain, score)}, at or above the ${formatSectionScore(domain, minimum)} you asked for`,
      });
    }
  }

  /* Focus skills ---------------------------------------------------------- */
  for (const skill of request.goal.focusSkills) {
    if (!mentor.expertise.includes(skill)) continue;

    const label = SKILL_LABELS[skill];
    const band = sectionScoreForSkill(mentor, skill);

    if (band !== undefined) {
      reasons.push({
        feature: "focusSkillStrength",
        text: `${label} ${formatSectionScore(domainOfSkill(skill), band)} matches your focus on ${label}`,
      });
    } else {
      // Teaching it is observed; being good at it is not. Say only the former.
      reasons.push({ feature: "focusSkillStrength", text: `Teaches ${label}` });
    }
  }

  /* Availability ---------------------------------------------------------- */
  if (request.availability.length > 0) {
    const mentorSlots = new Set(mentor.availability);
    const covered = request.availability.filter((slot) => mentorSlots.has(slot));

    if (covered.length === request.availability.length) {
      reasons.push({
        feature: "availabilityFit",
        text:
          covered.length === 1
            ? `Available at your requested time (${covered[0] as string})`
            : `Available at all ${covered.length} of your requested times`,
      });
    } else if (covered.length > 0) {
      reasons.push({
        feature: "availabilityFit",
        text: `Available at ${covered.length} of your ${request.availability.length} requested times (${covered.join(", ")})`,
      });
    }
  }

  /* Budget ---------------------------------------------------------------- */
  const maxPrice = request.hardConstraints.maxPricePerHour;
  if (maxPrice !== undefined) {
    reasons.push({
      feature: "budgetFit",
      text: `${formatVnd(mentor.pricePerHour)}/hour is within your ${formatVnd(maxPrice)} budget`,
    });
  }

  /* Experience ------------------------------------------------------------ */
  const { sessionsCompleted: sessions, teachingExperienceMonths: months } = mentor;
  if (sessions !== undefined && months !== undefined) {
    reasons.push({
      feature: "experience",
      text: `${plural(sessions, "completed session")} over ${plural(months, "month")} of teaching`,
    });
  } else if (sessions !== undefined) {
    reasons.push({ feature: "experience", text: `${plural(sessions, "completed session")}` });
  } else if (months !== undefined) {
    reasons.push({ feature: "experience", text: `${plural(months, "month")} of teaching experience` });
  }

  /* Rating ---------------------------------------------------------------- */
  if (mentor.rating !== undefined) {
    reasons.push({
      feature: "rating",
      text:
        sessions === undefined
          ? `Rated ${mentor.rating.toFixed(1)} out of 5`
          : `Rated ${mentor.rating.toFixed(1)} out of 5 across ${plural(sessions, "session")}`,
    });
  }

  /* Teaching styles ------------------------------------------------------- */
  const requestedStyles = request.softPreferences.teachingStyles;
  if (requestedStyles.length > 0 && mentor.teachingStyles !== undefined) {
    const declared = new Set<string>(mentor.teachingStyles);
    const matched = requestedStyles.filter((style) => declared.has(style));
    if (matched.length > 0) {
      reasons.push({
        feature: "teachingStyleFit",
        text: `Teaching style matches your preference: ${matched.join(", ")}`,
      });
    }
  }

  /* Verification ---------------------------------------------------------- */
  if (mentor.verified) {
    reasons.push({ feature: null, text: "Identity and credentials verified by ED4U" });
  }

  /* Guaranteed fallback --------------------------------------------------- */
  // `expertise` is non-empty by schema, so there is always at least one true
  // thing to say — no recommendation is ever returned without a reason.
  const domainSkills = mentor.expertise.filter((skill) => domainOfSkill(skill) === domain);
  if (domainSkills.length > 0) {
    reasons.push({
      feature: null,
      text: `Teaches ${domainSkills.map((skill) => SKILL_LABELS[skill]).join(", ")}`,
    });
  }

  return orderByWeight(reasons, request, config);
}

/**
 * Orders reasons by the weight of the feature behind them.
 *
 * The most decision-relevant fact leads, and when the list is capped it is the
 * least relevant facts that fall off. Untagged reasons (verification, the
 * expertise fallback) sort last but keep their relative order.
 */
function orderByWeight(
  reasons: readonly WeightedReason[],
  request: StudentRequest,
  config: RankingConfig,
): WeightedReason[] {
  const weights = config.baseWeights as Record<string, number>;
  const boost = (feature: FeatureName | null): number => {
    if (feature === null) return -1;
    let weight = weights[feature] ?? 0;
    if (feature === "focusSkillStrength" && request.goal.focusSkills.length > 0) {
      weight *= config.requestAware.focusSkillBoost;
    }
    if (feature === "teachingStyleFit" && request.softPreferences.teachingStyles.length > 0) {
      weight *= config.requestAware.teachingStyleBoost;
    }
    return weight;
  };

  return [...reasons]
    .map((reason, index) => ({ reason, index }))
    .sort((a, b) => {
      const delta = boost(b.reason.feature) - boost(a.reason.feature);
      // Stable within equal weights, so output never depends on sort internals.
      return delta !== 0 ? delta : a.index - b.index;
    })
    .map((entry) => entry.reason);
}

/* -------------------------------------------------------------------------- */
/* Tradeoffs                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Priority tiers for tradeoffs, lowest number shown (and kept) first.
 *
 * The cap on how many tradeoffs are shown must never be able to hide a
 * safety-relevant fact behind routine comparisons. Tiers make that structural
 * rather than a matter of list order: everything in `CRITICAL` survives the cap
 * before a single `COMPARATIVE` entry is considered.
 */
export const TRADEOFF_PRIORITY = {
  /** Trust and verifiability: unverified identity, no credential on record. */
  CRITICAL: 0,
  /** A concrete disadvantage against another mentor the student can see. */
  COMPARATIVE: 1,
  /** A gap in the record that is worth knowing but not disqualifying. */
  INFORMATIONAL: 2,
} as const;

/** A tradeoff together with the tier that decides whether the cap can drop it. */
interface PrioritisedTradeoff {
  priority: (typeof TRADEOFF_PRIORITY)[keyof typeof TRADEOFF_PRIORITY];
  text: string;
}

/**
 * Applies the cap by priority, so critical disclosures cannot be displaced.
 *
 * Sorting is stable within a tier, so the order facts were generated in — which
 * is fixed — still determines the order they appear in. When critical
 * disclosures alone exceed the cap they fill it: the cap is respected, and what
 * survives is the most important part.
 *
 * @param tradeoffs - Every tradeoff found, in generation order.
 * @param cap - Maximum number to show.
 */
function selectTradeoffs(tradeoffs: readonly PrioritisedTradeoff[], cap: number): string[] {
  return [...tradeoffs]
    .map((tradeoff, index) => ({ tradeoff, index }))
    .sort((a, b) =>
      a.tradeoff.priority !== b.tradeoff.priority
        ? a.tradeoff.priority - b.tradeoff.priority
        : a.index - b.index,
    )
    .slice(0, Math.max(0, cap))
    .map((entry) => entry.tradeoff.text);
}

/** Picks the best counterpart on one dimension among the other candidates. */
function bestOther<T>(
  candidates: readonly { mentor: Mentor; rank: number }[],
  selfId: string,
  read: (mentor: Mentor) => T | undefined,
  better: (a: T, b: T) => boolean,
): { mentor: Mentor; value: T } | undefined {
  let best: { mentor: Mentor; value: T } | undefined;

  for (const candidate of candidates) {
    if (candidate.mentor.id === selfId) continue;
    const value = read(candidate.mentor);
    if (value === undefined) continue;
    // Candidates arrive in rank order, and `better` is strict, so the first
    // holder of the best value wins — deterministic without extra tie-breaking.
    if (best === undefined || better(value, best.value)) best = { mentor: candidate.mentor, value };
  }

  return best;
}

/**
 * Builds factual tradeoffs: real disadvantages against the other ranked
 * candidates, then honest disclosures of what is not on record.
 *
 * Comparisons only fire when *both* sides have the data — a mentor is never
 * described as worse than someone whose figure we do not hold.
 *
 * `peers` is the **returned** list, not every eligible mentor. A tradeoff that
 * named someone outside the Top-K would point the student at a mentor they were
 * never offered and cannot choose. The consequence is deliberate: asking for
 * Top-3 and Top-10 yields the same ranks, scores and reasons but different
 * tradeoffs, because the set being compared against genuinely differs.
 */
function collectTradeoffs(
  request: StudentRequest,
  mentor: Mentor,
  peers: readonly { mentor: Mentor; rank: number }[],
  config: RankingConfig,
): string[] {
  const tradeoffs: PrioritisedTradeoff[] = [];
  const comparative: string[] = [];
  const domain = request.goal.domain;

  /* More experienced peer -------------------------------------------------- */
  if (mentor.sessionsCompleted !== undefined) {
    const rival = bestOther(
      peers,
      mentor.id,
      (m) => m.sessionsCompleted,
      (a, b) => a > b,
    );
    if (rival !== undefined && rival.value > mentor.sessionsCompleted) {
      comparative.push(
        `Fewer completed sessions than ${rival.mentor.id} (${mentor.sessionsCompleted} vs ${rival.value})`,
      );
    }
  }

  /* Cheaper peer ----------------------------------------------------------- */
  const cheaper = bestOther(
    peers,
    mentor.id,
    (m) => m.pricePerHour,
    (a, b) => a < b,
  );
  if (cheaper !== undefined && cheaper.value < mentor.pricePerHour) {
    comparative.push(
      `Costs more per hour than ${cheaper.mentor.id} (${formatVnd(mentor.pricePerHour)} vs ${formatVnd(cheaper.value)})`,
    );
  }

  /* Stronger credential ---------------------------------------------------- */
  const ownScore = headlineCredentialScore(mentor.credentials, domain);
  if (ownScore !== undefined) {
    const stronger = bestOther(
      peers,
      mentor.id,
      (m) => headlineCredentialScore(m.credentials, domain),
      (a, b) => a > b,
    );
    if (stronger !== undefined && stronger.value > ownScore) {
      comparative.push(
        `Lower ${domain} score than ${stronger.mentor.id} (${formatSectionScore(domain, ownScore)} vs ${formatSectionScore(domain, stronger.value)})`,
      );
    }
  }

  /* Better schedule fit ---------------------------------------------------- */
  if (request.availability.length > 0) {
    const covers = (candidate: Mentor) => {
      const slots = new Set(candidate.availability);
      return request.availability.filter((slot) => slots.has(slot)).length;
    };
    const own = covers(mentor);
    const roomier = bestOther(peers, mentor.id, covers, (a, b) => a > b);
    if (roomier !== undefined && roomier.value > own) {
      comparative.push(
        `Covers fewer of your requested times than ${roomier.mentor.id} (${own} of ${request.availability.length} vs ${roomier.value})`,
      );
    }
  }

  /* Disclosures ------------------------------------------------------------ */
  // CRITICAL disclosures are about trust and verifiability — the things a
  // student must see before choosing anyone. They are emitted at the top
  // priority so that no number of comparative observations can push them out
  // when the cap bites.
  if (!mentor.verified) {
    tradeoffs.push({ priority: TRADEOFF_PRIORITY.CRITICAL, text: "Not yet verified by ED4U" });
  }

  const knowledge = credentialKnowledge(mentor.credentials, domain);
  if (knowledge === "UNKNOWN") {
    tradeoffs.push({
      priority: TRADEOFF_PRIORITY.CRITICAL,
      text: `No ${domain} credential on record`,
    });
  } else if (knowledge === "ABSENT") {
    tradeoffs.push({
      priority: TRADEOFF_PRIORITY.CRITICAL,
      text: `Holds no ${domain} credential`,
    });
  }

  for (const text of comparative) {
    tradeoffs.push({ priority: TRADEOFF_PRIORITY.COMPARATIVE, text });
  }

  /* Informational gaps ------------------------------------------------------ */
  for (const skill of request.goal.focusSkills) {
    if (!mentor.expertise.includes(skill)) continue;
    if (domainOfSkill(skill) === "HSK") continue; // No per-skill scores exist at all.
    if (sectionScoreForSkill(mentor, skill) === undefined) {
      tradeoffs.push({
        priority: TRADEOFF_PRIORITY.INFORMATIONAL,
        text: `No published ${SKILL_LABELS[skill]} score`,
      });
    }
  }

  if (mentor.rating === undefined) {
    tradeoffs.push({ priority: TRADEOFF_PRIORITY.INFORMATIONAL, text: "No rating on record yet" });
  }
  if (mentor.sessionsCompleted === undefined && mentor.teachingExperienceMonths === undefined) {
    tradeoffs.push({
      priority: TRADEOFF_PRIORITY.INFORMATIONAL,
      text: "No teaching history on record",
    });
  }
  if (request.softPreferences.teachingStyles.length > 0 && mentor.teachingStyles === undefined) {
    tradeoffs.push({ priority: TRADEOFF_PRIORITY.INFORMATIONAL, text: "No teaching styles listed" });
  }

  return selectTradeoffs(tradeoffs, config.explanation.maxTradeoffs);
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/** Options accepted by the explanation entry points. */
export interface ExplainOptions {
  /** Ranking configuration; defaults to `config/weights.v1.json`. */
  config?: RankingConfig;
}

/**
 * Attaches factual reasons and tradeoffs to an existing ranking.
 *
 * @param request - The canonical request the mentors were ranked for.
 * @param ranked - Output of {@link rankMentors}, in rank order.
 * @param mentors - The mentor records those rankings refer to.
 * @param options - Optional config override.
 * @returns One {@link MentorRecommendation} per ranked mentor, in rank order.
 * @throws When a ranked mentor id is missing from `mentors` — explaining a
 *   record we do not hold is exactly the failure this module exists to prevent.
 */
export function explainRecommendations(
  request: StudentRequest,
  ranked: readonly RankedMentor[],
  mentors: readonly Mentor[],
  options: ExplainOptions = {},
): MentorRecommendation[] {
  const config = options.config ?? rankingConfig;
  // Validated here too, not only in the ranker: this function is a public entry
  // point that can be called directly on a stored ranking, so a malformed
  // config would otherwise reach the caps and reason ordering unchecked.
  validateRankingConfig(config);

  const byId = new Map(mentors.map((mentor) => [mentor.id, mentor]));

  const peers = ranked.map((entry) => {
    const mentor = byId.get(entry.mentorId);
    if (mentor === undefined) {
      throw new Error(`Cannot explain unknown mentor "${entry.mentorId}"`);
    }
    return { mentor, rank: entry.rank };
  });

  return ranked.map((entry, index) => {
    const mentor = (peers[index] as { mentor: Mentor }).mentor;
    const reasons = collectReasons(request, mentor, config)
      .slice(0, config.explanation.maxReasons)
      .map((reason) => reason.text);

    return {
      mentorId: entry.mentorId,
      rank: entry.rank,
      matchScore: entry.matchScore,
      scoreBreakdown: { ...entry.scoreBreakdown },
      // Full precision, so the score can be re-derived from the response alone.
      appliedWeights: { ...entry.weights },
      reasons,
      tradeoffs: collectTradeoffs(request, mentor, peers, config),
      dataCoverage: entry.dataCoverage,
    };
  });
}

/**
 * Ranks eligible mentors and explains the result: the Top-K entry point.
 *
 * Expects mentors that already passed {@link applyHardConstraints}. Ranking and
 * explanation stay separate functions underneath so a caller can inspect the
 * arithmetic without the prose, or re-explain a stored ranking.
 *
 * @param request - Canonical, validated student request.
 * @param eligible - Mentors that satisfied every hard constraint.
 * @param options - `topK` truncation and optional config override.
 * @returns Explained recommendations, best first.
 */
export function topKRecommendations(
  request: StudentRequest,
  eligible: readonly Mentor[],
  options: RankOptions = {},
): MentorRecommendation[] {
  const ranked = rankMentors(request, eligible, options);
  const config = options.config;
  return explainRecommendations(
    request,
    ranked,
    eligible,
    config === undefined ? {} : { config },
  );
}

/** Feature names, re-exported for callers rendering a breakdown. */
export { FEATURE_NAMES };
