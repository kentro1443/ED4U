import { afterAll, describe, expect, it } from "vitest";
import { routeTeachers } from "../../src/lib/teacher/routing";
import { createTestClient } from "./harness";

const db = createTestClient();

afterAll(async () => db.$disconnect());

describe("teacher routing against real demo data", () => {
  it("filters by responsibility and ranks deterministically by workload", async () => {
    const tenant = await db.tenant.findFirstOrThrow({ where: { slug: "ed4u-demo" } });
    const result = await routeTeachers(db, {
      tenantId: tenant.id,
      rawText: "Em cần giấy xác nhận học sinh để nộp hồ sơ hành chính.",
      limit: 5,
    });
    expect(result.classification.category).toBe("DOCUMENTS");
    expect(result.teachers.length).toBeGreaterThan(0);
    expect(result.teachers.every((teacher) => teacher.responsibilities.includes("DOCUMENTS"))).toBe(
      true,
    );
    expect(result.teachers.map((teacher) => teacher.workloadScore)).toEqual(
      [...result.teachers.map((teacher) => teacher.workloadScore)].sort((a, b) => b - a),
    );
  });
});

describe("teacher routing resolves an explicitly named teacher", () => {
  it("returns the named teacher first, ahead of any workload ranking", async () => {
    const tenant = await db.tenant.findFirstOrThrow({ where: { slug: "ed4u-demo" } });
    const result = await routeTeachers(db, {
      tenantId: tenant.id,
      rawText: "Em muốn gặp thầy Nguyễn Văn Bình ạ.",
      limit: 5,
    });
    expect(result.matchedBy).toBe("NAME");
    expect(result.teachers[0]?.fullName).toBe("Thầy Nguyễn Văn Bình");
  });

  it("matches a teacher addressed only by their given name", async () => {
    const tenant = await db.tenant.findFirstOrThrow({ where: { slug: "ed4u-demo" } });
    const result = await routeTeachers(db, { tenantId: tenant.id, rawText: "Cô Lan", limit: 5 });
    expect(result.matchedBy).toBe("NAME");
    expect(result.teachers[0]?.fullName).toBe("Cô Lan");
  });

  it("matches on the school member code", async () => {
    const tenant = await db.tenant.findFirstOrThrow({ where: { slug: "ed4u-demo" } });
    const result = await routeTeachers(db, { tenantId: tenant.id, rawText: "GV000013", limit: 5 });
    expect(result.matchedBy).toBe("NAME");
    expect(result.teachers[0]?.schoolMemberCode).toBe("GV000013");
  });
});

describe("teacher routing resolves a named subject", () => {
  it("returns only teachers of that subject", async () => {
    const tenant = await db.tenant.findFirstOrThrow({ where: { slug: "ed4u-demo" } });
    const result = await routeTeachers(db, {
      tenantId: tenant.id,
      rawText: "Em bị mất gốc môn Hóa, cần thầy cô kèm thêm.",
      limit: 5,
    });
    expect(result.matchedBy).toBe("SUBJECT");
    expect(result.detectedSubjects).toEqual(["HOA"]);
    expect(result.teachers.length).toBeGreaterThan(0);
    expect(result.teachers.every((teacher) => teacher.subjects.includes("HOA"))).toBe(true);
  });

  it("prefers the subject over the broad ACADEMIC responsibility", async () => {
    const tenant = await db.tenant.findFirstOrThrow({ where: { slug: "ed4u-demo" } });
    const result = await routeTeachers(db, {
      tenantId: tenant.id,
      // Classifies as ACADEMIC *and* names a subject. The subject is the
      // sharper signal, so it must decide the shortlist.
      rawText: "Em cần hỗ trợ học tập môn Toán.",
      limit: 5,
    });
    expect(result.classification.category).toBe("ACADEMIC");
    expect(result.matchedBy).toBe("SUBJECT");
    expect(result.teachers.every((teacher) => teacher.subjects.includes("TOAN"))).toBe(true);
  });
});
