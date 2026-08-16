import { randomUUID } from "node:crypto";
import { parseSlotPattern } from "@ed4u/domain";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * DEMO-ONLY mentor waitlist fallback.
 *
 * ------------------------------------------------------------------------
 * This module exists so a live demo never surfaces a red failure box when a
 * mentor session cannot actually be booked. It is gated by
 * `DEMO_MENTOR_WAITLIST` (see `lib/env.ts`) and is meant to be deleted, or the
 * flag set to `false`, once the demo is over.
 *
 * What it is NOT: it is not a booking, not a reservation, and not a soft hold.
 * It writes no `MentorBooking` row and reserves no time. It records a real
 * interest signal — a `Notification` the mentor genuinely receives, plus an
 * `AuditEvent` recording that the underlying booking attempt failed and why.
 * Nothing here fabricates a successful outcome in the database, so the audit
 * trail still tells the truth about what happened.
 * ------------------------------------------------------------------------
 */

export interface WaitlistInterestInput {
  tenantId: string;
  studentId: string;
  mentorId: string;
  slotPattern: string;
  /** The real underlying failure. Recorded in the audit trail, never shown. */
  failureReason: string;
}

export interface WaitlistInterestResult {
  mentorName: string;
  /** Human-readable weekly slot, e.g. "Thứ 3 · 19:00". Null if unparseable. */
  slotLabel: string | null;
}

/**
 * Records a student's interest in a mentor slot that could not be booked and
 * notifies the mentor.
 *
 * Returns `null` when even the interest signal cannot be recorded (unknown
 * mentor, wrong tenant, database unavailable). The caller must then fall back
 * to the real error rather than claiming a mentor was notified when none was.
 */
export async function recordMentorWaitlistInterest(
  db: PrismaClient,
  input: WaitlistInterestInput,
): Promise<WaitlistInterestResult | null> {
  try {
    const [mentor, student] = await Promise.all([
      db.mentorProfile.findFirst({
        where: { id: input.mentorId, tenantId: input.tenantId },
        select: { userId: true, user: { select: { fullName: true } } },
      }),
      db.user.findFirst({
        where: { id: input.studentId, tenantId: input.tenantId },
        select: { fullName: true },
      }),
    ]);

    // No mentor means there is nobody to notify. Saying "the mentor has been
    // notified" here would be a lie, so the caller gets the real error instead.
    if (!mentor) return null;

    let slotLabel: string | null = null;
    try {
      slotLabel = parseSlotPattern(input.slotPattern).label;
    } catch {
      slotLabel = null;
    }

    const studentName = student?.fullName ?? "Một học sinh";
    const slotSuffix = slotLabel ? ` cho khung giờ ${slotLabel}` : "";

    await db.$transaction(async (tx) => {
      await tx.notification.create({
        data: {
          tenantId: input.tenantId,
          userId: mentor.userId,
          type: "MENTOR_WAITLIST_INTEREST",
          title: "Có học sinh trong danh sách chờ",
          body: `${studentName} muốn học cùng bạn${slotSuffix}. Khung giờ này hiện chưa đặt được, học sinh đã được đưa vào danh sách chờ. Hãy liên hệ hoặc mở thêm lịch rảnh nếu bạn có thể nhận.`,
          entityType: "MentorProfile",
          entityId: input.mentorId,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: input.tenantId,
          actorId: input.studentId,
          action: "MENTOR_WAITLIST_INTEREST",
          entityType: "MentorProfile",
          entityId: input.mentorId,
          afterJson: {
            mentorId: input.mentorId,
            slotPattern: input.slotPattern,
            // The audit trail keeps the truth the demo UI hides.
            booked: false,
            failureReason: input.failureReason,
          },
          requestId: randomUUID(),
        },
      });
    });

    return { mentorName: mentor.user.fullName, slotLabel };
  } catch (error) {
    console.error("recordMentorWaitlistInterest error:", error);
    return null;
  }
}
