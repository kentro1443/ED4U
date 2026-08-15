import { describe, expect, it } from "vitest";
import { credentialKnowledge, validateMentors } from "@ed4u/mentor-engine";
import {
  birthYearFromDateOfBirth,
  toCanonicalMentor,
  toCanonicalMentors,
  type MentorProfileRow,
} from "@/lib/mentor/adapter";

/**
 * These assertions exist because the prototype's page invented the values the
 * engine needed. The adapter's contract is that it does not: every field comes
 * from a column, and a row that cannot supply a required field is rejected with
 * a reason instead of being completed with a guess.
 */

function row(over: Partial<MentorProfileRow> = {}): MentorProfileRow {
  return {
    id: "mentor-1",
    tenantId: "tenant-1",
    userId: "user-1",
    verified: true,
    headline: "IELTS 8.0 · Writing",
    expertise: ["IELTS.WRITING"],
    availability: ["TUE_19_00"],
    pricePerHour: 300_000,
    graduationYear: 2021,
    credentialsCheckedDomains: [],
    ieltsOverall: null,
    ieltsListening: null,
    ieltsReading: null,
    ieltsWriting: null,
    ieltsSpeaking: null,
    satTotal: null,
    satMath: null,
    satReadingWriting: null,
    hskLevel: null,
    school: null,
    bio: null,
    teachingExperienceMonths: null,
    sessionsCompleted: null,
    rating: null,
    ratingCount: null,
    teachingStyles: [],
    languages: [],
    achievements: [],
    user: {
      id: "user-1",
      fullName: "Nguyễn Thu Hà",
      dateOfBirth: new Date(Date.UTC(2003, 4, 12)),
      gender: "FEMALE",
    },
    ...over,
  };
}

describe("identity", () => {
  it("takes the display name from the user, never the id", () => {
    const mapped = toCanonicalMentor(row());
    expect("reasons" in mapped).toBe(false);
    if ("reasons" in mapped) return;
    expect(mapped.name).toBe("Nguyễn Thu Hà");
    expect(mapped.name).not.toBe(mapped.id);
  });

  it("derives birth year from the real date of birth", () => {
    expect(birthYearFromDateOfBirth(new Date(Date.UTC(2003, 0, 1)))).toBe(2003);
    // A date at the very end of a year must not roll over into the next one.
    expect(birthYearFromDateOfBirth(new Date(Date.UTC(2003, 11, 31)))).toBe(2003);
  });

  it("refuses a mentor with no date of birth instead of inventing one", () => {
    const mapped = toCanonicalMentor(row({ user: { ...row().user, dateOfBirth: null } }));
    expect("reasons" in mapped).toBe(true);
    if (!("reasons" in mapped)) return;
    expect(mapped.reasons.join(" ")).toContain("ngày sinh");
    // The old page hard-coded 2000 here. Nothing may reintroduce that.
    expect(JSON.stringify(mapped)).not.toContain("2000");
  });

  it("refuses a mentor with no declared expertise", () => {
    const mapped = toCanonicalMentor(row({ expertise: [] }));
    expect("reasons" in mapped).toBe(true);
  });
});

