import { err, ok, type Result, ValidationError } from "./errors";

export const SYSTEM_ROLES = ["STUDENT", "TEACHER", "MENTOR", "SCHOOL_ADMIN", "ADMIN_IT"] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const MEMBER_TYPES = ["STUDENT", "TEACHER", "STAFF"] as const;
export type MemberType = (typeof MEMBER_TYPES)[number];

export const MEMBERSHIP_STATUSES = ["ACTIVE", "GRADUATED", "LEFT_SCHOOL", "SUSPENDED"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export interface RoleAssignmentContext {
  roles: readonly SystemRole[];
  membershipStatus: MembershipStatus;
  memberType: MemberType;
}

export function hasRole(roles: readonly SystemRole[], role: SystemRole): boolean {
  return roles.includes(role);
}

/**
 * Canonical role-combination rules. Mentor requires GRADUATED membership.
 * TEACHER + SCHOOL_ADMIN is allowed. TEACHER + MENTOR is forbidden.
 * An ACTIVE student cannot also be a Mentor.
 */
export function validateRoleCombination(ctx: RoleAssignmentContext): Result<true, ValidationError> {
  const unique = [...new Set(ctx.roles)];
  const isMentor = unique.includes("MENTOR");
  const isTeacher = unique.includes("TEACHER");
  const isStudent = unique.includes("STUDENT");

  if (isTeacher && isMentor) {
    return err(
      new ValidationError("Không thể gán đồng thời vai trò Giáo viên và Mentor.", {
        reason: "TEACHER_MENTOR_FORBIDDEN",
      }),
    );
  }

  if (isMentor && isStudent && ctx.membershipStatus === "ACTIVE") {
    return err(
      new ValidationError("Học sinh đang học không thể đồng thời là Mentor.", {
        reason: "ACTIVE_STUDENT_MENTOR_FORBIDDEN",
      }),
    );
  }

  if (isMentor && ctx.memberType === "STUDENT" && ctx.membershipStatus === "ACTIVE") {
    return err(
      new ValidationError("Học sinh đang học không thể đồng thời là Mentor.", {
        reason: "ACTIVE_STUDENT_MENTOR_FORBIDDEN",
      }),
    );
  }

  if (isMentor && ctx.membershipStatus !== "GRADUATED") {
    return err(
      new ValidationError("Mentor bắt buộc có trạng thái tốt nghiệp (GRADUATED).", {
        reason: "MENTOR_REQUIRES_GRADUATED",
        membershipStatus: ctx.membershipStatus,
      }),
    );
  }

  return ok(true);
}

export function canAssignRoles(
  roles: readonly SystemRole[],
  membershipStatus: MembershipStatus,
  memberType: MemberType,
): Result<true, ValidationError> {
  return validateRoleCombination({ roles, membershipStatus, memberType });
}

export function isPrivilegedAdmin(roles: readonly SystemRole[]): boolean {
  return roles.includes("SCHOOL_ADMIN") || roles.includes("ADMIN_IT");
}
