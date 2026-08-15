import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { visibleNav, NAV_GROUPS } from "../src/lib/nav";
import type { Actor } from "@ed4u/domain";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("branding", () => {
  it("web package is ED4U", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "apps/web/package.json"), "utf8")) as {
      name: string;
      description: string;
    };
    expect(pkg.name).toBe("@ed4u/web");
    expect(pkg.description).toMatch(/ED4U/);
    expect(JSON.stringify(pkg)).not.toMatch(/EduSync/i);
  });
});

describe("role-aware navigation", () => {
  const student: Actor = {
    userId: "u",
    tenantId: "t",
    schoolMemberCode: "HS000001",
    memberType: "STUDENT",
    membershipStatus: "ACTIVE",
    roles: ["STUDENT"],
    classId: "c",
    grade: "10",
  };

  it("includes every required primary destination", () => {
    const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    for (const required of [
      "/dashboard",
      "/mentor",
      "/mentor/match-space",
      "/calendar",
      "/applications",
      "/appointments",
      "/rooms",
      "/events",
      "/clubs",
      "/discussion",
      "/notifications",
      "/search",
      "/profile",
      "/security",
    ]) {
      expect(hrefs).toContain(required);
    }
  });

  it("hides admin settings from students", () => {
    const hrefs = visibleNav(student).flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).not.toContain("/admin/settings");
    expect(hrefs).toContain("/mentor/match-space");
  });
});
