import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestClient } from "./harness";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { recordMentorWaitlistInterest } from "../../src/lib/mentor/waitlist";

/**
 * The demo waitlist fallback is allowed to soften what the *student* sees. It
 * is not allowed to soften what the database records. These tests pin that
 * line: a notification and an audit row appear, a booking never does, and the
 * audit row keeps the real failure reason.
 */
describe("demo mentor waitlist fallback", () => {
  let db: PrismaClient;
  let tenantId: string;
  let studentId: string;
  let mentorUserId: string;
  let mentorProfileId: string;

  beforeAll(async () => {
    db = createTestClient();
    const suffix = randomUUID().slice(0, 8);
    tenantId = randomUUID();
    studentId = randomUUID();
    mentorUserId = randomUUID();
    mentorProfileId = randomUUID();

    const PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=4$dGVzdHNhbHR0ZXN0$0000000000000000000000";

    await db.tenant.create({
      data: {
        id: tenantId,
        slug: `test-waitlist-${suffix}`,
        name: `Waitlist Test ${suffix}`,
        timezone: "Asia/Ho_Chi_Minh",
      },
    });
    await db.user.createMany({
      data: [
        { id: studentId, tenantId, fullName: "Nguyễn Thị Test", passwordHash: PASSWORD_HASH },
        { id: mentorUserId, tenantId, fullName: "Mentor Waitlist", passwordHash: PASSWORD_HASH },
      ],
    });
    await db.mentorProfile.create({
      data: {
        id: mentorProfileId,
        tenantId,
        userId: mentorUserId,
        verified: true,
        headline: "Test mentor",
        expertise: ["IELTS.SPEAKING"],
        availability: ["TUE_19_00"],
        pricePerHour: 200_000,
        graduationYear: 2020,
      },
    });
  });

  afterAll(async () => {
    await db.notification.deleteMany({ where: { tenantId } });
    await db.auditEvent.deleteMany({ where: { tenantId } });
    await db.mentorProfile.deleteMany({ where: { tenantId } });
    await db.user.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
    await db.$disconnect();
  });

  it("notifies the mentor and records the true failure without creating a booking", async () => {
    const result = await recordMentorWaitlistInterest(db, {
      tenantId,
      studentId,
      mentorId: mentorProfileId,
      slotPattern: "TUE_19_00",
      failureReason: "Khung giờ này vừa có học sinh khác đặt trước.",
    });

    expect(result).not.toBeNull();
    expect(result?.mentorName).toBe("Mentor Waitlist");
    expect(result?.slotLabel).toBeTruthy();

    const notification = await db.notification.findFirstOrThrow({
      where: { tenantId, userId: mentorUserId, type: "MENTOR_WAITLIST_INTEREST" },
    });
    // The mentor must be able to tell who wants them and when.
    expect(notification.body).toContain("Nguyễn Thị Test");
    expect(notification.entityId).toBe(mentorProfileId);

    const audit = await db.auditEvent.findFirstOrThrow({
      where: { tenantId, action: "MENTOR_WAITLIST_INTEREST" },
    });
    expect(audit.actorId).toBe(studentId);
    expect(audit.afterJson).toMatchObject({
      booked: false,
      failureReason: "Khung giờ này vừa có học sinh khác đặt trước.",
    });

    // The whole point: nothing was reserved.
    expect(await db.mentorBooking.count({ where: { tenantId } })).toBe(0);
  });

  it("returns null for an unknown mentor so the caller shows the real error", async () => {
    const result = await recordMentorWaitlistInterest(db, {
      tenantId,
      studentId,
      mentorId: randomUUID(),
      slotPattern: "TUE_19_00",
      failureReason: "Mentor không tồn tại trong trường này.",
    });
    expect(result).toBeNull();
  });

  it("still records interest when the slot pattern cannot be parsed", async () => {
    const result = await recordMentorWaitlistInterest(db, {
      tenantId,
      studentId,
      mentorId: mentorProfileId,
      slotPattern: "not-a-slot",
      failureReason: "Khung giờ không hợp lệ.",
    });
    expect(result).not.toBeNull();
    expect(result?.slotLabel).toBeNull();
  });
});
