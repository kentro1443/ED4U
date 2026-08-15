import {
  ForbiddenError,
  StateTransitionError,
  ValidationError,
  err,
  ok,
  type Result,
} from "./errors";
import type { Actor } from "./membership";

export const CLUB_STATUSES = ["PROPOSED", "ACTIVE", "SUSPENDED", "ARCHIVED", "REJECTED"] as const;
export type ClubStatus = (typeof CLUB_STATUSES)[number];

export const CLUB_ROLES = ["PRESIDENT", "VICE_PRESIDENT", "CORE", "MEMBER"] as const;
export type ClubRole = (typeof CLUB_ROLES)[number];

export const CLUB_MEMBER_STATUSES = ["PENDING", "ACTIVE", "REJECTED", "LEFT", "REMOVED"] as const;
export type ClubMemberStatus = (typeof CLUB_MEMBER_STATUSES)[number];

export const DOC_VISIBILITY = [
  "ALL_MEMBERS",
  "CORE_PLUS",
  "VP_PLUS",
  "PRESIDENT_ONLY",
  "SCHOOL_ADMIN_ONLY",
] as const;
export type DocVisibility = (typeof DOC_VISIBILITY)[number];

export const FINANCE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "VOIDED"] as const;
export type FinanceStatus = (typeof FINANCE_STATUSES)[number];

const RANK: Record<ClubRole, number> = {
  MEMBER: 0,
  CORE: 1,
  VICE_PRESIDENT: 2,
  PRESIDENT: 3,
};

export function isCorePlus(role: ClubRole): boolean {
  return RANK[role] >= RANK.CORE;
}

export function canViewDocument(
  role: ClubRole,
  visibility: DocVisibility,
  isSchoolAdmin: boolean,
): boolean {
  if (visibility === "SCHOOL_ADMIN_ONLY") return isSchoolAdmin;
  if (isSchoolAdmin) return true;
  switch (visibility) {
    case "ALL_MEMBERS":
      return true;
    case "CORE_PLUS":
      return isCorePlus(role);
    case "VP_PLUS":
      return RANK[role] >= RANK.VICE_PRESIDENT;
    case "PRESIDENT_ONLY":
      return role === "PRESIDENT";
    default: {
      const _x: never = visibility;
      return _x;
    }
  }
}

export function canApproveMembership(role: ClubRole, isSchoolAdmin: boolean): boolean {
  return isSchoolAdmin || isCorePlus(role);
}

export function canProposeEvent(role: ClubRole, isSchoolAdmin: boolean): boolean {
  return isSchoolAdmin || isCorePlus(role);
}

export function canCreateFinanceEntry(role: ClubRole, isSchoolAdmin: boolean): boolean {
  return isSchoolAdmin || isCorePlus(role);
}

export function canApproveFinance(role: ClubRole, isSchoolAdmin: boolean): boolean {
  return isSchoolAdmin || role === "PRESIDENT";
}

export function assertClubPermission(
  actor: Actor,
  clubRole: ClubRole | null,
  check: (role: ClubRole, admin: boolean) => boolean,
): Result<true, ForbiddenError> {
  const admin = actor.roles.includes("SCHOOL_ADMIN");
  if (admin) return ok(true);
  if (!clubRole || !check(clubRole, false)) {
    return err(new ForbiddenError("Bạn không có quyền trong câu lạc bộ này."));
  }
  return ok(true);
}

export interface FinanceEntry {
  id: string;
  amount: number;
  currency: string;
  status: FinanceStatus;
  amountImmutable: boolean;
}

/**
 * Approved ledger rows are immutable. Correction = VOID original + new entry.
 * Never silently UPDATE an approved amount.
 */
export function approveFinanceEntry(
  entry: FinanceEntry,
): Result<FinanceEntry, StateTransitionError> {
  if (entry.status !== "PENDING") {
    return err(new StateTransitionError("Chỉ có thể duyệt khoản đang chờ."));
  }
  return ok({ ...entry, status: "APPROVED", amountImmutable: true });
}

export function voidFinanceEntry(
  entry: FinanceEntry,
  reason: string,
): Result<FinanceEntry, ValidationError> {
  if (entry.status !== "APPROVED") {
    return err(new ValidationError("Chỉ có thể VOID khoản đã duyệt."));
  }
  if (!reason.trim()) {
    return err(new ValidationError("VOID cần lý do."));
  }
  return ok({ ...entry, status: "VOIDED", amountImmutable: true });
}

export function tryUpdateApprovedAmount(
  entry: FinanceEntry,
  _newAmount: number,
): Result<never, ValidationError> {
  if (entry.status === "APPROVED" || entry.amountImmutable) {
    return err(
      new ValidationError("Không được sửa số tiền đã duyệt. Hãy VOID rồi tạo bút toán mới.", {
        code: "FINANCE_IMMUTABLE",
      }),
    );
  }
  return err(new ValidationError("Không thể sửa số tiền theo cách này."));
}

export interface EventRoomApproval {
  eventStatus: "PENDING" | "APPROVED" | "NEEDS_RESOURCE" | "REJECTED";
  roomRequired: boolean;
  roomResolved: boolean;
}

/**
 * No fully-approved event with an unresolved mandatory room.
 */
export function approveEventWithRoom(
  event: EventRoomApproval,
  roomAvailable: boolean,
): Result<EventRoomApproval, ValidationError> {
  if (event.roomRequired && !roomAvailable) {
    return ok({ ...event, eventStatus: "NEEDS_RESOURCE", roomResolved: false });
  }
  if (event.roomRequired && !event.roomResolved && !roomAvailable) {
    return err(
      new ValidationError("Không thể duyệt sự kiện khi phòng bắt buộc chưa được xác nhận."),
    );
  }
  return ok({
    ...event,
    eventStatus: "APPROVED",
    roomResolved: event.roomRequired ? true : event.roomResolved,
  });
}

export function isFullyApprovedWithUnresolvedRoom(event: EventRoomApproval): boolean {
  return event.eventStatus === "APPROVED" && event.roomRequired && !event.roomResolved;
}
