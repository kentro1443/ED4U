import { ForbiddenError, err, ok, type Result } from "./errors";
import type { Actor } from "./membership";
import { assertSameTenant, isActiveStudent, isGraduated } from "./membership";

export type Permission =
  | "members.manage"
  | "members.import"
  | "password.reset"
  | "roles.assign"
  | "timetable.edit"
  | "timetable.import"
  | "rooms.manage"
  | "approvals.resolve"
  | "forum.moderate"
  | "audit.read"
  | "system.settings"
  | "application.create"
  | "application.review"
  | "appointment.create"
  | "appointment.accept"
  | "mentor.match"
  | "mentor.book"
  | "room.request"
  | "room.approve"
  | "club.propose"
  | "club.manage"
  | "finance.approve"
  | "discussion.write"
  | "discussion.read";

const ROLE_PERMS: Record<string, readonly Permission[]> = {
  ADMIN_IT: [
    "members.manage",
    "members.import",
    "password.reset",
    "roles.assign",
    "system.settings",
    "audit.read",
    "timetable.import",
    "discussion.read",
  ],
  SCHOOL_ADMIN: [
    "approvals.resolve",
    "room.approve",
    "rooms.manage",
    "timetable.edit",
    "forum.moderate",
    "audit.read",
    "club.manage",
    "finance.approve",
    "discussion.write",
    "discussion.read",
    "application.review",
  ],
  TEACHER: ["application.review", "appointment.accept", "discussion.write", "discussion.read"],
  STUDENT: [
    "application.create",
    "appointment.create",
    "mentor.match",
    "mentor.book",
    "room.request",
    "club.propose",
    "discussion.write",
    "discussion.read",
  ],
  MENTOR: ["discussion.read", "mentor.match"],
};

export function permissionsFor(actor: Actor): Set<Permission> {
  const set = new Set<Permission>();
  for (const role of actor.roles) {
    for (const p of ROLE_PERMS[role] ?? []) set.add(p);
  }
  if (isGraduated(actor)) {
    set.delete("application.create");
    set.delete("appointment.create");
    set.delete("room.request");
    set.delete("club.propose");
    set.delete("discussion.write");
    set.add("discussion.read");
    set.add("mentor.match");
  }
  if (!isActiveStudent(actor) && actor.roles.includes("STUDENT") && !isGraduated(actor)) {
    set.delete("application.create");
  }
  return set;
}

export function can(actor: Actor, permission: Permission): boolean {
  return permissionsFor(actor).has(permission);
}

export function assertCan(
  actor: Actor,
  permission: Permission,
  resourceTenantId?: string,
): Result<true, ForbiddenError> {
  if (resourceTenantId) {
    const tenant = assertSameTenant(actor, resourceTenantId);
    if (!tenant.ok) return tenant;
  }
  if (!can(actor, permission)) {
    return err(new ForbiddenError("Bạn không có quyền thực hiện thao tác này.", { permission }));
  }
  return ok(true);
}

export function owns(actor: Actor, ownerUserId: string): boolean {
  return actor.userId === ownerUserId;
}
