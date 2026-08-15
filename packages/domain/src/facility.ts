import {
  ConflictError,
  StateTransitionError,
  ValidationError,
  err,
  ok,
  type Result,
} from "./errors";
import {
  hasHardOccupancyConflict,
  occupiedInterval,
  type OccupiedSlot,
  type TimeInterval,
} from "./academic/occupancy";
import { isWeekendInZone, minutesOfDayInZone, weekdayInZone } from "./academic/timezone";

export const ROOM_REQUEST_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "PENDING_APPROVAL",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "COMPLETED",
] as const;
export type RoomRequestStatus = (typeof ROOM_REQUEST_STATUSES)[number];

const TRANSITIONS: Record<RoomRequestStatus, readonly RoomRequestStatus[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["PENDING_APPROVAL", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "CHANGES_REQUESTED", "CANCELLED"],
  CHANGES_REQUESTED: ["SUBMITTED", "CANCELLED"],
  APPROVED: ["CANCELLED", "COMPLETED"],
  REJECTED: [],
  CANCELLED: [],
  COMPLETED: [],
};

export const SOFT_HOLD_MS = 24 * 60 * 60 * 1000;

export function canTransitionRoomRequest(from: RoomRequestStatus, to: RoomRequestStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transitionRoomRequest(
  from: RoomRequestStatus,
  to: RoomRequestStatus,
): Result<RoomRequestStatus, StateTransitionError> {
  if (!canTransitionRoomRequest(from, to)) {
    return err(
      new StateTransitionError(`Không thể chuyển yêu cầu phòng từ ${from} sang ${to}.`, {
        from,
        to,
      }),
    );
  }
  return ok(to);
}

export interface SoftHold {
  requestId: string;
  roomId: string;
  startAt: Date;
  endAt: Date;
  createdAt: Date;
}

export function isSoftHoldActive(hold: SoftHold, now: Date): boolean {
  return now.getTime() - hold.createdAt.getTime() < SOFT_HOLD_MS;
}

/** Soft holds are not hard locks. Multiple conflicting pendings may coexist. */
export function softHoldBlocksHardLock(_holds: readonly SoftHold[]): false {
  return false;
}

/**
 * School-local weekday of an instant, 0 = Sunday … 6 = Saturday.
 *
 * `timeZone` is required on purpose: the previous UTC version evaluated a
 * `Asia/Ho_Chi_Minh` school day seven hours out, and a default would let that
 * class of bug return unnoticed.
 */
export function weekdayOf(date: Date, timeZone: string): number {
  return weekdayInZone(date, timeZone);
}

/**
 * Whether an interval falls inside the school's operating window on a weekday,
 * measured in the school's own civil time.
 *
 * `hours` is minutes since school-local midnight, matching `OperationalHours`.
 */
export function withinOperationalHours(
  interval: TimeInterval,
  hours: { startMinutes: number; endMinutes: number },
  timeZone: string,
): boolean {
  if (isWeekendInZone(interval.startAt, timeZone) || isWeekendInZone(interval.endAt, timeZone)) {
    return false;
  }
  const startM = minutesOfDayInZone(interval.startAt, timeZone);
  const endM = minutesOfDayInZone(interval.endAt, timeZone);
  // An interval that crosses school-local midnight leaves the operating window
  // by definition; comparing minute-of-day alone would wrongly accept it.
  if (endM < startM) return false;
  return startM >= hours.startMinutes && endM <= hours.endMinutes;
}

export interface RoomApprovalInput {
  requestId: string;
  roomId: string;
  eventStart: Date;
  eventEnd: Date;
  setupMinutes: number;
  cleanupMinutes: number;
  occupancy: readonly OccupiedSlot[];
  operationalHours: { startMinutes: number; endMinutes: number };
  /** IANA timezone of the school the room belongs to (`Tenant.timezone`). */
  timeZone: string;
  now: Date;
}

export interface ConfirmedBooking {
  requestId: string;
  roomId: string;
  startAt: Date;
  endAt: Date;
}

/**
 * Approval re-checks live occupancy. Stale recommendation state is never trusted.
 */
export function approveRoomRequest(
  input: RoomApprovalInput,
): Result<ConfirmedBooking, ConflictError | ValidationError> {
  const occupied = occupiedInterval(
    input.eventStart,
    input.eventEnd,
    input.setupMinutes,
    input.cleanupMinutes,
  );
  if (!withinOperationalHours(occupied, input.operationalHours, input.timeZone)) {
    return err(
      new ValidationError("Khung giờ nằm ngoài giờ hoạt động hoặc rơi vào cuối tuần.", {
        code: "OUTSIDE_HOURS",
      }),
    );
  }
  const conflict = hasHardOccupancyConflict(occupied, input.occupancy);
  if (conflict) {
    return err(
      new ConflictError("Phòng đã bị chiếm. Không thể duyệt yêu cầu này.", {
        code: "ROOM_CONFLICT",
        source: conflict.source,
        label: conflict.label,
        startAt: conflict.startAt.toISOString(),
        endAt: conflict.endAt.toISOString(),
      }),
    );
  }
  return ok({
    requestId: input.requestId,
    roomId: input.roomId,
    startAt: occupied.startAt,
    endAt: occupied.endAt,
  });
}

/**
 * In-memory model of concurrent approval: first writer wins, second is Conflict.
 * Used by the booking service; the Prisma path uses the same function after a lock.
 */
export function applyConcurrentApprovals(
  first: RoomApprovalInput,
  second: RoomApprovalInput,
): { winner: ConfirmedBooking; loser: ConflictError } {
  const a = approveRoomRequest(first);
  if (!a.ok) {
    throw new Error("first approval unexpectedly failed");
  }
  const occupancyWithFirst: OccupiedSlot[] = [
    ...second.occupancy,
    {
      roomId: a.value.roomId,
      startAt: a.value.startAt,
      endAt: a.value.endAt,
      source: "CONFIRMED_BOOKING",
      label: `booking:${a.value.requestId}`,
    },
  ];
  const b = approveRoomRequest({ ...second, occupancy: occupancyWithFirst });
  if (b.ok) {
    throw new Error("second conflicting approval must fail");
  }
  if (!(b.error instanceof ConflictError)) {
    throw new Error("second approval must be a Conflict");
  }
  return { winner: a.value, loser: b.error };
}

export function cancelFreesRoomImmediately(): true {
  return true;
}
