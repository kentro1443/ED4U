"use server";

import { can, nextSlotOccurrence } from "@ed4u/domain";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { createMentorBookingTx } from "@/lib/mentor/bookingTx";
import { parseMentorMatchPayload, parseMentorRunSnapshot } from "@/lib/mentor/schemas";

export interface BookSlotInput {
  mentorId: string;
  slotPattern: string;
  recommendationRunId?: string | null;
}

export async function bookMentorSlotAction(
  input: BookSlotInput,
): Promise<
  | { ok: true; bookingId: string; startAt: string; endAt: string; message: string }
  | { ok: false; error: string }
> {
  try {
    const actor = await requireActor();
    if (!can(actor, "mentor.book")) {
      return { ok: false, error: "Bạn không có quyền đặt lịch với mentor." };
    }
    if (actor.memberType !== "STUDENT" || actor.membershipStatus !== "ACTIVE") {
      return { ok: false, error: "Chỉ học sinh đang theo học mới được đặt lịch với mentor." };
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
        return {
          ok: false,
          error: "Kết quả gợi ý không tồn tại hoặc không thuộc tài khoản của bạn.",
        };
      }

      const payload = parseMentorMatchPayload(run.request.payload);
      const snapshot = parseMentorRunSnapshot(run.result);
      if (!payload || !snapshot) {
        return { ok: false, error: "Kết quả gợi ý đã lưu không còn đúng định dạng hỗ trợ." };
      }
      if (!snapshot.mentorDisplaySnapshot.some((mentor) => mentor.mentorId === input.mentorId)) {
        return { ok: false, error: "Mentor này không thuộc kết quả gợi ý đã chọn." };
      }

      maxPricePerHour = payload.canonicalRequest.hardConstraints.maxPricePerHour ?? null;
      authoritativeRunId = run.id;
    }

    const tenant = await db.tenant.findUnique({
      where: { id: actor.tenantId },
      select: { timezone: true },
    });
    if (!tenant) return { ok: false, error: "Không tìm thấy cấu hình trường học." };

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
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Đã xảy ra lỗi khi đặt lịch với mentor.",
    };
  }
}
