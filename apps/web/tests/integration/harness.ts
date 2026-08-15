import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

/**
 * Integration tests run against a real PostgreSQL instance — the point is to
 * exercise the queries and transactions the app actually issues, not an
 * in-memory imitation of them.
 *
 * Each run builds its own tenant with a unique id and deletes it afterwards, so
 * tests never depend on, or damage, the seeded demo data.
 */
export const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://ed4u:ed4u_local@127.0.0.1:5434/ed4u";

export function createTestClient(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }) });
}

export interface Fixture {
  tenantId: string;
  otherTenantId: string;
  studentId: string;
  otherStudentId: string;
  teacherId: string;
  otherTeacherId: string;
  classId: string;
  appointmentId: string;
  otherAppointmentId: string;
  applicationId: string;
  otherApplicationId: string;
}

const PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=4$dGVzdHNhbHR0ZXN0$0000000000000000000000";

export async function seedFixture(db: PrismaClient): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();

  await db.tenant.createMany({
    data: [
      { id: tenantId, slug: `test-${suffix}`, name: `Test School ${suffix}` },
      { id: otherTenantId, slug: `other-${suffix}`, name: `Other School ${suffix}` },
    ],
  });

  const [studentId, otherStudentId, teacherId, otherTeacherId] = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ];

  await db.user.createMany({
    data: [
      { id: studentId, tenantId, fullName: "Học sinh A", passwordHash: PASSWORD_HASH },
      { id: otherStudentId, tenantId, fullName: "Học sinh B", passwordHash: PASSWORD_HASH },
      { id: teacherId, tenantId, fullName: "Giáo viên A", passwordHash: PASSWORD_HASH },
      { id: otherTeacherId, tenantId, fullName: "Giáo viên B", passwordHash: PASSWORD_HASH },
    ],
  });

  const classId = randomUUID();
  await db.class.create({
    data: { id: classId, tenantId, code: `T${suffix}`, name: "Test", grade: "10" },
  });

  await db.schoolMembership.createMany({
    data: [
      {
        tenantId,
        userId: studentId,
        schoolMemberCode: `HS-${suffix}-1`,
        memberType: "STUDENT",
        membershipStatus: "ACTIVE",
        classId,
        startedAt: new Date(),
      },
      {
        tenantId,
        userId: otherStudentId,
        schoolMemberCode: `HS-${suffix}-2`,
        memberType: "STUDENT",
        membershipStatus: "ACTIVE",
        classId,
        startedAt: new Date(),
      },
      {
        tenantId,
        userId: teacherId,
        schoolMemberCode: `GV-${suffix}-1`,
        memberType: "TEACHER",
        membershipStatus: "ACTIVE",
        startedAt: new Date(),
      },
      {
        tenantId,
        userId: otherTeacherId,
        schoolMemberCode: `GV-${suffix}-2`,
        memberType: "TEACHER",
        membershipStatus: "ACTIVE",
        startedAt: new Date(),
      },
    ],
  });

  const appointmentId = randomUUID();
  const otherAppointmentId = randomUUID();
  await db.appointment.createMany({
    data: [
      {
        id: appointmentId,
        tenantId,
        studentId,
        teacherId,
        title: "Hẹn của A",
        startAt: new Date("2026-09-01T02:00:00Z"),
        endAt: new Date("2026-09-01T03:00:00Z"),
        status: "REQUESTED",
      },
      {
        id: otherAppointmentId,
        tenantId,
        studentId: otherStudentId,
        teacherId: otherTeacherId,
        title: "Hẹn của B",
        startAt: new Date("2026-09-01T02:00:00Z"),
        endAt: new Date("2026-09-01T03:00:00Z"),
        status: "REQUESTED",
      },
    ],
  });

  const applicationId = randomUUID();
  const otherApplicationId = randomUUID();
  await db.application.createMany({
    data: [
      {
        id: applicationId,
        tenantId,
        studentId,
        currentTeacherId: teacherId,
        rawRequestText: "Đơn của A",
        status: "SUBMITTED",
      },
      {
        id: otherApplicationId,
        tenantId,
        studentId: otherStudentId,
        currentTeacherId: otherTeacherId,
        rawRequestText: "Đơn của B",
        status: "SUBMITTED",
      },
    ],
  });

  return {
    tenantId,
    otherTenantId,
    studentId,
    otherStudentId,
    teacherId,
    otherTeacherId,
    classId,
    appointmentId,
    otherAppointmentId,
    applicationId,
    otherApplicationId,
  };
}

export async function dropFixture(db: PrismaClient, fx: Fixture): Promise<void> {
  const tenants = [fx.tenantId, fx.otherTenantId];
  await db.conversation.deleteMany({
    where: { appointment: { tenantId: { in: tenants } } },
  });
  await db.application.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.appointment.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.notification.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.auditEvent.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.schoolMembership.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.class.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.user.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.tenant.deleteMany({ where: { id: { in: tenants } } });
}
