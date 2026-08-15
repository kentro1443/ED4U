/**
 * Reproducible mentor generator.
 *
 * The point of this file is *realism under a fixed seed*. Independently random
 * fields would produce a dataset that ranks trivially and hides every bug that
 * matters: a mentor with IELTS 9.0 whose writing is 4.5, a 19-year-old with ten
 * years of teaching experience, a 500,000 VND/hour mentor with no credential.
 * Every field here is therefore drawn *conditionally* on the ones before it.
 *
 * The generator is a script, not part of the shipped package: `tsconfig.build`
 * compiles `src/` only.
 *
 * Usage:
 * ```bash
 * npx tsx scripts/generateMentors.ts --seed 42 --count 500
 * ```
 */

import { SeededRandom, clamp, roundToHalf, roundToStep } from "./random.js";
import type { Domain, Mentor } from "../src/index.js";
import { SKILLS, ieltsOverallFromSections } from "../src/index.js";

/** Version of the generation logic. Bump when the output distribution changes. */
export const GENERATOR_VERSION = "mock-generator-v1.1.0";

/**
 * Fixed "current year" for age arithmetic.
 *
 * Deliberately a constant rather than `new Date()`: a dataset regenerated next
 * January must be byte-identical to the one committed today.
 */
export const REFERENCE_YEAR = 2026;

/** Options accepted by {@link generateMentors}. */
export interface GenerateMentorsOptions {
  /** Integer seed; the same seed always yields the same dataset. */
  seed: number;
  /** How many mentors to generate. */
  count: number;
}

/* -------------------------------------------------------------------------- */
/* Name and profile pools                                                     */
/* -------------------------------------------------------------------------- */

const SURNAMES = [
  "Nguyen", "Tran", "Le", "Pham", "Hoang", "Phan", "Vu", "Dang", "Bui", "Do",
  "Ho", "Ngo", "Duong", "Ly", "Dinh", "Truong", "Mai", "Cao",
] as const;

const MIDDLE_NAMES = ["Minh", "Thi", "Van", "Gia", "Quoc", "Thu", "Hai", "Ngoc", "Anh", "Khanh"] as const;

const FEMALE_GIVEN = [
  "Anh", "Chi", "Dung", "Ha", "Hoa", "Huong", "Lan", "Linh", "Mai", "Ngan",
  "Nhi", "Phuong", "Quyen", "Thao", "Trang", "Uyen", "Van", "Yen",
] as const;

const MALE_GIVEN = [
  "An", "Bao", "Cuong", "Dat", "Duc", "Hieu", "Hung", "Khoa", "Long", "Minh",
  "Nam", "Phuc", "Quan", "Son", "Tuan", "Vinh", "Bach", "Kien",
] as const;

const SCHOOLS = [
  "Đại học Ngoại thương",
  "Đại học Hà Nội",
  "Đại học Quốc gia Hà Nội",
  "Đại học Kinh tế Quốc dân",
  "Đại học Sư phạm Hà Nội",
  "Đại học Bách khoa Hà Nội",
  "Đại học Quốc gia TP.HCM",
  "RMIT Việt Nam",
  "Đại học Ngoại ngữ - ĐHQGHN",
] as const;

const TEACHING_STYLE_POOL = [
  "PATIENT", "STRUCTURED", "EXAM_FOCUSED", "CONVERSATIONAL",
  "INTENSIVE", "FLEXIBLE", "ANALYTICAL", "MOTIVATING",
] as const;

/** Availability pool, skewed to when Vietnamese students actually study. */
const SLOT_POOL: readonly string[] = (() => {
  const slots: string[] = [];
  for (const day of ["MON", "TUE", "WED", "THU", "FRI"]) {
    for (const time of ["18_00", "18_30", "19_00", "19_30", "20_00", "20_30", "21_00"]) {
      slots.push(`${day}_${time}`);
    }
  }
  for (const day of ["SAT", "SUN"]) {
    for (const time of ["08_00", "09_00", "09_30", "10_00", "14_00", "15_00", "19_00", "20_00"]) {
      slots.push(`${day}_${time}`);
    }
  }
  return slots;
})();

/** Which domains a mentor holds credentials in, with realistic frequencies. */
const DOMAIN_MIX: readonly (readonly [readonly Domain[], number])[] = [
  [["IELTS"], 0.44],
  [["SAT"], 0.16],
  [["HSK"], 0.12],
  [["IELTS", "SAT"], 0.11],
  [["IELTS", "HSK"], 0.08],
  [["SAT", "HSK"], 0.04],
  [["IELTS", "SAT", "HSK"], 0.05],
];

