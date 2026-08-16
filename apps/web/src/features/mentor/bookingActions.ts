"use server";

import { can, nextSlotOccurrence } from "@ed4u/domain";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireActor } from "@/lib/authz";
import { createMentorBookingTx } from "@/lib/mentor/bookingTx";
import { recordMentorWaitlistInterest } from "@/lib/mentor/waitlist";
import { parseMentorMatchPayload, parseMentorRunSnapshot } from "@/lib/mentor/schemas";

export interface BookSlotInput {
  mentorId: string;
  slotPattern: string;
  recommendationRunId?: string | null;
}

export type BookSlotResult =
  | { ok: true; bookingId: string; startAt: string; endAt: string; message: string }
  /** DEMO-ONLY outcome. Nothing was booked; the mentor got a waitlist notice. */
  | { ok: false; waitlisted: true; mentorName: string; slotLabel: string | null }
  | { ok: false; waitlisted?: false; error: string };

export async function bookMentorSlotAction(input: BookSlotInput): Promise<BookSlotResult> {
  // Resolved outside the try/catch below: `requireActor` redirects unauthenticated
  // callers by throwing a Next control-flow signal, which must never be swallowed.
  const actor = await requireActor();

  /**
   * Funnels a failed attempt through the demo waitlist when it is enabled.
   *
   * If the interest signal cannot actually be recorded, the real error is
   * returned instead — the UI never claims a mentor was notified unless one was.
   */
  async function fail(error: string): Promise<BookSlotResult> {
    if (!env.DEMO_MENTOR_WAITLIST) return { ok: false, error };
    const waitlisted = await recordMentorWaitlistInterest(db, {
      tenantId: actor.tenantId,
      studentId: actor.userId,
      mentorId: input.mentorId,
      slotPattern: input.slotPattern,
      failureReason: error,
    });
    if (!waitlisted) return { ok: false, error };
    return {
      ok: false,
      waitlisted: true,
      mentorName: waitlisted.mentorName,
      slotLabel: waitlisted.slotLabel,
    };
  }

  try {
    if (!can(actor, "mentor.book")) {
      return await fail("Bạn không có quyền đặt lịch với mentor.");
    }
    if (actor.memberType !== "STUDENT" || actor.membershipStatus !== "ACTIVE") {
      return await fail("Chỉ học sinh đang theo học mới được đặt lịch với mentor.");
    }

    let maxPricePerHour: number | null = null;
    let authoritativeRunId: string | null = null;

    if (input.recommendationRunId) {
      const run = await db.mentorRecommendationRun.findUnique({
        where: { id: input.recommendationRunId },
        include: { request: true },
      });
      if (
        !run ||
        run.request.tenantId !== actor.tenantId ||
        run.request.studentId !== actor.userId
      ) {
        return await fail("Kết quả gợi ý không tồn tại hoặc không thuộc tài khoản của bạn.");
      }

      const payload = parseMentorMatchPayload(run.request.payload);
      const snapshot = parseMentorRunSnapshot(run.result);
      if (!payload || !snapshot) {
        return await fail("Kết quả gợi ý đã lưu không còn đúng định dạng hỗ trợ.");
      }
      if (!snapshot.mentorDisplaySnapshot.some((mentor) => mentor.mentorId === input.mentorId)) {
        return await fail("Mentor này không thuộc kết quả gợi ý đã chọn.");
      }

      maxPricePerHour = payload.canonicalRequest.hardConstraints.maxPricePerHour ?? null;
      authoritativeRunId = run.id;
    }

    const tenant = await db.tenant.findUnique({
      where: { id: actor.tenantId },
      select: { timezone: true },
    });
    if (!tenant) return await fail("Không tìm thấy cấu hình trường học.");

    const { startAt, endAt } = nextSlotOccurrence(input.slotPattern, tenant.timezone, new Date());
    const { booking, mentorName } = await createMentorBookingTx(db, {
      tenantId: actor.tenantId,
      studentId: actor.userId,
      mentorId: input.mentorId,
      slotPattern: input.slotPattern,
      startAt,
      endAt,
      maxPricePerHour,
      recommendationRunId: authoritativeRunId,
    });

    return {
      ok: true,
      bookingId: booking.id,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      message: `Đã ghi nhận lịch mentoring với ${mentorName}.`,
    };
  } catch (error) {
    console.error("bookMentorSlotAction error:", error);
    return await fail(
      error instanceof Error ? error.message : "Đã xảy ra lỗi khi đặt lịch với mentor.",
    );
  }
}
