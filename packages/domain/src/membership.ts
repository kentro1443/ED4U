import { ForbiddenError, err, ok, type Result } from "./errors";
import type { MembershipStatus, MemberType, SystemRole } from "./roles";

export interface Actor {
  userId: string;
  tenantId: string;
  schoolMemberCode: string;
  memberType: MemberType;
  membershipStatus: MembershipStatus;
  roles: readonly SystemRole[];
  classId: string | null;
  grade: string | null;
}

export function isActiveStudent(actor: Actor): boolean {
  return (
    actor.membershipStatus === "ACTIVE" &&
    (actor.roles.includes("STUDENT") || actor.memberType === "STUDENT") &&
    !actor.roles.includes("MENTOR")
  );
}

export function isGraduated(actor: Actor): boolean {
  return actor.membershipStatus === "GRADUATED";
}

export function canLogin(status: MembershipStatus): boolean {
  return status === "ACTIVE" || status === "GRADUATED";
}

/** Graduated users may view history, read Discussion Hub, and apply to become mentor. */
export function graduatedMay(action: GraduatedAction): boolean {
  switch (action) {
    case "LOGIN":
    case "VIEW_OWN_HISTORY":
    case "DISCUSSION_READ":
    case "APPLY_MENTOR":
    case "VIEW_CALENDAR":
      return true;
    case "CREATE_STUDENT_APPLICATION":
    case "CREATE_STUDENT_BOOKING":
    case "CREATE_ROOM_REQUEST":
    case "CREATE_APPOINTMENT":
    case "DISCUSSION_WRITE":
    case "JOIN_CLUB":
      return false;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export type GraduatedAction =
  | "LOGIN"
  | "VIEW_OWN_HISTORY"
  | "DISCUSSION_READ"
  | "APPLY_MENTOR"
  | "VIEW_CALENDAR"
  | "CREATE_STUDENT_APPLICATION"
  | "CREATE_STUDENT_BOOKING"
  | "CREATE_ROOM_REQUEST"
  | "CREATE_APPOINTMENT"
  | "DISCUSSION_WRITE"
  | "JOIN_CLUB";

export function assertStudentService(
  actor: Actor,
  action: GraduatedAction,
): Result<true, ForbiddenError> {
  if (actor.membershipStatus === "SUSPENDED" || actor.membershipStatus === "LEFT_SCHOOL") {
    return err(new ForbiddenError("Tài khoản không còn hiệu lực."));
  }
  if (actor.membershipStatus === "GRADUATED" && !graduatedMay(action)) {
    return err(
      new ForbiddenError(
        "Học sinh đã tốt nghiệp không thể thực hiện thao tác dành cho học sinh đang học.",
        {
          action,
        },
      ),
    );
  }
  return ok(true);
}

export function tenantOf(actor: Actor): string {
  return actor.tenantId;
}

/** Never trust a client-supplied tenant id. Scope is always the authenticated actor. */
export function assertSameTenant(
  actor: Actor,
  resourceTenantId: string,
): Result<true, ForbiddenError> {
  if (actor.tenantId !== resourceTenantId) {
    return err(
      new ForbiddenError("Không thể truy cập dữ liệu ngoài trường.", { reason: "CROSS_TENANT" }),
    );
  }
  return ok(true);
}