/* -------------------------------------------------------------------------- */
/* Credential generation                                                      */
/* -------------------------------------------------------------------------- */

/** Draws an IELTS overall band, skewed toward the 7.0–8.0 teaching range. */
function drawIeltsOverall(rng: SeededRandom): number {
  return rng.weighted([
    [6.0, 0.05], [6.5, 0.1], [7.0, 0.22], [7.5, 0.25],
    [8.0, 0.22], [8.5, 0.11], [9.0, 0.05],
  ]);
}

/**
 * Builds a self-consistent IELTS credential.
 *
 * Sections cluster around a drawn target band, with productive skills (writing,
 * speaking) skewing lower than receptive ones — the real-world pattern, and the
 * reason `focusSkillStrength` will later be a meaningful feature rather than
 * noise. The declared `overall` is then *derived* from those sections, so the
 * credential can never contradict itself.
 */
function makeIeltsCredential(rng: SeededRandom): Record<string, number> {
  const target = drawIeltsOverall(rng);
  const offset = (weights: readonly (readonly [number, number])[]) =>
    clamp(roundToHalf(target + rng.weighted(weights)), 0, 9);

  // 20% of mentors publish only their overall band: missing, not zero.
  if (!rng.bool(0.8)) return { overall: target };

  const sections = {
    listening: offset([[0.5, 0.35], [0, 0.4], [-0.5, 0.25]]),
    reading: offset([[0.5, 0.3], [0, 0.45], [-0.5, 0.25]]),
    writing: offset([[0, 0.3], [-0.5, 0.45], [-1, 0.25]]),
    speaking: offset([[0.5, 0.15], [0, 0.4], [-0.5, 0.35], [-1, 0.1]]),
  };

  // The drawn band is only a *target*: once four sections exist, the overall is
  // whatever they imply. Declaring the target instead would produce credentials
  // that contradict themselves — real certificates never do.
  return { overall: ieltsOverallFromSections(sections), ...sections };
}

/**
 * Builds a SAT credential where the sections actually add up to the total.
 *
 * The schema enforces `total === math + readingWriting`; generating them
 * independently would produce a dataset that fails its own validation.
 */
function makeSatCredential(rng: SeededRandom): Record<string, number> {
  const total = rng.weighted([
    [1200, 0.08], [1280, 0.14], [1350, 0.2], [1420, 0.22],
    [1480, 0.18], [1530, 0.12], [1580, 0.06],
  ]);

  if (rng.bool(0.25)) return { total };

  // Vietnamese SAT takers typically score higher on Math than on Reading-Writing.
  let math = clamp(roundToStep(total * 0.52 + rng.normal(0, 25), 10), 200, 800);
  let readingWriting = total - math;

  if (readingWriting > 800) {
    readingWriting = 800;
    math = total - readingWriting;
  } else if (readingWriting < 200) {
    readingWriting = 200;
    math = total - readingWriting;
  }

  return { total, math, readingWriting };
}

/** Builds an HSK credential, skewed to the levels people actually teach. */
function makeHskCredential(rng: SeededRandom): Record<string, number> {
  return { level: rng.weighted([[3, 0.1], [4, 0.25], [5, 0.35], [6, 0.3]]) };
}

/* -------------------------------------------------------------------------- */
/* Derived attributes                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Picks the skills a mentor teaches, drawn only from domains they hold a
 * credential in — a mentor cannot teach an exam they have not sat.
 */
function makeExpertise(rng: SeededRandom, domains: readonly Domain[]): string[] {
  const expertise: string[] = [];

  for (const domain of domains) {
    const domainSkills = SKILLS.filter((skill) => skill.startsWith(`${domain}.`));
    const take = rng.weighted([
      [1, 0.35], [2, 0.4], [3, 0.2], [domainSkills.length, 0.05],
    ]);
    for (const skill of rng.sample(domainSkills, Math.min(take, domainSkills.length))) {
      if (!expertise.includes(skill)) expertise.push(skill);
    }
  }

  // Guaranteed non-empty: every mentor holds at least one domain.
  if (expertise.length === 0) expertise.push(rng.pick(SKILLS));
  return expertise.sort();
}

/**
 * Derives an hourly price from credential strength and experience.
 *
 * Price is the field a student feels most directly, so it must correlate with
 * something. A flat random price would make `budgetFit` a lottery.
 */
