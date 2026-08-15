import { describe, expect, it } from "vitest";
import {
  assertSameTenant,
  assertStudentService,
  canAssignRoles,
  canLogin,
  graduatedMay,
  validateRoleCombination,
  type Actor,
} from "../src/index";

function actor(over: Partial<Actor> = {}): Actor {
  return {
    userId: "u1",
    tenantId: "t1",
    schoolMemberCode: "HS000001",
    memberType: "STUDENT",
    membershipStatus: "ACTIVE",
    roles: ["STUDENT"],
    classId: "c1",
    grade: "10",
    ...over,
  };
}

describe("role combination rules", () => {
  it("allows TEACHER + SCHOOL_ADMIN", () => {
    const r = canAssignRoles(["TEACHER", "SCHOOL_ADMIN"], "ACTIVE", "TEACHER");
    expect(r.ok).toBe(true);
  });

  it("forbids TEACHER + MENTOR", () => {
    const r = canAssignRoles(["TEACHER", "MENTOR"], "GRADUATED", "TEACHER");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.details.reason).toBe("TEACHER_MENTOR_FORBIDDEN");
  });

  it("forbids active student + Mentor", () => {
    const r = validateRoleCombination({
      roles: ["STUDENT", "MENTOR"],
      membershipStatus: "ACTIVE",
      memberType: "STUDENT",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.details.reason).toBe("ACTIVE_STUDENT_MENTOR_FORBIDDEN");
  });

  it("requires Mentor to be GRADUATED", () => {
    const r = canAssignRoles(["MENTOR"], "LEFT_SCHOOL", "STAFF");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.details.reason).toBe("MENTOR_REQUIRES_GRADUATED");
  });

  it("allows Mentor when GRADUATED", () => {
    const r = canAssignRoles(["MENTOR"], "GRADUATED", "STUDENT");
    expect(r.ok).toBe(true);
  });
});

describe("graduated restrictions", () => {
  it("lets graduated users log in and apply as mentor", () => {
    expect(canLogin("GRADUATED")).toBe(true);
    expect(graduatedMay("APPLY_MENTOR")).toBe(true);
    expect(graduatedMay("DISCUSSION_READ")).toBe(true);
  });

  it("blocks new student applications and bookings", () => {
    const g = actor({ membershipStatus: "GRADUATED", roles: ["STUDENT"] });
    const app = assertStudentService(g, "CREATE_STUDENT_APPLICATION");
    const book = assertStudentService(g, "CREATE_STUDENT_BOOKING");
    const room = assertStudentService(g, "CREATE_ROOM_REQUEST");
    expect(app.ok).toBe(false);
    expect(book.ok).toBe(false);
    expect(room.ok).toBe(false);
  });
});

describe("cross-tenant denial", () => {
  it("denies a resource from another tenant", () => {
    const r = assertSameTenant(actor(), "other-tenant");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.details.reason).toBe("CROSS_TENANT");
  });

  it("allows same tenant", () => {
    expect(assertSameTenant(actor(), "t1").ok).toBe(true);
  });
});
