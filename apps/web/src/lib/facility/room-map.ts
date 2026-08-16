import {
  hardReject,
  parseHm,
  type HardFailReason,
  type PlanResult,
  type PlanningRequest,
  type SchoolState,
} from "@ed4u/facility-engine";

export type FacilityRoomMapStatus =
  "AVAILABLE" | "OCCUPIED" | "SOFT_HOLD" | "MAINTENANCE" | "UNAVAILABLE";

export interface FacilityRoomMapItem {
  id: string;
  code: string;
  name: string;
  building: string;
  floor: string;
  capacity: number;
  roomType: string;
  status: FacilityRoomMapStatus;
  statusLabel: string;
  eligibility: "RECOMMENDED" | "ELIGIBLE" | "REJECTED";
  rejectionReason: HardFailReason | null;
  rejectionLabel: string | null;
  recommendationRank: number | null;
  recommendationScore: number | null;
}

function intervalMinutes(iso: string) {
  const date = new Date(iso);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

function rejectionLabel(reason: HardFailReason) {
  const labels: Record<HardFailReason, string> = {
    ROOM_NOT_ACTIVE: "Phòng không hoạt động",
    CAPACITY: "Không đủ sức chứa",
    MISSING_FEATURE: "Thiếu tiện ích bắt buộc",
    TIMETABLE_CONFLICT: "Trùng thời khóa biểu",
    CONFIRMED_BOOKING_CONFLICT: "Đã có booking xác nhận",
    MAINTENANCE_BLOCK: "Đang trong khung bảo trì",
    OUTSIDE_HOURS: "Ngoài giờ hoạt động",
    EXACT_TIME: "Không khớp giờ yêu cầu",
  };
  return labels[reason];
}

export function buildFacilityRoomMap(
  state: SchoolState,
  request: PlanningRequest,
  result: PlanResult,
): FacilityRoomMapItem[] {
  const requestStart = parseHm(request.timeWindow.start) - (request.setupMinutes ?? 0);
  const requestEnd = parseHm(request.timeWindow.end) + (request.cleanupMinutes ?? 0);
  const recommended = new Map(
    result.kind === "PLANS"
      ? result.plans.map((plan, index) => [plan.roomId, { rank: index + 1, score: plan.score }])
      : [],
  );

  return state.rooms.map((room) => {
    const reject = hardReject(room, request, state.occupancy, state.hours, state.dateForDay);
    const roomOccupancy = state.occupancy.filter((slot) => {
      if (slot.roomId !== room.id) return false;
      return overlaps(
        requestStart,
        requestEnd,
        intervalMinutes(slot.startAt),
        intervalMinutes(slot.endAt),
      );
    });
    const hasMaintenance = roomOccupancy.some((slot) => slot.kind === "MAINTENANCE_BLOCK");
    const hasHardOccupancy = roomOccupancy.some(
      (slot) => slot.kind === "TIMETABLE" || slot.kind === "CONFIRMED_BOOKING",
    );
    const hasSoftHold = state.pendingHolds.some(
      (hold) =>
        hold.active &&
        hold.roomId === room.id &&
        overlaps(
          requestStart,
          requestEnd,
          intervalMinutes(hold.startAt),
          intervalMinutes(hold.endAt),
        ),
    );

    let status: FacilityRoomMapStatus = "AVAILABLE";
    let statusLabel = "Trống trong khung giờ";
    if (room.status !== "ACTIVE") {
      status = "UNAVAILABLE";
      statusLabel = "Không hoạt động";
    } else if (hasMaintenance) {
      status = "MAINTENANCE";
      statusLabel = "Bảo trì";
    } else if (hasHardOccupancy) {
      status = "OCCUPIED";
      statusLabel = "Đã có lịch cứng";
    } else if (hasSoftHold) {
      status = "SOFT_HOLD";
      statusLabel = "Có soft hold";
    }

    const recommendation = recommended.get(room.id);
    return {
      id: room.id,
      code: room.code,
      name: room.name,
      building: room.building,
      floor: room.floor,
      capacity: room.capacity,
      roomType: room.roomType,
      status,
      statusLabel,
      eligibility: recommendation ? "RECOMMENDED" : reject ? "REJECTED" : "ELIGIBLE",
      rejectionReason: reject,
      rejectionLabel: reject ? rejectionLabel(reject) : null,
      recommendationRank: recommendation?.rank ?? null,
      recommendationScore: recommendation?.score ?? null,
    };
  });
}
