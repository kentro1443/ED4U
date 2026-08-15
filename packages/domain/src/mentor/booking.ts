import { ConflictError, ForbiddenError, ValidationError, err, ok, type Result } from "../errors";
import { civilInZone } from "../academic/timezone";

export interface LiveMentorState {
  mentorId: string;
  tenantId: string;
  verified: boolean;
  membershipStatus: "GRADUATED" | "ACTIVE" | "LEFT_SCHOOL" | "SUSPENDED";
  availableSlots: readonly string[];
  pricePerHour: number;
  existingBookings?: readonly { startAt: Date; endAt: Date }[];
}

export interface BookingIntent {
  tenantId: string;
  studentId: string;
  mentorId: string;
  slotPattern?: string;
  slot?: string;
  startAt?: Date;
  endAt?: Date;
  maxPricePerHour: number | null;
}

export const SLOT_WEEKDAYS: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

export const WEEKDAY_LABELS: Record<string, string> = {
  MON: "Thứ Hai",
  TUE: "Thứ Ba",
  WED: "Thứ Tư",
  THU: "Thứ Năm",
  FRI: "Thứ Sáu",
  SAT: "Thứ Bảy",
  SUN: "Chủ Nhật",
};

export function parseSlotPattern(slotPattern: string): {
  weekdayStr: string;
  weekday: number;
  hour: number;
  minute: number;
  label: string;
} {
  const match = /^([A-Z]{3})_(\d{2})_(\d{2})$/.exec(slotPattern);
  if (!match) {
    throw new Error(`Invalid slot pattern: ${slotPattern}`);
  }
  const weekdayStr = match[1]!;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const weekday = SLOT_WEEKDAYS[weekdayStr];
  if (weekday === undefined || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid slot pattern values: ${slotPattern}`);
  }
  const pad = (n: number) => n.toString().padStart(2, "0");
  const weekdayLabel = WEEKDAY_LABELS[weekdayStr] ?? weekdayStr;
  const label = `${weekdayLabel}, ${pad(hour)}:${pad(minute)}`;
  return { weekdayStr, weekday, hour, minute, label };
}

/**
 * Resolves a recurring weekly slot pattern (e.g. "TUE_19_00") to the next
 * concrete 60-minute session startAt and endAt timestamps in the school timezone.
 */
export function nextSlotOccurrence(
  slotPattern: string,
  timeZone: string,
  fromDate: Date = new Date(),
): { startAt: Date; endAt: Date } {
  const {
    weekday: targetWeekday,
    hour: targetHour,
    minute: targetMinute,
  } = parseSlotPattern(slotPattern);

  const civilNow = civilInZone(fromDate, timeZone);
  let daysAhead = (targetWeekday - civilNow.weekday + 7) % 7;

  // If slot is today but already past or within 30 minutes, push to next week
  const currentMinutes = civilNow.hour * 60 + civilNow.minute;
  const slotMinutes = targetHour * 60 + targetMinute;
  if (daysAhead === 0 && currentMinutes + 30 >= slotMinutes) {
    daysAhead = 7;
  }

  // Calculate target civil date in timezone
  const approx = new Date(fromDate.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const approxCivil = civilInZone(approx, timeZone);

  const targetUtcEstimate = new Date(
    Date.UTC(
      approxCivil.year,
      approxCivil.month - 1,
      approxCivil.day,
      targetHour,
      targetMinute,
      0,
      0,
    ),
  );

  const testCivil = civilInZone(targetUtcEstimate, timeZone);
  const offsetDiffMinutes =
    (testCivil.hour - targetHour) * 60 +
    (testCivil.minute - targetMinute) +
    (testCivil.day - approxCivil.day) * 1440;

  const startAt = new Date(targetUtcEstimate.getTime() - offsetDiffMinutes * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

  return { startAt, endAt };
}

/**
 * Recommendation is not reservation. Booking re-fetches live mentor state and
 * re-checks eligibility + availability before any write.
 */
export function recheckMentorBooking(
  live: LiveMentorState,
  intent: BookingIntent,
): Result<
  { mentorId: string; slot: string; slotPattern: string; startAt?: Date; endAt?: Date },
  ConflictError | ForbiddenError | ValidationError
> {
  const slot = intent.slotPattern ?? intent.slot;
  if (!slot) {
    return err(new ValidationError("Khung giờ đặt hẹn không được để trống."));
  }
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
  if (!live.availableSlots.includes(slot)) {
    return err(
      new ConflictError("Khung giờ mentor không còn trống. Hãy chọn lại.", {
        slot,
      }),
    );
  }
  if (intent.maxPricePerHour != null && live.pricePerHour > intent.maxPricePerHour) {
    return err(
      new ConflictError("Giá mentor vượt ngân sách đã chọn.", { price: live.pricePerHour }),
    );
  }

  if (live.existingBookings && intent.startAt && intent.endAt) {
    const startA = new Date(intent.startAt).getTime();
    const endA = new Date(intent.endAt).getTime();

    const hasOverlap = live.existingBookings.some((b) => {
      const startB = new Date(b.startAt).getTime();
      const endB = new Date(b.endAt).getTime();
      return startA < endB && endA > startB;
    });
    if (hasOverlap) {
      return err(
        new ConflictError("Mentor đã có lịch hẹn trùng với khung giờ này.", {
          startAt: new Date(intent.startAt).toISOString(),
        }),
      );
    }
  }

  return ok({
    mentorId: live.mentorId,
    slot,
    slotPattern: slot,
    startAt: intent.startAt,
    endAt: intent.endAt,
  });
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
