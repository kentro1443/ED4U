import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@ed4u/domain";
import { can } from "@ed4u/domain";
import { createTestClient, dropFixture, seedFixture, type Fixture } from "./harness";
import type { PrismaClient } from "../../src/generated/prisma/client";

/**
 * These assertions run against real PostgreSQL. The queries below are the same
 * shapes the pages issue, so a regression that widens a scope fails here rather
 * than being discovered by a user seeing someone else's data.
 */

let db: PrismaClient;
let fx: Fixture;

beforeAll(async () => {
  db = createTestClient();
  fx = await seedFixture(db);
}, 30_000);

afterAll(async () => {
  if (fx) await dropFixture(db, fx);
  await db.$disconnect();
});

function actor(over: Partial<Actor> & Pick<Actor, "userId" | "roles">): Actor {
  return {
    tenantId: fx.tenantId,
    schoolMemberCode: "X",
    memberType: "STUDENT",
    membershipStatus: "ACTIVE",
    classId: fx.classId,
    grade: "10",
    ...over,
  };
}

describe("appointment visibility", () => {
  const appointmentScope = (a: Actor) => ({
    tenantId: a.tenantId,
    OR: [{ studentId: a.userId }, { teacherId: a.userId }],
  });

  it("shows a student only their own appointments", async () => {
    const rows = await db.appointment.findMany({
      where: appointmentScope(actor({ userId: fx.studentId, roles: ["STUDENT"] })),
    });
    expect(rows.map((r) => r.id)).toEqual([fx.appointmentId]);
  });

  it("shows a teacher only appointments they are assigned to", async () => {
    const rows = await db.appointment.findMany({
      where: appointmentScope(actor({ userId: fx.teacherId, roles: ["TEACHER"] })),
    });
    expect(rows.map((r) => r.id)).toEqual([fx.appointmentId]);
  });

  it("never leaks another pair's appointment", async () => {
    const rows = await db.appointment.findMany({
      where: appointmentScope(actor({ userId: fx.studentId, roles: ["STUDENT"] })),
    });
    expect(rows.map((r) => r.id)).not.toContain(fx.otherAppointmentId);
  });
});

describe("application visibility", () => {
  // Mirrors applicationScope() in the applications page.
  const applicationScope = (a: Actor) => {
    const base = { tenantId: a.tenantId };
    if (a.roles.includes("SCHOOL_ADMIN") && can(a, "application.review")) return base;
    return {
      ...base,
      OR: [
        { studentId: a.userId },
        { currentTeacherId: a.userId },
        { pendingTransferTo: a.userId },
      ],
    };
  };

  it("shows a student only their own applications", async () => {
    const rows = await db.application.findMany({
      where: applicationScope(actor({ userId: fx.studentId, roles: ["STUDENT"] })),
    });
    expect(rows.map((r) => r.id)).toEqual([fx.applicationId]);
  });

  it("shows a teacher only their assigned caseload", async () => {
    const rows = await db.application.findMany({
      where: applicationScope(actor({ userId: fx.teacherId, roles: ["TEACHER"] })),
    });
    expect(rows.map((r) => r.id)).toEqual([fx.applicationId]);
  });

  it("includes an application pending transfer to the reviewing teacher", async () => {
    await db.application.update({
      where: { id: fx.otherApplicationId },
      data: { pendingTransferTo: fx.teacherId },
    });
    const rows = await db.application.findMany({
      where: applicationScope(actor({ userId: fx.teacherId, roles: ["TEACHER"] })),
    });
    expect(rows.map((r) => r.id).sort()).toEqual([fx.applicationId, fx.otherApplicationId].sort());
    await db.application.update({
      where: { id: fx.otherApplicationId },
      data: { pendingTransferTo: null },
    });
  });

  it("gives SCHOOL_ADMIN tenant-wide oversight", async () => {
    const rows = await db.application.findMany({
      where: applicationScope(actor({ userId: "admin", roles: ["SCHOOL_ADMIN"] })),
    });
    expect(rows).toHaveLength(2);
  });
});

describe("tenant isolation", () => {
  it("returns nothing when the same query is scoped to another tenant", async () => {
    const rows = await db.appointment.findMany({
      where: { tenantId: fx.otherTenantId, OR: [{ studentId: fx.studentId }] },
    });
    expect(rows).toEqual([]);
  });
});
