import { ConflictError, ForbiddenError, ValidationError, err, ok, type Result } from "../errors";

export interface LiveMentorState {
  mentorId: string;
  tenantId: string;
  verified: boolean;
  membershipStatus: "GRADUATED" | "ACTIVE" | "LEFT_SCHOOL" | "SUSPENDED";
  availableSlots: readonly string[];
  pricePerHour: number;
}

export interface BookingIntent {
  tenantId: string;
  studentId: string;
  mentorId: string;
  slot: string;
  maxPricePerHour: number | null;
}

/**
 * Recommendation is not reservation. Booking re-fetches live mentor state and
 * re-checks eligibility + availability before any write.
 */
export function recheckMentorBooking(
  live: LiveMentorState,
  intent: BookingIntent,
): Result<{ mentorId: string; slot: string }, ConflictError | ForbiddenError | ValidationError> {
  if (live.tenantId !== intent.tenantId) {
    return err(new ForbiddenError("Mentor không thuộc trường này.", { reason: "CROSS_TENANT" }));
  }
  if (live.mentorId !== intent.mentorId) {
    return err(new ValidationError("Mentor không khớp."));
  }
  if (live.membershipStatus !== "GRADUATED") {
    return err(new ForbiddenError("Mentor không còn đủ điều kiện (cần đã tốt nghiệp)."));
  }
  if (!live.verified) {
    return err(new ForbiddenError("Mentor chưa được xác minh."));
  }
  if (!live.availableSlots.includes(intent.slot)) {
    return err(
      new ConflictError("Khung giờ mentor không còn trống. Hãy chọn lại.", { slot: intent.slot }),
    );
  }
  if (intent.maxPricePerHour != null && live.pricePerHour > intent.maxPricePerHour) {
    return err(
      new ConflictError("Giá mentor vượt ngân sách đã chọn.", { price: live.pricePerHour }),
    );
  }
  return ok({ mentorId: live.mentorId, slot: intent.slot });
}

export interface MentorAdapterRow {
  id: string;
  tenantId: string;
  verified: boolean;
  name: string;
  expertise: string[];
  availability: string[];
  pricePerHour: number;
}

/** Adapter validates tenant scope before the engine ever sees a candidate. */
export function toEngineCandidates<T extends MentorAdapterRow>(
  rows: readonly T[],
  tenantId: string,
): T[] {
  return rows.filter((r) => r.tenantId === tenantId);
}

export function assertEngineHasNoDbAccess(engineSource: string): boolean {
  return !/from\s+["']@prisma\/client["']|PrismaClient|prisma\./i.test(engineSource);
}
