import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Actor } from "@ed4u/domain";
import { can } from "@ed4u/domain";
import { GUARDED_ROUTES, ROUTE_PERMISSIONS } from "../src/lib/routePermissions";
import { NAV_GROUPS, visibleNav } from "../src/lib/nav";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");

function actor(roles: Actor["roles"]): Actor {
  return {
    userId: "u",
    tenantId: "t",
    schoolMemberCode: "X000001",
    memberType: roles.includes("TEACHER") ? "TEACHER" : "STUDENT",
    membershipStatus: "ACTIVE",
    roles,
    classId: "c",
    grade: "10",
  };
}

describe("guarded routes enforce authorization server-side", () => {
  it("every /admin page calls requireRoute with its own route key", () => {
    for (const route of GUARDED_ROUTES) {
      const source = readFileSync(join(WEB, "src/app/(app)", `${route}/page.tsx`), "utf8");
      expect(source, `${route} must guard itself`).toContain(`requireRoute("${route}")`);
      // A page that only resolves the actor is not guarded.
      expect(source, `${route} must not fall back to an unguarded actor`).not.toContain(
        "currentActor()",
      );
    }
  });

  it("navigation and enforcement read the same permission map", () => {
    const navAdmin = NAV_GROUPS.find((g) => g.id === "admin");
    expect(navAdmin).toBeDefined();
    for (const item of navAdmin!.items) {
      expect(ROUTE_PERMISSIONS[item.href as keyof typeof ROUTE_PERMISSIONS]).toBe(item.permission);
    }
    expect(navAdmin!.items.map((i) => i.href).sort()).toEqual([...GUARDED_ROUTES].sort());
  });
});

describe("ADMIN_IT and SCHOOL_ADMIN are not interchangeable", () => {
  const it_ = actor(["ADMIN_IT"]);
  const schoolAdmin = actor(["SCHOOL_ADMIN"]);

  it("ADMIN_IT provisions accounts but cannot resolve approvals", () => {
    expect(can(it_, ROUTE_PERMISSIONS["/admin/members"])).toBe(true);
    expect(can(it_, ROUTE_PERMISSIONS["/admin/settings"])).toBe(true);
    expect(can(it_, ROUTE_PERMISSIONS["/admin/approvals"])).toBe(false);
    expect(can(it_, ROUTE_PERMISSIONS["/admin/rooms"])).toBe(false);
    expect(can(it_, ROUTE_PERMISSIONS["/admin/moderation"])).toBe(false);
  });

  it("SCHOOL_ADMIN runs operations but cannot provision accounts or change settings", () => {
    expect(can(schoolAdmin, ROUTE_PERMISSIONS["/admin/approvals"])).toBe(true);
    expect(can(schoolAdmin, ROUTE_PERMISSIONS["/admin/rooms"])).toBe(true);
    expect(can(schoolAdmin, ROUTE_PERMISSIONS["/admin/moderation"])).toBe(true);
    expect(can(schoolAdmin, ROUTE_PERMISSIONS["/admin/members"])).toBe(false);
    expect(can(schoolAdmin, ROUTE_PERMISSIONS["/admin/settings"])).toBe(false);
  });

  it("both may read the audit log", () => {
    expect(can(it_, "audit.read")).toBe(true);
    expect(can(schoolAdmin, "audit.read")).toBe(true);
  });
});

describe("students and teachers reach no admin route", () => {
  for (const roles of [["STUDENT"], ["TEACHER"], ["MENTOR"]] as Actor["roles"][]) {
    it(`${roles.join("+")} is denied every guarded route`, () => {
      const a = actor(roles);
      for (const route of GUARDED_ROUTES) {
        expect(can(a, ROUTE_PERMISSIONS[route]), `${roles} must not reach ${route}`).toBe(false);
      }
      expect(visibleNav(a).find((g) => g.id === "admin")).toBeUndefined();
    });
  }
});

describe("appointment acceptance is permission-gated", () => {
  it("only a teacher holds appointment.accept", () => {
    expect(can(actor(["TEACHER"]), "appointment.accept")).toBe(true);
    expect(can(actor(["STUDENT"]), "appointment.accept")).toBe(false);
    expect(can(actor(["SCHOOL_ADMIN"]), "appointment.accept")).toBe(false);
    expect(can(actor(["ADMIN_IT"]), "appointment.accept")).toBe(false);
  });

  it("the action checks the assignee as well as the permission", () => {
    const source = readFileSync(join(WEB, "src/app/(app)/appointments/actions.ts"), "utf8");
    expect(source).toContain('requirePermission("appointment.accept")');
    expect(source).toContain("assertTenant(");
    expect(source).toContain("assertRelated(actor, [apt.teacherId]");
  });
});
