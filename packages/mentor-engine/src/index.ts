/**
 * `@ed4u/mentor-engine` — public surface.
 *
 * `matchMentors` is the single high-level entry point; everything else is
 * exported so a caller can compose the pipeline themselves, write an adapter, or
 * audit a stored result.
 */

export { matchMentors, DEFAULT_TOP_K } from "./engine.js";
export { PACKAGE_VERSION } from "./version.js";

export type { MatchMentorsInput } from "./engine.js";

export type {
  MentorDataAdapter,
  RequestDataAdapter,
  EngineDataAdapter,
} from "./adapters/types.js";

export { exampleMentorAdapter, exampleRequestAdapter } from "./adapters/exampleAdapter.js";

export type { MockMentorRow, MockRequestRow } from "./adapters/exampleAdapter.js";

export {
  SCHEMA_VERSION,
  ENGINE_VERSION,
  SCHEMA_BOUNDS,
  DOMAINS,
  SKILLS,
  TEACHING_STYLES,
  LANGUAGES,
  GENDERS,
  WEEKDAYS,
  AVAILABILITY_SLOT_PATTERN,
  DomainSchema,
  SkillSchema,
  TeachingStyleSchema,
  LanguageSchema,
  GenderSchema,
  AvailabilitySlotSchema,
  domainOfSkill,
  isAvailabilitySlot,
  toValidationIssues,
} from "./schemas/validation.js";

export type {
  Domain,
  Skill,
  TeachingStyle,
  Language,
  Gender,
  Weekday,
  AvailabilitySlot,
  ValidationIssue,
  ValidationResult,
} from "./schemas/validation.js";

export {
  MentorSchema,
  MentorListSchema,
  CredentialsSchema,
  IeltsCredentialSchema,
  SatCredentialSchema,
  HskCredentialSchema,
  credentialKnowledge,
  getCredential,
  headlineCredentialScore,
  ieltsOverallFromSections,
} from "./schemas/mentor.js";

export type {
  Mentor,
  Credentials,
  CredentialKnowledge,
  IeltsCredential,
  SatCredential,
  HskCredential,
} from "./schemas/mentor.js";

export {
  StudentRequestSchema,
  GoalSchema,
  HardConstraintsSchema,
  SoftPreferencesSchema,
} from "./schemas/request.js";

export type {
  StudentRequest,
  Goal,
  HardConstraints,
  SoftPreferences,
} from "./schemas/request.js";

export { RESOLUTION_STATUSES, FILTER_REASONS } from "./schemas/result.js";

export type {
  ResolutionStatus,
  ResolvedCriterion,
  UnresolvedCriterion,
  RequestResolution,
  RequestResolutionStatus,
  ScoreBreakdown,
  MentorRecommendation,
  MatchDiagnostics,
  MatchResponse,
  FilterReason,
} from "./schemas/result.js";

export { validateMentor, validateMentors, validateStudentRequest } from "./schemas/validate.js";

/* Phase 2 — ontology, normalization and unknown-input handling. */

export {
  ONTOLOGY_VERSION,
  ALIASES_VERSION,
  ALIAS_CATEGORIES,
  ontology,
  aliases,
  aliasIndex,
  foldKey,
  lookupAlias,
  ontologyHasSkill,
  skillsForSuffix,
  canonicalizeSkill,
  canonicalizeSimple,
  canonicalizeAvailabilitySlot,
  canonicalizePrice,
} from "./normalization/canonicalizer.js";

export type {
  AliasCategory,
  AliasIndex,
  CanonicalizeOutcome,
  SlotOutcome,
} from "./normalization/canonicalizer.js";

export {
  CRITERION_KINDS,
  UNRESOLVED_REASONS,
  computeCoverage,
  deriveResolutionStatus,
} from "./normalization/statuses.js";

export type {
  CriterionKind,
  UnresolvedReason,
  ResolvedStatus,
  UnresolvedStatus,
} from "./normalization/statuses.js";

export { resolveStudentRequest } from "./normalization/resolver.js";

export type { RawStudentRequest, ResolvedRequest } from "./normalization/resolver.js";

/* Phase 4 — hard constraint filtering. */

export {
  applyHardConstraints,
  satisfiesHardConstraints,
  CONSTRAINT_ORDER,
} from "./filtering/hardConstraints.js";

export type {
  HardConstraintResult,
  FilterDiagnostics,
  FeasibilityStatus,
  RejectedMentor,
} from "./filtering/hardConstraints.js";

/* Phase 5 — feature engineering and the baseline ranker. */

export {
  FEATURE_NAMES,
  WEIGHTS_VERSION,
  rankingConfig,
  buildFeatures,
  featureApplicability,
  sectionScoreForSkill,
  subjectExpertiseFeature,
  focusSkillStrengthFeature,
  focusSkillStrengthOutcome,
  availabilityFitFeature,
  budgetFitFeature,
  experienceFeature,
  ratingFeature,
  teachingStyleFitFeature,
} from "./features/featureBuilder.js";

export type {
  FeatureName,
  FeatureValues,
  FeatureApplicability,
  FeatureEvidence,
  FeatureOutcome,
  FeatureSet,
  RankingConfig,
  ScoreScale,
} from "./features/featureBuilder.js";

export {
  rankMentors,
  requestAwareWeights,
  validateRankingConfig,
  TIE_BREAK_ORDER,
} from "./ranking/rankerV1.js";

export type { RankedMentor, RankOptions } from "./ranking/rankerV1.js";

export {
  baselineACredentialSort,
  baselineBStaticWeighted,
  BASELINES,
} from "./ranking/baseline.js";

export type {
  BaselineRankedMentor,
  BaselineOptions,
  BaselineName,
} from "./ranking/baseline.js";

/* Phase 6 — explainable Top-K ranking. */

export { explainRecommendations, topKRecommendations } from "./explanation/explainer.js";

export type { ExplainOptions } from "./explanation/explainer.js";

/* Phase 8 — optional semantic parser layer. The engine works without it. */

export { redactPii, containsPii } from "./parsing/types.js";

export type {
  SemanticParser,
  ParseInput,
  ParserInvocationInput,
  ParseResult,
  ParseStatus,
} from "./parsing/types.js";

export { ParseResultSchema } from "./parsing/types.js";

export {
  createDeterministicParser,
  deterministicParser,
  DETERMINISTIC_PARSER_VERSION,
} from "./parsing/deterministicParser.js";

export {
  parseStudentRequest,
  parseStudentRequestSync,
  AsyncParserError,
  DEFAULT_PARSER_TIMEOUT_MS,
} from "./parsing/parseRequest.js";

export type { ParsedRequestResult, ParseOptions, ParserTrace } from "./parsing/parseRequest.js";
