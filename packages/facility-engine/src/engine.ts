import { hardReject, intervalIso, parseHm } from "./hard";
import { scoreRoom } from "./score";
import {
  ENGINE_VERSION,
  type FacilityPlan,
  type PlanResult,
  type PlanningRequest,
  type SchoolState,
} from "./types";

function hm(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Exact requests produce one window. A flexible request keeps the same duration
 * and explores nearby 30-minute alternatives up to ±2h, never outside the
 * school's hard operational window once setup/cleanup are included.
 */
function candidateWindows(request: PlanningRequest, state: SchoolState) {
  const preferredStart = parseHm(request.timeWindow.start);
  const preferredEnd = parseHm(request.timeWindow.end);
  const duration = preferredEnd - preferredStart;
  if (duration <= 0) return [{ start: request.timeWindow.start, end: request.timeWindow.end }];
  if (!request.timeWindow.flexible) {
    return [{ start: request.timeWindow.start, end: request.timeWindow.end }];
  }

  const setup = request.setupMinutes ?? 0;
  const cleanup = request.cleanupMinutes ?? 0;
  const minStart = state.hours.startMinutes + setup;
  const maxStart = state.hours.endMinutes - cleanup - duration;
  const offsets = [0, -30, 30, -60, 60, -90, 90, -120, 120];
  const seen = new Set<number>();
  return offsets
    .map((offset) => preferredStart + offset)
    .filter(
      (start) => start >= minStart && start <= maxStart && !seen.has(start) && seen.add(start),
    )
    .map((start) => ({ start: hm(start), end: hm(start + duration) }));
}

export function planRooms(state: SchoolState, request: PlanningRequest): PlanResult {
  const failCounts = new Map<string, number>();
  const candidates: FacilityPlan[] = [];
  const preferredStart = parseHm(request.timeWindow.start);
  const windows = candidateWindows(request, state);

  for (const room of state.rooms) {
    let best: FacilityPlan | null = null;
    let primaryReject: string | null = null;

    for (const window of windows) {
      const candidateRequest: PlanningRequest = {
        ...request,
        timeWindow: { ...window, flexible: request.timeWindow.flexible },
      };
      const reject = hardReject(
        room,
        candidateRequest,
        state.occupancy,
        state.hours,
        state.dateForDay,
      );
      if (reject) {
        primaryReject ??= reject;
        continue;
      }

      const scored = scoreRoom(room, candidateRequest, state.pendingHolds, preferredStart);
      const interval = intervalIso(state.dateForDay, window.start, window.end);
      const shifted = window.start !== request.timeWindow.start;
      const plan: FacilityPlan = {
        roomId: room.id,
        roomCode: room.code,
        startAt: interval.startAt,
        endAt: interval.endAt,
        score: scored.score,
        hardPassed: true,
        soft: scored.soft,
        reasons: [
          ...scored.reasons,
          ...(shifted
            ? [`Khung giờ thay thế ${window.start}–${window.end} vượt qua ràng buộc cứng.`]
            : []),
        ],
        tradeoffs: [
          ...scored.tradeoffs,
          ...(shifted
            ? [`Khác khung giờ ưu tiên ${request.timeWindow.start}–${request.timeWindow.end}.`]
            : []),
        ],
        pendingConflictRisk: scored.pendingConflictRisk,
      };
      if (
        best === null ||
        plan.score > best.score ||
        (plan.score === best.score &&
          Math.abs(parseHm(window.start) - preferredStart) <
            Math.abs(parseHm(best.startAt.slice(11, 16)) - preferredStart))
      ) {
        best = plan;
      }
    }

    if (best) candidates.push(best);
    else if (primaryReject) failCounts.set(primaryReject, (failCounts.get(primaryReject) ?? 0) + 1);
  }

  candidates.sort((a, b) => b.score - a.score || a.roomCode.localeCompare(b.roomCode));
  const top = candidates.slice(0, 3);

  if (top.length === 0) {
    const blockers = [...failCounts.entries()].map(([reason, count]) => ({
      reason: reason as import("./types.js").HardFailReason,
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
    alts.push({ description: "Thử khung giờ khác trong ngày.", relaxes: ["preferred time"] });
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
