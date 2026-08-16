import { describe, expect, it } from "vitest";
import type { PlanResult, PlanningRequest, SchoolState } from "@ed4u/facility-engine";
import { buildFacilityRoomMap } from "@/lib/facility/room-map";

const request: PlanningRequest = {
  requestId: "request-1",
  attendees: 30,
  requiredFeatures: ["PROJECTOR"],
  day: "MON",
  timeWindow: { start: "13:00", end: "15:00", flexible: false },
  setupMinutes: 15,
  cleanupMinutes: 15,
};

const state: SchoolState = {
  dateForDay: "2026-08-17",
  hours: { startMinutes: 420, endMinutes: 1200, weekdaysOnly: true },
  rooms: [
    {
      id: "r1",
      code: "R01",
      name: "Phòng học 1",
      roomType: "CLASSROOM",
      building: "A",
      floor: "1",
      capacity: 40,
      status: "ACTIVE",
      features: { PROJECTOR: true },
    },
    {
      id: "r2",
      code: "R02",
      name: "Phòng học 2",
      roomType: "CLASSROOM",
      building: "A",
      floor: "1",
      capacity: 20,
      status: "ACTIVE",
      features: { PROJECTOR: true },
    },
    {
      id: "r3",
      code: "R03",
      name: "Phòng học 3",
      roomType: "CLASSROOM",
      building: "STEM",
      floor: "2",
      capacity: 40,
      status: "ACTIVE",
      features: { PROJECTOR: true },
    },
  ],
  occupancy: [
    {
      roomId: "r3",
      startAt: "2026-08-17T13:30:00.000Z",
      endAt: "2026-08-17T14:15:00.000Z",
      kind: "TIMETABLE",
      label: "10A1 · Toán",
    },
  ],
  pendingHolds: [
    {
      requestId: "hold-1",
      roomId: "r1",
      startAt: "2026-08-17T13:00:00.000Z",
      endAt: "2026-08-17T15:00:00.000Z",
      createdAt: "2026-08-16T00:00:00.000Z",
      active: true,
    },
  ],
};

const result: PlanResult = {
  kind: "PLANS",
  engineVersion: "test",
  plans: [
    {
      roomId: "r1",
      roomCode: "R01",
      startAt: "2026-08-17T13:00:00.000Z",
      endAt: "2026-08-17T15:00:00.000Z",
      score: 81.2,
      hardPassed: true,
      soft: {
        roomTypeFit: 0.7,
        buildingFit: 0.7,
        capacityEfficiency: 0.75,
        holdRisk: 0.35,
        timeFit: 1,
      },
      reasons: [],
      tradeoffs: [],
      pendingConflictRisk: 0.35,
    },
  ],
};

describe("facility room map", () => {
  it("keeps physical status separate from deterministic eligibility", () => {
    const map = buildFacilityRoomMap(state, request, result);
    expect(map.find((room) => room.id === "r1")).toMatchObject({
      status: "SOFT_HOLD",
      eligibility: "RECOMMENDED",
      recommendationRank: 1,
    });
    expect(map.find((room) => room.id === "r2")).toMatchObject({
      status: "AVAILABLE",
      eligibility: "REJECTED",
      rejectionReason: "CAPACITY",
    });
    expect(map.find((room) => room.id === "r3")).toMatchObject({
      status: "OCCUPIED",
      eligibility: "REJECTED",
      rejectionReason: "TIMETABLE_CONFLICT",
    });
  });
});
