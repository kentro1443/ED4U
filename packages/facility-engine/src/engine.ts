import { hardReject, intervalIso } from "./hard";
import { scoreRoom } from "./score";
import {
  ENGINE_VERSION,
  type FacilityPlan,
  type PlanResult,
  type PlanningRequest,
  type SchoolState,
} from "./types";

export function planRooms(state: SchoolState, request: PlanningRequest): PlanResult {
  const failCounts = new Map<string, number>();
  const candidates: FacilityPlan[] = [];

  for (const room of state.rooms) {
    const reject = hardReject(room, request, state.occupancy, state.hours, state.dateForDay);
    if (reject) {
      failCounts.set(reject, (failCounts.get(reject) ?? 0) + 1);
      continue;
    }
    const scored = scoreRoom(room, request, state.pendingHolds);
    const window = intervalIso(state.dateForDay, request.timeWindow.start, request.timeWindow.end);
    candidates.push({
      roomId: room.id,
      roomCode: room.code,
      startAt: window.startAt,
      endAt: window.endAt,
      score: scored.score,
      hardPassed: true,
      soft: scored.soft,
      reasons: scored.reasons,
      tradeoffs: scored.tradeoffs,
      pendingConflictRisk: scored.pendingConflictRisk,
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.roomCode.localeCompare(b.roomCode));
  const top = candidates.slice(0, 3);

  if (top.length === 0) {
    const blockers = [...failCounts.entries()].map(([reason, count]) => ({
      reason: reason as FacilityPlan extends never ? never : import("./types.js").HardFailReason,
      count,
      detail: describeBlocker(reason, count),
    }));
    return {
      kind: "NO_SOLUTION",
      engineVersion: ENGINE_VERSION,
      blockers,
      alternatives: proposeAlternatives(failCounts),
    };
  }

  return { kind: "PLANS", plans: top, engineVersion: ENGINE_VERSION };
}

function describeBlocker(reason: string, count: number): string {
  switch (reason) {
    case "CAPACITY":
      return `${count} phòng không đủ sức chứa.`;
    case "MISSING_FEATURE":
      return `${count} phòng thiếu tiện ích bắt buộc.`;
    case "TIMETABLE_CONFLICT":
      return `${count} phòng trùng thời khóa biểu.`;
    case "CONFIRMED_BOOKING_CONFLICT":
      return `${count} phòng đã có lịch xác nhận.`;
    case "MAINTENANCE_BLOCK":
      return `${count} phòng đang bảo trì.`;
    case "OUTSIDE_HOURS":
      return `Khung giờ ngoài giờ hoạt động.`;
    case "ROOM_NOT_ACTIVE":
      return `${count} phòng không hoạt động.`;
    default:
      return `${count} phòng bị loại bởi ${reason}.`;
  }
}

function proposeAlternatives(
  failCounts: Map<string, number>,
): { description: string; relaxes: string[] }[] {
  const alts: { description: string; relaxes: string[] }[] = [];
  if (failCounts.has("CAPACITY")) {
    alts.push({
      description: "Giảm số người hoặc tách thành hai ca.",
      relaxes: ["preferred capacity"],
    });
  }
  if (failCounts.has("MISSING_FEATURE")) {
    alts.push({
      description: "Bỏ một tiện ích không bắt buộc (không tự nới ràng buộc cứng).",
      relaxes: ["soft feature preference"],
    });
  }
  if (failCounts.has("TIMETABLE_CONFLICT") || failCounts.has("CONFIRMED_BOOKING_CONFLICT")) {
    alts.push({
      description: "Thử khung giờ khác trong ngày.",
      relaxes: ["preferred time"],
    });
  }
  if (alts.length === 0) {
    alts.push({
      description: "Chọn phòng và giờ thủ công — đường dẫn thủ công luôn hoạt động.",
      relaxes: [],
    });
  }
  return alts;
}

/** No-solution never auto-creates a RoomRequest. */
export function shouldAutoCreateRequest(result: PlanResult): false {
  void result;
  return false;
}
