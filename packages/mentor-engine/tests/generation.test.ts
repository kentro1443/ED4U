/**
 * Phase 3 — reproducible mock data generator.
 *
 * Covers the Test Validation checklist in PLAN.md §Phase 3: seed 42 twice gives
 * the same output, a different seed gives different output, 100% of normal
 * records validate, the IELTS/SAT/HSK mix exists, and the edge-case fixtures are
 * present and intentional.
 *
 * It also guards the committed `data/` files against drift: they must equal
 * what the generator produces today, or the "reproducible" claim is hollow.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  GENERATOR_VERSION,
  REFERENCE_YEAR,
  generateMentors,
  summarizeMentors,
} from "../scripts/generateMentors.js";
import {
  ADVERSARIAL_LABELS,
  generateAdversarialCases,
  generateRequests,
  summarizeRequests,
} from "../scripts/generateRequests.js";
import type { AdversarialCase } from "../scripts/generateRequests.js";
import { DEFAULT_DATASET } from "../scripts/generateDataset.js";
import { SeededRandom } from "../scripts/random.js";
import {
  SCHEMA_BOUNDS,
  credentialKnowledge,
  ieltsOverallFromSections,
  validateMentor,
  validateMentors,
  validateStudentRequest,
} from "../src/index.js";
import type { Mentor } from "../src/index.js";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

/** Reads a committed dataset file. */
function readData<T>(name: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, name), "utf8")) as T;
}

const SEED = DEFAULT_DATASET.seed;

/* -------------------------------------------------------------------------- */

