import { describe, expect, it } from "vitest";
import { applyConcurrentApprovals, type RoomApprovalInput } from "@ed4u/domain";

function monday(h: number, m = 0): Date {
  return new Date(Date.UTC(2026, 7, 17, h, m, 0));
}

describe("room booking service contract", () => {
  it("uses domain approval so concurrent conflicts yield one booking", () => {
    const base: RoomApprovalInput = {
      requestId: "A",
      roomId: "r1",
      eventStart: monday(14),
      eventEnd: monday(16),
      setupMinutes: 0,
      cleanupMinutes: 0,
      occupancy: [],
      operationalHours: { startMinutes: 420, endMinutes: 1200 },
      now: monday(8),
    };
    const { winner, loser } = applyConcurrentApprovals(base, { ...base, requestId: "B" });
    expect(winner.requestId).toBe("A");
    expect(loser.code).toBe("CONFLICT");
  });
});
