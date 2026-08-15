import { describe, expect, it } from "vitest";
import {
  SOFT_HOLD_MS,
  applyConcurrentApprovals,
  approveEventWithRoom,
  approveFinanceEntry,
  approveRoomRequest,
  canApproveMembership,
  isFullyApprovedWithUnresolvedRoom,
  isSoftHoldActive,
  occupiedInterval,
  softHoldBlocksHardLock,
  tryUpdateApprovedAmount,
  voidFinanceEntry,
  type OccupiedSlot,
  type RoomApprovalInput,
} from "../src/index";

const hours = { startMinutes: 7 * 60, endMinutes: 20 * 60 };

function monday(h: number, m = 0): Date {
  return new Date(Date.UTC(2026, 7, 17, h, m, 0));
}

function input(over: Partial<RoomApprovalInput> = {}): RoomApprovalInput {
  return {
    requestId: "req-1",
    roomId: "room-1",
    eventStart: monday(14),
    eventEnd: monday(16),
    setupMinutes: 15,
    cleanupMinutes: 15,
    occupancy: [],
    operationalHours: hours,
    now: monday(8),
    ...over,
  };
}

describe("soft hold vs hard lock", () => {
  it("expires after 24h and never hard-locks the room", () => {
    const createdAt = monday(8);
    const hold = {
      requestId: "req-1",
      roomId: "room-1",
      startAt: monday(14),
      endAt: monday(16),
      createdAt,
    };
    expect(isSoftHoldActive(hold, new Date(createdAt.getTime() + SOFT_HOLD_MS - 1))).toBe(true);
    expect(isSoftHoldActive(hold, new Date(createdAt.getTime() + SOFT_HOLD_MS + 1))).toBe(false);
    expect(softHoldBlocksHardLock([hold])).toBe(false);
  });
});

describe("room approval re-check", () => {
  it("uses occupied interval including setup/cleanup", () => {
    const occ = occupiedInterval(monday(14), monday(16), 15, 15);
    expect(occ.startAt.getUTCHours()).toBe(13);
    expect(occ.startAt.getUTCMinutes()).toBe(45);
    expect(occ.endAt.getUTCHours()).toBe(16);
    expect(occ.endAt.getUTCMinutes()).toBe(15);
  });

  it("fails when timetable occupies the slot", () => {
    const occupancy: OccupiedSlot[] = [
      {
        roomId: "room-1",
        startAt: monday(13, 30),
        endAt: monday(14, 30),
        source: "TIMETABLE",
        label: "Toán",
      },
    ];
    const r = approveRoomRequest(input({ occupancy }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.details.code).toBe("ROOM_CONFLICT");
  });

  it("confirms when the room is free", () => {
    const r = approveRoomRequest(input());
    expect(r.ok).toBe(true);
  });
});

describe("concurrent conflicting room approvals", () => {
  it("produces exactly one booking and a Conflict for the other", () => {
    const first = input({ requestId: "A", eventStart: monday(14), eventEnd: monday(16) });
    const second = input({ requestId: "B", eventStart: monday(14, 30), eventEnd: monday(15, 30) });
    const { winner, loser } = applyConcurrentApprovals(first, second);
    expect(winner.requestId).toBe("A");
    expect(loser.code).toBe("CONFLICT");
    expect(loser.details.code).toBe("ROOM_CONFLICT");
  });
});

describe("finance immutability", () => {
  it("refuses silent UPDATE of an approved amount", () => {
    const pending = {
      id: "f1",
      amount: 100_000,
      currency: "VND",
      status: "PENDING" as const,
      amountImmutable: false,
    };
    const approved = approveFinanceEntry(pending);
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    const update = tryUpdateApprovedAmount(approved.value, 50_000);
    expect(update.ok).toBe(false);
    if (!update.ok) expect(update.error.details.code).toBe("FINANCE_IMMUTABLE");
    const voided = voidFinanceEntry(approved.value, "Sai số");
    expect(voided.ok).toBe(true);
    if (voided.ok) expect(voided.value.status).toBe("VOIDED");
  });
});

describe("club roles and event+room atomic approval", () => {
  it("lets CORE approve membership", () => {
    expect(canApproveMembership("CORE", false)).toBe(true);
    expect(canApproveMembership("MEMBER", false)).toBe(false);
  });

  it("never leaves an event fully approved with unresolved room", () => {
    const blocked = approveEventWithRoom(
      { eventStatus: "PENDING", roomRequired: true, roomResolved: false },
      false,
    );
    expect(blocked.ok).toBe(true);
    if (blocked.ok) {
      expect(blocked.value.eventStatus).toBe("NEEDS_RESOURCE");
      expect(isFullyApprovedWithUnresolvedRoom(blocked.value)).toBe(false);
    }
    const okEvent = approveEventWithRoom(
      { eventStatus: "PENDING", roomRequired: true, roomResolved: false },
      true,
    );
    expect(okEvent.ok).toBe(true);
    if (okEvent.ok) {
      expect(okEvent.value.eventStatus).toBe("APPROVED");
      expect(okEvent.value.roomResolved).toBe(true);
    }
  });
});
