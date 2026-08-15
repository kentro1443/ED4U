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