describe("credential knowledge states", () => {
  it("omits the key entirely when a domain was never checked", () => {
    const mapped = toCanonicalMentor(row({ credentialsCheckedDomains: [] }));
    if ("reasons" in mapped) throw new Error("expected a mentor");
    expect(Object.hasOwn(mapped.credentials, "ielts")).toBe(false);
    expect(credentialKnowledge(mapped.credentials, "IELTS")).toBe("UNKNOWN");
  });

  it("emits null when a domain was checked and nothing was found", () => {
    const mapped = toCanonicalMentor(
      row({ credentialsCheckedDomains: ["IELTS"], ieltsOverall: null }),
    );
    if ("reasons" in mapped) throw new Error("expected a mentor");
    expect(mapped.credentials.ielts).toBeNull();
    expect(credentialKnowledge(mapped.credentials, "IELTS")).toBe("ABSENT");
  });

  it("emits the credential when a domain was checked and a score exists", () => {
    const mapped = toCanonicalMentor(
      row({ credentialsCheckedDomains: ["IELTS"], ieltsOverall: 7.5 }),
    );
    if ("reasons" in mapped) throw new Error("expected a mentor");
    expect(mapped.credentials.ielts).toEqual({ overall: 7.5 });
    expect(credentialKnowledge(mapped.credentials, "IELTS")).toBe("PRESENT");
  });

  it("keeps the three states apart within a single row", () => {
    const mapped = toCanonicalMentor(
      row({
        credentialsCheckedDomains: ["IELTS", "SAT"],
        ieltsOverall: 6.5,
        satTotal: null,
      }),
    );
    if ("reasons" in mapped) throw new Error("expected a mentor");
    expect(credentialKnowledge(mapped.credentials, "IELTS")).toBe("PRESENT");
    expect(credentialKnowledge(mapped.credentials, "SAT")).toBe("ABSENT");
    expect(credentialKnowledge(mapped.credentials, "HSK")).toBe("UNKNOWN");
  });

  it("carries section bands through only when they exist", () => {
    const mapped = toCanonicalMentor(
      row({
        credentialsCheckedDomains: ["IELTS"],
        ieltsOverall: 8.5,
        ieltsListening: 8.5,
        ieltsReading: 9,
        ieltsWriting: 7.5,
        ieltsSpeaking: 8,
      }),
    );
    if ("reasons" in mapped) throw new Error("expected a mentor");
    expect(mapped.credentials.ielts).toEqual({
      overall: 8.5,
      listening: 8.5,
      reading: 9,
      writing: 7.5,
      speaking: 8,
    });
  });
});

describe("engine boundary", () => {
  it("never leaks UI-only columns into engine input", () => {
    const mapped = toCanonicalMentor(row({ rating: 4.6, ratingCount: 12 }));
    if ("reasons" in mapped) throw new Error("expected a mentor");
    expect(mapped.rating).toBe(4.6);
    // ratingCount, headline, graduationYear and tenantId belong to the UI and
    // the database. The canonical schema is strict and would reject them.
    expect(Object.hasOwn(mapped, "ratingCount")).toBe(false);
    expect(Object.hasOwn(mapped, "headline")).toBe(false);
    expect(Object.hasOwn(mapped, "graduationYear")).toBe(false);
    expect(Object.hasOwn(mapped, "tenantId")).toBe(false);
    expect(Object.hasOwn(mapped, "userId")).toBe(false);
  });

  it("produces input the strict canonical schema accepts", () => {
    const mapped = toCanonicalMentor(
      row({ credentialsCheckedDomains: ["IELTS"], ieltsOverall: 7, rating: 4.5, ratingCount: 20 }),
    );
    if ("reasons" in mapped) throw new Error("expected a mentor");
    const validated = validateMentors([mapped]);
    expect(validated.ok).toBe(true);
  });

  it("omits optional fields rather than defaulting them to zero", () => {
    const mapped = toCanonicalMentor(row());
    if ("reasons" in mapped) throw new Error("expected a mentor");
    for (const key of [
      "rating",
      "sessionsCompleted",
      "teachingExperienceMonths",
      "school",
      "bio",
      "teachingStyles",
      "languages",
      "achievements",
    ]) {
      expect(Object.hasOwn(mapped, key), `${key} must be absent, not defaulted`).toBe(false);
    }
  });

  it("distinguishes an unrecorded gender from a declined one", () => {
    const unrecorded = toCanonicalMentor(row({ user: { ...row().user, gender: null } }));
    if ("reasons" in unrecorded) throw new Error("expected a mentor");
    expect(Object.hasOwn(unrecorded, "gender")).toBe(false);

    const declined = toCanonicalMentor(row({ user: { ...row().user, gender: "UNDISCLOSED" } }));
    if ("reasons" in declined) throw new Error("expected a mentor");
    expect(declined.gender).toBe("undisclosed");
  });
});

describe("batch mapping", () => {
  it("keeps usable and unusable rows apart instead of dropping either", () => {
    const { mentors, failures } = toCanonicalMentors([
      row({ id: "ok-1" }),
      row({ id: "bad-1", user: { ...row().user, dateOfBirth: null } }),
      row({ id: "ok-2" }),
    ]);
    expect(mentors.map((m) => m.id)).toEqual(["ok-1", "ok-2"]);
    expect(failures.map((f) => f.mentorId)).toEqual(["bad-1"]);
    expect(failures[0]!.displayName).toBe("Nguyễn Thu Hà");
  });
});
