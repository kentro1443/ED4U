import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  hardReject,
  planRooms,
  shouldAutoCreateRequest,
  type PlanningRequest,
  type SchoolState,
} from "../src/index";

const HERE = dirname(fileURLToPath(import.meta.url));

function state(): SchoolState {
  return {
    dateForDay: "2026-08-21",
    hours: { startMinutes: 7 * 60, endMinutes: 20 * 60, weekdaysOnly: true },
    rooms: [
      {
        id: "r-lab",
        code: "LAB-01",
        name: "Phòng máy 1",
        roomType: "COMPUTER_LAB",
        building: "STEM",
        floor: "2",
        capacity: 90,
        status: "ACTIVE",
        features: { PROJECTOR: true, COMPUTERS: true },
      },
      {
        id: "r-small",
        code: "CR-01",
        name: "Lớp nhỏ",
        roomType: "CLASSROOM",
        building: "A",
        floor: "1",
        capacity: 20,
        status: "ACTIVE",
        features: { PROJECTOR: true },
      },
      {
        id: "r-down",
        code: "AUD-01",
        name: "Hội trường",
        roomType: "AUDITORIUM",
        building: "STEM",
        floor: "1",
        capacity: 200,
        status: "MAINTENANCE",
        features: { PROJECTOR: true, SOUND_SYSTEM: true },
      },
    ],
    occupancy: [
      {
        roomId: "r-lab",
        startAt: "2026-08-21T08:00:00.000Z",
        endAt: "2026-08-21T09:00:00.000Z",
        kind: "TIMETABLE",
        label: "Tin học",
      },
    ],
    pendingHolds: [
      {
        requestId: "hold-1",
        roomId: "r-lab",
        startAt: "2026-08-21T13:00:00.000Z",
        endAt: "2026-08-21T17:00:00.000Z",
        createdAt: "2026-08-21T07:00:00.000Z",
        active: true,
      },
    ],
  };
}

const workshop: PlanningRequest = {
  requestId: "nl-1",
  attendees: 80,
  requiredFeatures: ["PROJECTOR"],
  preferredRoomType: "COMPUTER_LAB",
  preferredBuilding: "STEM",
  day: "FRI",
  timeWindow: { start: "13:00", end: "17:00", flexible: true },
  setupMinutes: 15,
  cleanupMinutes: 15,
};

describe("facility hard filter", () => {
  it("never returns a plan that violates a hard constraint", () => {
    const result = planRooms(state(), workshop);
    expect(result.kind).toBe("PLANS");
    if (result.kind !== "PLANS") return;
    expect(result.plans.length).toBeGreaterThan(0);
    expect(result.plans.length).toBeLessThanOrEqual(3);
    for (const plan of result.plans) {
      const room = state().rooms.find((r) => r.id === plan.roomId);
      expect(room).toBeTruthy();
      if (!room) continue;
      expect(
        hardReject(room, workshop, state().occupancy, state().hours, state().dateForDay),
      ).toBeNull();
      expect(plan.hardPassed).toBe(true);
    }
  });

  it("does not auto-create a RoomRequest on no-solution", () => {
    const empty: SchoolState = { ...state(), rooms: [] };
    const result = planRooms(empty, workshop);
    expect(result.kind).toBe("NO_SOLUTION");
    expect(shouldAutoCreateRequest(result)).toBe(false);
    if (result.kind === "NO_SOLUTION") {
      expect(result.blockers.length).toBeGreaterThanOrEqual(0);
      expect(result.alternatives.length).toBeGreaterThan(0);
    }
  });

  it("rejects capacity, inactive rooms, and timetable conflicts", () => {
    const s = state();
    const small = s.rooms[1];
    const down = s.rooms[2];
    const lab = s.rooms[0];
    expect(small && hardReject(small, workshop, s.occupancy, s.hours, s.dateForDay)).toBe(
      "CAPACITY",
    );
    expect(down && hardReject(down, workshop, s.occupancy, s.hours, s.dateForDay)).toBe(
      "ROOM_NOT_ACTIVE",
    );
    const morning = { ...workshop, timeWindow: { start: "08:00", end: "08:45", flexible: false } };
    expect(lab && hardReject(lab, morning, s.occupancy, s.hours, s.dateForDay)).toBe(
      "TIMETABLE_CONFLICT",
    );
  });

  it("does not import Prisma", () => {
    const src =
      readFileSync(join(HERE, "../src/engine.ts"), "utf8") +
      readFileSync(join(HERE, "../src/index.ts"), "utf8");
    expect(src).not.toMatch(/prisma/i);
  });
});
