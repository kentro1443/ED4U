/**
 * Hand-written fixtures for the Phase 1 schema tests.
 *
 * These are plain `unknown`-typed literals on purpose: the tests must exercise
 * the runtime validators the way an adapter would, not lean on TypeScript to
 * pre-guarantee shape.
 */

/** A complete, valid IELTS mentor — mirrors the example in PLAN.md §Phase 1. */
export const ieltsMentor = {
  id: "M001",
  name: "Nguyen Minh Anh",
  birthYear: 2007,
  gender: "female",
  verified: true,
  credentials: {
    ielts: { overall: 8.0, listening: 8.5, reading: 8.0, writing: 7.5, speaking: 7.5 },
    sat: null,
    hsk: null,
  },
  expertise: ["IELTS.WRITING", "IELTS.READING"],
  availability: ["TUE_19_00", "THU_19_00"],
  pricePerHour: 180000,
  teachingExperienceMonths: 12,
  sessionsCompleted: 38,
  rating: 4.8,
  teachingStyles: ["PATIENT", "STRUCTURED"],
};

/** A valid SAT mentor with consistent section scores. */
export const satMentor = {
  id: "M002",
  name: "Tran Quoc Bao",
  birthYear: 2003,
  verified: true,
  credentials: {
    ielts: null,
    sat: { total: 1520, math: 800, readingWriting: 720 },
    hsk: null,
  },
  expertise: ["SAT.MATH"],
  availability: ["MON_20_30"],
  pricePerHour: 350000,
};

/**
 * A valid HSK mentor. IELTS and SAT keys are omitted rather than `null`: we
 * have no information about those domains for this mentor.
 */
export const hskMentor = {
  id: "M003",
  name: "Le Thu Ha",
  birthYear: 1998,
  verified: false,
  credentials: { hsk: { level: 6 } },
  expertise: ["HSK.READING", "HSK.LISTENING"],
  availability: [],
  pricePerHour: 200000,
};

/** A mentor holding credentials in more than one domain. */
export const multiDomainMentor = {
  id: "M004",
  name: "Pham Gia Han",
  birthYear: 2001,
  verified: true,
  credentials: {
    ielts: { overall: 7.5 },
    sat: { total: 1450 },
    hsk: { level: 4 },
  },
  expertise: ["IELTS.SPEAKING", "SAT.READING_WRITING", "HSK.WRITING"],
  availability: ["SAT_09_00", "SUN_09_30"],
  pricePerHour: 0,
  languages: ["VI", "EN", "ZH"],
};

/**
 * The minimum a mentor record can carry: every optional field omitted, and no
 * credential information at all (all three domains UNKNOWN, none asserted absent).
 */
export const minimalMentor = {
  id: "M005",
  name: "Do Van Nam",
  birthYear: 1995,
  verified: false,
  credentials: {},
  expertise: ["IELTS.LISTENING"],
  availability: ["WED_18_00"],
  pricePerHour: 120000,
};

/** A complete, valid student request — mirrors the example in PLAN.md §Phase 1. */
export const ieltsRequest = {
  requestId: "R001",
  goal: {
    domain: "IELTS",
    currentScore: 6.0,
    targetScore: 7.0,
    focusSkills: ["IELTS.WRITING"],
  },
  hardConstraints: {
    verifiedOnly: true,
    maxPricePerHour: 200000,
  },
  availability: ["TUE_19_00", "THU_19_00"],
  softPreferences: {
    teachingStyles: ["PATIENT"],
  },
  additionalPreferences: [],
};

/** The minimum a request can carry: only an identifier and a goal domain. */
export const minimalRequest = {
  requestId: "R002",
  goal: { domain: "SAT" },
};

/**
 * Returns a deep copy of a fixture with one path overridden, so tests can vary
 * a single field without mutating shared fixtures.
 *
 * @param base - Fixture object to clone.
 * @param path - Dotted path to the field to replace, e.g. `credentials.ielts.overall`.
 * @param value - Replacement value; `undefined` deletes the key.
 */
export function withField<T extends object>(base: T, path: string, value: unknown): T {
  const clone = structuredClone(base) as Record<string, unknown>;
  const keys = path.split(".");
  const last = keys.pop() as string;
  let cursor: Record<string, unknown> = clone;
  for (const key of keys) {
    cursor = cursor[key] as Record<string, unknown>;
  }
  if (value === undefined) delete cursor[last];
  else cursor[last] = value;
  return clone as T;
}
