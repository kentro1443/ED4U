import { randomUUID } from "node:crypto";
import { ConflictError, ForbiddenError, recheckMentorBooking } from "@ed4u/domain";
import type { PrismaClient } from "@/generated/prisma/client";

export interface CreateMentorBookingTxInput {
  tenantId: string;
  studentId: string;
  mentorId: string;
  slotPattern: string;
  startAt: Date;
  endAt: Date;
  maxPricePerHour: number | null;
  recommendationRunId?: string | null;
}

/**
 * The only web-layer write path for a concrete mentor session.
 *
 * PostgreSQL advisory locking serializes bookings for one mentor while the
 * overlap check + live eligibility check + insert run in the same transaction.
 * This closes the classic "both readers saw no conflict" race without turning a
 * recurring weekly pattern into a permanent reservation.
 */
export async function createMentorBookingTx(db: PrismaClient, input: CreateMentorBookingTxInput) {
  return db.$transaction(async (tx) => {
    const lockKey = `${input.tenantId}:${input.mentorId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))::text AS locked`;

    const mentor = await tx.mentorProfile.findFirst({
      where: { id: input.mentorId, tenantId: input.tenantId },
      include: {
        user: {
          include: {
            roles: true,
            memberships: { where: { tenantId: input.tenantId } },
          },
        },
      },
    });

    if (!mentor) throw new ForbiddenError("Mentor không tồn tại trong trường này.");
    if (!mentor.user.roles.some((assignment) => assignment.role === "MENTOR")) {
      throw new ForbiddenError("Tài khoản này không còn vai trò Mentor.");
    }

    const membership = mentor.user.memberships[0];
    if (!membership) throw new ForbiddenError("Mentor không còn tư cách thành viên của trường.");

    const existingBookings = await tx.mentorBooking.findMany({
      where: {
        tenantId: input.tenantId,
        mentorId: input.mentorId,
        cancelledAt: null,
        startAt: { lt: input.endAt },
        endAt: { gt: input.startAt },
      },
      select: { startAt: true, endAt: true },
    });

    const recheck = recheckMentorBooking(
      {
        mentorId: mentor.id,
        tenantId: mentor.tenantId,
        verified: mentor.verified,
        membershipStatus: membership.membershipStatus,
        availableSlots: mentor.availability,
        pricePerHour: mentor.pricePerHour,
        existingBookings,
      },
      {
        tenantId: input.tenantId,
        studentId: input.studentId,
        mentorId: input.mentorId,
        slotPattern: input.slotPattern,
        startAt: input.startAt,
        endAt: input.endAt,
        maxPricePerHour: input.maxPricePerHour,
      },
    );

    if (!recheck.ok) throw recheck.error;
    if (existingBookings.length > 0) {
      throw new ConflictError(
        "Khung giờ này vừa có học sinh khác đặt trước. Vui lòng chọn giờ khác.",
      );
    }

    const booking = await tx.mentorBooking.create({
      data: {
        tenantId: input.tenantId,
        studentId: input.studentId,
        mentorId: input.mentorId,
        slotPattern: input.slotPattern,
        startAt: input.startAt,
        endAt: input.endAt,
        recommendationRunId: input.recommendationRunId ?? null,
      },
    });

    await Promise.all([
      tx.notification.create({
        data: {
          tenantId: input.tenantId,
          userId: mentor.userId,
          type: "MENTOR_BOOKING_CREATED",
          title: "Có lịch mentoring mới",
          body: "Một học sinh đã đặt một khung giờ mentoring với bạn.",
          entityType: "MentorBooking",
          entityId: booking.id,
        },
      }),
      tx.auditEvent.create({
        data: {
          tenantId: input.tenantId,
          actorId: input.studentId,
          action: "MENTOR_BOOKING_CREATE",
          entityType: "MentorBooking",
          entityId: booking.id,
          afterJson: {
            mentorId: input.mentorId,
            slotPattern: input.slotPattern,
            startAt: input.startAt.toISOString(),
            endAt: input.endAt.toISOString(),
            recommendationRunId: input.recommendationRunId ?? null,
          },
          requestId: randomUUID(),
        },
      }),
    ]);

    return { booking, mentorName: mentor.user.fullName };
  });
}