function makePrice(
  rng: SeededRandom,
  credentials: { ielts?: { overall: number }; sat?: { total: number }; hsk?: { level: number } },
  experienceMonths: number,
  verified: boolean,
): number {
  let base = 150_000;

  if (credentials.ielts !== undefined) {
    const { overall } = credentials.ielts;
    base = Math.max(base, overall >= 8.5 ? 400_000 : overall >= 8 ? 320_000 : overall >= 7.5 ? 250_000 : 190_000);
  }
  if (credentials.sat !== undefined) {
    const { total } = credentials.sat;
    base = Math.max(base, total >= 1520 ? 420_000 : total >= 1420 ? 330_000 : 240_000);
  }
  if (credentials.hsk !== undefined) {
    base = Math.max(base, credentials.hsk.level >= 6 ? 300_000 : 200_000);
  }

  const experienceMultiplier = 1 + Math.min(experienceMonths, 120) / 120 * 0.35;
  const trustMultiplier = verified ? 1 : 0.85;
  const jitter = 1 + rng.normal(0, 0.08);

  return clamp(
    roundToStep(base * experienceMultiplier * trustMultiplier * jitter, 10_000),
    80_000,
    900_000,
  );
}

/* -------------------------------------------------------------------------- */
/* Mentor generation                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Generates one mentor.
 *
 * @param rng - Seeded source; consumed in a fixed order so the output is stable.
 * @param index - Zero-based index, used for the mentor id.
 */
function generateMentor(rng: SeededRandom, index: number): Mentor {
  const id = `M${String(index + 1).padStart(4, "0")}`;

  /* Identity ------------------------------------------------------------- */
  const genderValue = rng.weighted([
    ["female", 0.55], ["male", 0.4], ["other", 0.03], ["undisclosed", 0.02],
  ] as const);
  const given = genderValue === "male" ? rng.pick(MALE_GIVEN) : rng.pick(FEMALE_GIVEN);
  const name = `${rng.pick(SURNAMES)} ${rng.pick(MIDDLE_NAMES)} ${given}`;

  const birthYear = rng.weighted([
    [rng.int(1985, 1994), 0.18],
    [rng.int(1995, 1999), 0.32],
    [rng.int(2000, 2003), 0.32],
    [rng.int(2004, 2007), 0.18],
  ]);

  /* Experience, correlated with age -------------------------------------- */
  const age = REFERENCE_YEAR - birthYear;
  const teachableYears = Math.max(0, age - 18);
  const experienceMonths = Math.round(
    clamp(teachableYears * 12 * (0.2 + rng.next() * 0.7), 0, 240),
  );
  const sessionsCompleted = Math.max(
    0,
    Math.round(experienceMonths * (1 + rng.next() * 5) + rng.normal(0, 8)),
  );

  /* Credentials ---------------------------------------------------------- */
  const domains = rng.weighted(DOMAIN_MIX);
  const held: Record<string, unknown> = {};
  if (domains.includes("IELTS")) held.ielts = makeIeltsCredential(rng);
  if (domains.includes("SAT")) held.sat = makeSatCredential(rng);
  if (domains.includes("HSK")) held.hsk = makeHskCredential(rng);

  const verified = rng.bool(0.82);
  const incompleteProfile = rng.bool(0.12);

  /**
   * Credentials, respecting the three-valued contract:
   * a complete profile asserts `null` for domains the mentor does not hold
   * (KNOWN ABSENT); an incomplete profile omits them entirely (UNKNOWN).
   */
  const credentials: Record<string, unknown> = {};
  for (const key of ["ielts", "sat", "hsk"] as const) {
    if (held[key] !== undefined) credentials[key] = held[key];
    else if (!incompleteProfile) credentials[key] = null;
  }

  /* Everything else ------------------------------------------------------ */
  const pricePerHour = makePrice(rng, held, experienceMonths, verified);

  const slotCount = rng.weighted([[0, 0.03], [1, 0.07], [2, 0.15], [3, 0.2], [4, 0.2], [5, 0.15], [6, 0.1], [8, 0.1]]);
  const availability = rng.sample(SLOT_POOL, slotCount).sort();

  const languages = ["VI"];
  if (domains.includes("IELTS") || domains.includes("SAT")) languages.push("EN");
  if (domains.includes("HSK")) languages.push("ZH");

  const mentor: Record<string, unknown> = {
    id,
    name,
    birthYear,
    verified,
    credentials,
    expertise: makeExpertise(rng, domains),
    availability,
    pricePerHour,
  };

  // Optional fields. An incomplete profile omits most of them — and omission
  // must stay omission, never a fabricated zero or an empty string.
  if (!incompleteProfile || rng.bool(0.5)) mentor.gender = genderValue;
  if (!incompleteProfile) {
    mentor.school = rng.pick(SCHOOLS);
    mentor.teachingExperienceMonths = experienceMonths;
    mentor.sessionsCompleted = sessionsCompleted;
    mentor.teachingStyles = rng.sample(TEACHING_STYLE_POOL, rng.int(1, 3)).sort();
    mentor.languages = languages;

    // A rating is only meaningful once there are sessions behind it.
    if (sessionsCompleted >= 5) {
      mentor.rating = clamp(
        Math.round((4.4 + rng.normal(0, 0.35)) * 10) / 10,
        3,
        5,
      );
    }
    if (rng.bool(0.6)) {
      mentor.bio = `${name.split(" ").pop() ?? name} đã đồng hành cùng ${sessionsCompleted} buổi học, tập trung vào ${domains.join("/")}.`;
    }
    if (rng.bool(0.35)) {
      mentor.achievements = rng.sample(
        [
          "Học bổng toàn phần",
          "Giải Nhì HSG Tiếng Anh cấp tỉnh",
          "Trợ giảng tại trung tâm luyện thi",
          "Top 1% điểm thi quốc gia",
        ],
        rng.int(1, 2),
      );
    }
  } else if (rng.bool(0.5)) {
    mentor.teachingExperienceMonths = experienceMonths;
  }

  return mentor as unknown as Mentor;
}

