import { describe, expect, it } from "vitest";
import { canWriteDiscussion, moderate } from "../src/index";
import type { Actor } from "../src/index";

const graduated: Actor = {
  userId: "g",
  tenantId: "t",
  schoolMemberCode: "HS990001",
  memberType: "STUDENT",
  membershipStatus: "GRADUATED",
  roles: ["STUDENT"],
  classId: null,
  grade: null,
};

describe("discussion", () => {
  it("makes graduated users read-only", () => {
    const w = canWriteDiscussion(graduated);
    expect(w.ok).toBe(false);
  });

  it("requires a reason and never edits user content", () => {
    const d = moderate("HIDE_POST", "spam");
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.value.editsUserContent).toBe(false);
    expect(moderate("WARN", "").ok).toBe(false);
  });
});