describe("seeded random source", () => {
  /**
   * Draws a whole sequence from ONE generator instance.
   *
   * Creating a fresh `SeededRandom` per element would compare 20 copies of the
   * first value and pass no matter how broken the stepping was — which is
   * exactly the mistake this helper exists to prevent.
   */
  function sequence(seed: number, length: number): number[] {
    const rng = new SeededRandom(seed);
    return Array.from({ length }, () => rng.next());
  }

  it("replays the same full sequence for the same seed", () => {
    const a = sequence(42, 50);
    const b = sequence(42, 50);
    expect(a).toEqual(b);
    // The sequence must actually advance, not repeat one value.
    expect(new Set(a).size).toBeGreaterThan(40);
  });

  it("produces a different sequence for a different seed", () => {
    const a = sequence(42, 50);
    const b = sequence(43, 50);
    expect(a).not.toEqual(b);
    // Not just a shifted copy: the overlap must be minimal.
    const shared = a.filter((value) => b.includes(value));
    expect(shared).toEqual([]);
  });

  it("advances independently per instance", () => {
    const first = new SeededRandom(7);
    const second = new SeededRandom(7);
    first.next();
    // `second` is still at the start, so its first draw equals `first`'s first.
    expect(second.next()).toBe(sequence(7, 1)[0]);
    expect(first.next()).toBe(sequence(7, 2)[1]);
  });

  it("stays inside [0, 1) and respects int bounds", () => {
    const rng = new SeededRandom(1);
    for (let i = 0; i < 500; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      const int = rng.int(3, 7);
      expect(int).toBeGreaterThanOrEqual(3);
      expect(int).toBeLessThanOrEqual(7);
    }
  });

  it("does not mutate the list it shuffles or samples", () => {
    const rng = new SeededRandom(9);
    const source = [1, 2, 3, 4, 5];
    rng.shuffle(source);
    rng.sample(source, 3);
    expect(source).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("reproducibility", () => {
  it("generates identical mentors from the same seed", () => {
    const a = generateMentors({ seed: SEED, count: 120 });
    const b = generateMentors({ seed: SEED, count: 120 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("generates identical requests and adversarial cases from the same seed", () => {
    expect(JSON.stringify(generateRequests({ seed: SEED, count: 80 }))).toBe(
      JSON.stringify(generateRequests({ seed: SEED, count: 80 })),
    );
    expect(JSON.stringify(generateAdversarialCases({ seed: SEED, count: 30 }))).toBe(
      JSON.stringify(generateAdversarialCases({ seed: SEED, count: 30 })),
    );
  });

  it("generates different data from a different seed", () => {
    const a = generateMentors({ seed: SEED, count: 120 });
    const b = generateMentors({ seed: SEED + 1, count: 120 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));

    const requestsA = generateRequests({ seed: SEED, count: 80 });
    const requestsB = generateRequests({ seed: SEED + 1, count: 80 });
    expect(JSON.stringify(requestsA)).not.toBe(JSON.stringify(requestsB));
  });

  it("honours the requested count", () => {
    expect(generateMentors({ seed: SEED, count: 7 })).toHaveLength(7);
    expect(generateRequests({ seed: SEED, count: 13 })).toHaveLength(13);
    expect(generateMentors({ seed: SEED, count: 0 })).toEqual([]);
  });

  it("uses a fixed reference year rather than the wall clock", () => {
    expect(REFERENCE_YEAR).toBe(2026);
  });
});

describe("normal mentor records", () => {
  const mentors = generateMentors({ seed: SEED, count: DEFAULT_DATASET.mentors });

  it("generates at least 500 mentors with unique ids", () => {
    expect(mentors.length).toBeGreaterThanOrEqual(500);
    const result = validateMentors(mentors);
    expect(result.ok).toBe(true);
  });

  it("validates 100% of records", () => {
    const failures = mentors
      .map((mentor, index) => ({ index, result: validateMentor(mentor) }))
      .filter(({ result }) => !result.ok);
    expect(failures).toEqual([]);
  });

  it("covers IELTS, SAT, HSK and multi-domain mentors", () => {
    const summary = summarizeMentors(mentors);
    expect(summary.withIelts).toBeGreaterThan(50);
    expect(summary.withSat).toBeGreaterThan(50);
    expect(summary.withHsk).toBeGreaterThan(50);
    expect(summary.multiDomain).toBeGreaterThan(20);
    expect(Object.keys(summary.byDomainCombination).length).toBeGreaterThanOrEqual(6);
  });

  it("includes unverified mentors and incomplete profiles", () => {
    const summary = summarizeMentors(mentors);
    expect(summary.unverified).toBeGreaterThan(10);
    expect(summary.incompleteProfiles).toBeGreaterThan(10);
    expect(summary.withoutRating).toBeGreaterThan(5);
  });

  it("keeps missing data missing instead of inventing zeros", () => {
    // Incomplete profiles omit credential keys (UNKNOWN); complete profiles
    // assert null for domains they do not hold (KNOWN ABSENT). Both must occur.
    let unknown = 0;
    let absent = 0;
    for (const mentor of mentors) {
      for (const domain of ["IELTS", "SAT", "HSK"] as const) {
        const knowledge = credentialKnowledge(mentor.credentials, domain);
        if (knowledge === "UNKNOWN") unknown++;
        if (knowledge === "ABSENT") absent++;
      }
    }
    expect(unknown).toBeGreaterThan(0);
    expect(absent).toBeGreaterThan(0);

    // A mentor with no rating has no rating key at all — not a 0.
    for (const mentor of mentors) {
      if (mentor.rating !== undefined) expect(mentor.rating).toBeGreaterThan(0);
    }
  });
});

describe("mentor realism (correlated, not independently random)", () => {
  const mentors = generateMentors({ seed: SEED, count: DEFAULT_DATASET.mentors });

  it("declares an IELTS overall consistent with its four sections", () => {
    // Regression: 62 of 294 fully-specified IELTS credentials used to declare an
    // overall their own sections did not support.
    const inconsistent: string[] = [];
    let checked = 0;

    for (const mentor of mentors) {
      const ielts = mentor.credentials.ielts;
      if (
        ielts == null ||
        ielts.listening === undefined ||
        ielts.reading === undefined ||
        ielts.writing === undefined ||
        ielts.speaking === undefined
      ) {
        continue;
      }
      checked++;
      const implied = ieltsOverallFromSections({
        listening: ielts.listening,
        reading: ielts.reading,
        writing: ielts.writing,
        speaking: ielts.speaking,
      });
      if (implied !== ielts.overall) inconsistent.push(`${mentor.id}: ${ielts.overall} != ${implied}`);
    }

    expect(inconsistent).toEqual([]);
    expect(checked).toBeGreaterThan(100);
  });

  it("keeps IELTS section bands close to the overall band", () => {
    for (const mentor of mentors) {
      const ielts = mentor.credentials.ielts;
      if (ielts == null || ielts.writing === undefined) continue;
      for (const band of [ielts.listening, ielts.reading, ielts.writing, ielts.speaking]) {
        if (band === undefined) continue;
        // Sections are drawn within ±1.0 of a target band; the declared overall
        // is derived from them and can sit up to half a band from that target.
        expect(Math.abs(band - ielts.overall)).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it("keeps SAT sections consistent with the total", () => {
    for (const mentor of mentors) {
      const sat = mentor.credentials.sat;
      if (sat == null || sat.math === undefined || sat.readingWriting === undefined) continue;
      expect(sat.math + sat.readingWriting).toBe(sat.total);
    }
  });

  it("ties teaching experience to age", () => {
    for (const mentor of mentors) {
      if (mentor.teachingExperienceMonths === undefined) continue;
      const teachableMonths = Math.max(0, REFERENCE_YEAR - mentor.birthYear - 18) * 12;
      expect(mentor.teachingExperienceMonths).toBeLessThanOrEqual(teachableMonths);
    }
  });

  it("ties sessions completed to experience", () => {
    for (const mentor of mentors) {
      const { teachingExperienceMonths: months, sessionsCompleted: sessions } = mentor;
      if (months === undefined || sessions === undefined) continue;
      // At most ~6 sessions per month taught, plus generator noise.
      expect(sessions).toBeLessThanOrEqual(months * 6 + 30);
    }
  });

  it("only rates mentors who have completed sessions", () => {
    for (const mentor of mentors) {
      if (mentor.rating === undefined) continue;
      expect(mentor.sessionsCompleted ?? 0).toBeGreaterThanOrEqual(5);
    }
  });

  it("prices within a plausible band and correlated with credentials", () => {
    const withTopIelts: number[] = [];
    const withModestIelts: number[] = [];

    for (const mentor of mentors) {
      expect(mentor.pricePerHour).toBeGreaterThanOrEqual(80_000);
      expect(mentor.pricePerHour).toBeLessThanOrEqual(900_000);

      const overall = mentor.credentials.ielts?.overall;
      if (overall === undefined) continue;
      if (overall >= 8.5) withTopIelts.push(mentor.pricePerHour);
      if (overall <= 6.5) withModestIelts.push(mentor.pricePerHour);
    }

    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean(withTopIelts)).toBeGreaterThan(mean(withModestIelts));
  });

  it("only claims expertise in domains the mentor holds a credential for", () => {
    for (const mentor of mentors) {
      const held = new Set<string>();
      if (mentor.credentials.ielts != null) held.add("IELTS");
      if (mentor.credentials.sat != null) held.add("SAT");
      if (mentor.credentials.hsk != null) held.add("HSK");
      for (const skill of mentor.expertise) {
        expect(held).toContain(skill.split(".")[0]);
      }
    }
  });

  it("keeps birth years inside the schema's plausible range", () => {
    for (const mentor of mentors) {
      expect(mentor.birthYear).toBeGreaterThanOrEqual(SCHEMA_BOUNDS.birthYear.min);
      expect(mentor.birthYear).toBeLessThanOrEqual(SCHEMA_BOUNDS.birthYear.max);
    }
  });
});

describe("normal request records", () => {
  const requests = generateRequests({ seed: SEED + 1, count: DEFAULT_DATASET.requests });

  it("generates at least 1,000 requests with unique ids", () => {
    expect(requests.length).toBeGreaterThanOrEqual(1000);
    expect(new Set(requests.map((r) => r.requestId)).size).toBe(requests.length);
  });

  it("validates 100% of records", () => {
    const failures = requests
      .map((request, index) => ({ index, result: validateStudentRequest(request) }))
      .filter(({ result }) => !result.ok);
    expect(failures).toEqual([]);
  });

  it("covers all three domains", () => {
    const summary = summarizeRequests(requests);
    expect(Object.keys(summary.byDomain).sort()).toEqual(["HSK", "IELTS", "SAT"]);
    for (const count of Object.values(summary.byDomain)) expect(count).toBeGreaterThan(50);
  });

  it("varies the constraints instead of repeating one template", () => {
    const summary = summarizeRequests(requests);
    for (const count of [
      summary.verifiedOnly,
      summary.withBudget,
      summary.withMinCredential,
      summary.withRequiredExpertise,
      summary.withFreeText,
      summary.withFocusSkills,
    ]) {
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(requests.length);
    }
  });

  it("keeps goals internally consistent", () => {
    for (const request of requests) {
      const { currentScore, targetScore, domain, focusSkills } = request.goal;
      if (currentScore !== undefined && targetScore !== undefined) {
        expect(targetScore).toBeGreaterThan(currentScore);
      }
      for (const skill of focusSkills) expect(skill.startsWith(`${domain}.`)).toBe(true);
    }
  });

  it("exercises the unknown-input path at volume", () => {
    const withFreeText = requests.filter((r) => r.additionalPreferences.length > 0);
    expect(withFreeText.length).toBeGreaterThan(100);
  });
});

describe("adversarial fixtures", () => {
  const cases = generateAdversarialCases({ seed: SEED + 2, count: DEFAULT_DATASET.adversarial });

  it("generates at least 100 cases with unique ids", () => {
    expect(cases.length).toBeGreaterThanOrEqual(100);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
  });

  it("covers every required adversarial situation", () => {
    const labels = new Set(cases.map((c) => c.label));
    for (const label of ADVERSARIAL_LABELS) expect(labels).toContain(label);
  });

  it("labels every case with a description and an expected behavior", () => {
    for (const adversarialCase of cases) {
      expect(adversarialCase.label).toBeTruthy();
      expect(adversarialCase.description.length).toBeGreaterThan(10);
      expect(adversarialCase.expectedBehavior.length).toBeGreaterThan(10);
      expect(["REQUEST", "MENTOR_DATASET"]).toContain(adversarialCase.target);
      expect(typeof adversarialCase.expectsSchemaValid).toBe("boolean");
    }
  });

  it("carries a payload matching its declared target", () => {
    for (const adversarialCase of cases) {
      if (adversarialCase.target === "MENTOR_DATASET") {
        expect(Array.isArray(adversarialCase.mentors)).toBe(true);
      } else {
        expect(adversarialCase.request).toBeDefined();
      }
    }
  });

  /** Validates a case's payload the way the engine's caller would. */
  function payloadIsValid(adversarialCase: AdversarialCase): boolean {
    const requestOk =
      adversarialCase.request === undefined || validateStudentRequest(adversarialCase.request).ok;
    const mentorsOk =
      adversarialCase.mentors === undefined || validateMentors(adversarialCase.mentors).ok;
    return requestOk && mentorsOk;
  }

  it("means what it says about schema validity", () => {
    for (const adversarialCase of cases) {
      expect(payloadIsValid(adversarialCase), `${adversarialCase.id} ${adversarialCase.label}`).toBe(
        adversarialCase.expectsSchemaValid,
      );
    }
  });

  it("includes both deliberately valid and deliberately invalid payloads", () => {
    const invalid = cases.filter((c) => !c.expectsSchemaValid);
    expect(invalid.length).toBeGreaterThan(10);
    expect(invalid.length).toBeLessThan(cases.length);
  });

  it("catches duplicate mentor ids at the dataset level", () => {
    for (const adversarialCase of cases.filter((c) => c.label === "DUPLICATE_MENTOR_IDS")) {
      const result = validateMentors(adversarialCase.mentors);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.message.includes("Duplicate mentor id"))).toBe(true);
      }
    }
  });

  it("keeps missing-credential mentors valid but genuinely unknown", () => {
    for (const adversarialCase of cases.filter((c) => c.label === "MISSING_CREDENTIAL")) {
      const result = validateMentors(adversarialCase.mentors);
      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const mentor of result.value) {
          expect(credentialKnowledge(mentor.credentials, "IELTS")).toBe("UNKNOWN");
        }
      }
    }
  });

  it("is kept out of the normal datasets", () => {
    const normalIds = new Set(
      generateRequests({ seed: SEED + 1, count: 100 }).map((r) => r.requestId),
    );
    for (const adversarialCase of cases) expect(normalIds.has(adversarialCase.id)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

describe("committed datasets in data/", () => {
  it("match what the generator produces today", () => {
    const mentors = readData<Mentor[]>("mentors.mock.json");
    const requests = readData<unknown[]>("requests.mock.json");
    const adversarial = readData<AdversarialCase[]>("adversarial.mock.json");

    expect(JSON.stringify(mentors)).toBe(
      JSON.stringify(generateMentors({ seed: SEED, count: DEFAULT_DATASET.mentors })),
    );
    expect(JSON.stringify(requests)).toBe(
      JSON.stringify(generateRequests({ seed: SEED + 1, count: DEFAULT_DATASET.requests })),
    );
    expect(JSON.stringify(adversarial)).toBe(
      JSON.stringify(generateAdversarialCases({ seed: SEED + 2, count: DEFAULT_DATASET.adversarial })),
    );
  });

  it("meet the Phase 3 volume minimums", () => {
    expect(readData<unknown[]>("mentors.mock.json").length).toBeGreaterThanOrEqual(500);
    expect(readData<unknown[]>("requests.mock.json").length).toBeGreaterThanOrEqual(1000);
    expect(readData<unknown[]>("adversarial.mock.json").length).toBeGreaterThanOrEqual(100);
  });

  it("carry a manifest recording seed, versions and record counts", () => {
    const manifest = readData<{
      generatorVersion: string;
      seed: number;
      files: { name: string; records: number; sha256: string }[];
      distribution: Record<string, unknown>;
    }>("manifest.json");

    expect(manifest.generatorVersion).toBe(GENERATOR_VERSION);
    expect(manifest.seed).toBe(SEED);
    expect(manifest.files.map((f) => f.name).sort()).toEqual([
      "adversarial.mock.json",
      "mentors.mock.json",
      "requests.mock.json",
    ]);
    for (const file of manifest.files) {
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(file.records).toBeGreaterThan(0);
    }
    expect(Object.keys(manifest.distribution).sort()).toEqual([
      "adversarial",
      "mentors",
      "requests",
    ]);
  });

  it("records SHA-256 hashes that match the files on disk", () => {
    const manifest = readData<{ files: { name: string; sha256: string; bytes: number }[] }>(
      "manifest.json",
    );
    expect(manifest.files.length).toBe(3);

    for (const file of manifest.files) {
      const content = readFileSync(join(DATA_DIR, file.name), "utf8");
      const actual = createHash("sha256").update(content, "utf8").digest("hex");
      expect(actual, `${file.name} content hash`).toBe(file.sha256);
      expect(Buffer.byteLength(content, "utf8"), `${file.name} byte count`).toBe(file.bytes);
    }
  });

  it("would notice a tampered file (hash check is real)", () => {
    const manifest = readData<{ files: { name: string; sha256: string }[] }>("manifest.json");
    const file = manifest.files[0] as { name: string; sha256: string };
    const tampered = `${readFileSync(join(DATA_DIR, file.name), "utf8")} `;
    expect(createHash("sha256").update(tampered, "utf8").digest("hex")).not.toBe(file.sha256);
  });

  it("contains only valid normal records", () => {
    expect(validateMentors(readData<unknown[]>("mentors.mock.json")).ok).toBe(true);
    for (const request of readData<unknown[]>("requests.mock.json")) {
      expect(validateStudentRequest(request).ok).toBe(true);
    }
  });
});
