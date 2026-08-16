import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ed4uTokens } from "@ed4u/ui";
import { visibleNav, NAV_GROUPS } from "../src/lib/nav";
import { getInitials } from "../src/components/ui/DataDisplay";
import type { Actor } from "@ed4u/domain";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("Slice 2 UI Foundation - Tokens and Assets", () => {
  it("aligns TypeScript tokens reference with CSS custom properties in globals.css", () => {
    const globalsCss = readFileSync(join(ROOT, "apps/web/src/app/globals.css"), "utf8");

    // CSS custom properties in globals.css are the canonical runtime source of truth
    expect(globalsCss).toContain("--canvas: #f8fafc;");
    expect(globalsCss).toContain("--brand-700: #1749c8;");
    expect(globalsCss).toContain("--surface-soft: #f1f5f9;");
    expect(globalsCss).toContain("--hairline: #e2e8f0;");
    expect(globalsCss).toContain("--brand-600: #2563eb;");

    // ed4uTokens reference matches
    expect(ed4uTokens.colors.primary).toBe("#1749c8");
    expect(ed4uTokens.colors.canvas).toBe("#f8fafc");
    expect(ed4uTokens.colors.surfaceSoft).toBe("#f1f5f9");
    expect(ed4uTokens.colors.hairline).toBe("#e2e8f0");
    expect(ed4uTokens.colors.brandAccent).toBe("#2563eb");
    expect(ed4uTokens.radius.md).toBe("12px");
    expect(ed4uTokens.radius.lg).toBe("16px");
  });

  it("provides valid brand icon and favicon files without EduSync references", () => {
    const iconSvgPath = join(ROOT, "apps/web/public/icon.svg");
    const faviconPath = join(ROOT, "apps/web/public/favicon.ico");
    const appIconSvgPath = join(ROOT, "apps/web/src/app/icon.svg");
    const logoPath = join(ROOT, "apps/web/public/brand/ed4u-logo.png");

    expect(existsSync(iconSvgPath)).toBe(true);
    expect(existsSync(faviconPath)).toBe(true);
    expect(existsSync(appIconSvgPath)).toBe(true);
    expect(existsSync(logoPath)).toBe(true);

    const iconContent = readFileSync(iconSvgPath, "utf8");
    expect(iconContent).not.toMatch(/EduSync/i);
    expect(iconContent).toMatch(/svg/);
  });

  it("ensures all navigation items have valid icon mappings", () => {
    const allItems = NAV_GROUPS.flatMap((g) => g.items);
    for (const item of allItems) {
      expect(item.icon).toBeDefined();
      expect(typeof item.icon).toBe("string");
    }
  });

  it("calculates avatar initials accurately across Vietnamese and standard names", () => {
    expect(getInitials("Nguyễn Văn An")).toBe("NA");
    expect(getInitials("Trần Thị Bình")).toBe("TB");
    expect(getInitials("Admin")).toBe("AD");
    expect(getInitials("HS000001")).toBe("HS");
    expect(getInitials("")).toBe("U");
  });

  it("maintains role-aware navigation consistency for all primary roles including Mentor", () => {
    const student: Actor = {
      userId: "s1",
      tenantId: "t1",
      schoolMemberCode: "HS000001",
      memberType: "STUDENT",
      membershipStatus: "ACTIVE",
      roles: ["STUDENT"],
      classId: "c1",
      grade: "10",
    };

    const teacher: Actor = {
      userId: "t1",
      tenantId: "t1",
      schoolMemberCode: "GV000001",
      memberType: "TEACHER",
      membershipStatus: "ACTIVE",
      roles: ["TEACHER"],
      classId: null,
      grade: null,
    };

    const schoolAdmin: Actor = {
      userId: "a1",
      tenantId: "t1",
      schoolMemberCode: "AD000001",
      memberType: "STAFF",
      membershipStatus: "ACTIVE",
      roles: ["SCHOOL_ADMIN"],
      classId: null,
      grade: null,
    };

    const itAdmin: Actor = {
      userId: "i1",
      tenantId: "t1",
      schoolMemberCode: "IT000001",
      memberType: "STAFF",
      membershipStatus: "ACTIVE",
      roles: ["ADMIN_IT"],
      classId: null,
      grade: null,
    };

    const mentor: Actor = {
      userId: "m1",
      tenantId: "t1",
      schoolMemberCode: "HS990002",
      memberType: "STUDENT",
      membershipStatus: "GRADUATED",
      roles: ["MENTOR"],
      classId: null,
      grade: null,
    };

    const studentHrefs = visibleNav(student).flatMap((g) => g.items.map((i) => i.href));
    const teacherHrefs = visibleNav(teacher).flatMap((g) => g.items.map((i) => i.href));
    const schoolAdminHrefs = visibleNav(schoolAdmin).flatMap((g) => g.items.map((i) => i.href));
    const itAdminHrefs = visibleNav(itAdmin).flatMap((g) => g.items.map((i) => i.href));
    const mentorHrefs = visibleNav(mentor).flatMap((g) => g.items.map((i) => i.href));

    // Student checks
    expect(studentHrefs).toContain("/dashboard");
    expect(studentHrefs).toContain("/mentor");
    expect(studentHrefs).toContain("/mentor/match-space");
    expect(studentHrefs).toContain("/applications");
    expect(studentHrefs).toContain("/discussion");
    expect(studentHrefs).toContain("/manual");
    expect(studentHrefs).not.toContain("/admin/members");
    expect(studentHrefs).not.toContain("/admin/approvals");

    // Teacher checks
    expect(teacherHrefs).toContain("/dashboard");
    expect(teacherHrefs).toContain("/applications");
    expect(teacherHrefs).toContain("/appointments");
    expect(teacherHrefs).toContain("/discussion");
    expect(teacherHrefs).toContain("/manual");
    expect(teacherHrefs).not.toContain("/mentor");
    expect(teacherHrefs).not.toContain("/admin/members");

    // School Admin vs IT Admin separation
    expect(schoolAdminHrefs).toContain("/admin/approvals");
    expect(schoolAdminHrefs).toContain("/admin/rooms");
    expect(schoolAdminHrefs).not.toContain("/admin/members");
    expect(schoolAdminHrefs).not.toContain("/admin/settings");

    expect(itAdminHrefs).toContain("/admin/members");
    expect(itAdminHrefs).toContain("/admin/settings");
    expect(itAdminHrefs).not.toContain("/admin/approvals");

    // Mentor checks: strict isolation from school operational and discussion routes
    expect(mentorHrefs).toContain("/dashboard");
    expect(mentorHrefs).toContain("/mentor");
    expect(mentorHrefs).toContain("/mentor/match-space");
    expect(mentorHrefs).toContain("/profile");
    expect(mentorHrefs).toContain("/security");
    expect(mentorHrefs).toContain("/manual");

    expect(mentorHrefs).not.toContain("/discussion");
    expect(mentorHrefs).not.toContain("/applications");
    expect(mentorHrefs).not.toContain("/appointments");
    expect(mentorHrefs).not.toContain("/rooms");
    expect(mentorHrefs).not.toContain("/clubs");
    expect(mentorHrefs).not.toContain("/admin/members");
    expect(mentorHrefs).not.toContain("/admin/approvals");
  });
});