/**
 * Generates a reproducible mentor dataset.
 *
 * @param options - Seed and count.
 * @returns Mentors with unique ids, in generation order.
 */
export function generateMentors({ seed, count }: GenerateMentorsOptions): Mentor[] {
  const rng = new SeededRandom(seed);
  return Array.from({ length: count }, (_, index) => generateMentor(rng, index));
}

/* -------------------------------------------------------------------------- */
/* Distribution summary                                                       */
/* -------------------------------------------------------------------------- */

/** Aggregate shape of a generated mentor dataset. */
export interface MentorDistribution {
  count: number;
  verified: number;
  unverified: number;
  byDomainCombination: Record<string, number>;
  withIelts: number;
  withSat: number;
  withHsk: number;
  multiDomain: number;
  incompleteProfiles: number;
  withoutRating: number;
  withoutAvailability: number;
  price: { min: number; median: number; max: number };
  ieltsOverall: Record<string, number>;
}

/** Returns the median of a numeric list (lower median for even lengths). */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
}

/**
 * Summarises a mentor dataset so a human can sanity-check the mix.
 *
 * @param mentors - Generated mentors.
 */
export function summarizeMentors(mentors: readonly Mentor[]): MentorDistribution {
  const byDomainCombination: Record<string, number> = {};
  const ieltsOverall: Record<string, number> = {};
  const prices: number[] = [];
  let verified = 0;
  let withIelts = 0;
  let withSat = 0;
  let withHsk = 0;
  let multiDomain = 0;
  let incompleteProfiles = 0;
  let withoutRating = 0;
  let withoutAvailability = 0;

  for (const mentor of mentors) {
    const held: string[] = [];
    if (mentor.credentials.ielts != null) held.push("IELTS");
    if (mentor.credentials.sat != null) held.push("SAT");
    if (mentor.credentials.hsk != null) held.push("HSK");

    const key = held.length === 0 ? "NONE" : held.join("+");
    byDomainCombination[key] = (byDomainCombination[key] ?? 0) + 1;

    if (held.includes("IELTS")) withIelts++;
    if (held.includes("SAT")) withSat++;
    if (held.includes("HSK")) withHsk++;
    if (held.length > 1) multiDomain++;
    if (mentor.verified) verified++;
    if (mentor.rating === undefined) withoutRating++;
    if (mentor.availability.length === 0) withoutAvailability++;
    if (mentor.school === undefined) incompleteProfiles++;

    if (mentor.credentials.ielts != null) {
      const band = mentor.credentials.ielts.overall.toFixed(1);
      ieltsOverall[band] = (ieltsOverall[band] ?? 0) + 1;
    }
    prices.push(mentor.pricePerHour);
  }

  return {
    count: mentors.length,
    verified,
    unverified: mentors.length - verified,
    byDomainCombination: Object.fromEntries(Object.entries(byDomainCombination).sort()),
    withIelts,
    withSat,
    withHsk,
    multiDomain,
    incompleteProfiles,
    withoutRating,
    withoutAvailability,
    price: {
      min: Math.min(...prices),
      median: median(prices),
      max: Math.max(...prices),
    },
    ieltsOverall: Object.fromEntries(Object.entries(ieltsOverall).sort()),
  };
}
