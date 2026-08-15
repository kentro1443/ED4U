import type { PendingHold, PlanningRequest, RoomSnapshot, SoftBreakdown } from "./types";
import { parseHm } from "./hard";

export function scoreRoom(
  room: RoomSnapshot,
  request: PlanningRequest,
  holds: readonly PendingHold[],
): {
  score: number;
  soft: SoftBreakdown;
  reasons: string[];
  tradeoffs: string[];
  pendingConflictRisk: number;
} {
  const roomTypeFit = request.preferredRoomType
    ? room.roomType === request.preferredRoomType
      ? 1
      : 0.35
    : 0.7;
  const buildingFit = request.preferredBuilding
    ? room.building === request.preferredBuilding
      ? 1
      : 0.4
    : 0.7;
  const waste = Math.max(0, room.capacity - request.attendees);
  const capacityEfficiency = 1 - Math.min(1, waste / Math.max(room.capacity, 1));
  const start = parseHm(request.timeWindow.start);
  const end = parseHm(request.timeWindow.end);
  const overlappingHolds = holds.filter((h) => {
    if (!h.active || h.roomId !== room.id) return false;
    const hs = new Date(h.startAt);
    const he = new Date(h.endAt);
    const hStart = hs.getUTCHours() * 60 + hs.getUTCMinutes();
    const hEnd = he.getUTCHours() * 60 + he.getUTCMinutes();
    return start < hEnd && hStart < end;
  });
  const holdRisk = overlappingHolds.length === 0 ? 0 : Math.min(1, overlappingHolds.length * 0.35);
  const timeFit = 1;

  const soft: SoftBreakdown = { roomTypeFit, buildingFit, capacityEfficiency, holdRisk, timeFit };
  const score =
    100 *
    (0.28 * roomTypeFit +
      0.18 * buildingFit +
      0.32 * capacityEfficiency +
      0.14 * (1 - holdRisk) +
      0.08 * timeFit);

  const reasons: string[] = [];
  if (room.capacity >= request.attendees) {
    reasons.push(`Sức chứa ${room.capacity} ≥ ${request.attendees} người.`);
  }
  if (request.preferredRoomType && room.roomType === request.preferredRoomType) {
    reasons.push(`Đúng loại phòng ${room.roomType}.`);
  }
  for (const f of request.requiredFeatures) {
    reasons.push(`Có tiện ích bắt buộc ${f}.`);
  }
  if (overlappingHolds.length > 0) {
    reasons.push(`${overlappingHolds.length} yêu cầu đang treo (soft hold) trùng khung giờ.`);
  }

  const tradeoffs: string[] = [];
  if (request.preferredRoomType && room.roomType !== request.preferredRoomType) {
    tradeoffs.push(`Loại phòng ${room.roomType} khác sở thích ${request.preferredRoomType}.`);
  }
  if (waste > request.attendees) {
    tradeoffs.push("Phòng lớn hơn nhu cầu — hiệu suất sức chứa thấp.");
  }
  if (holdRisk > 0) {
    tradeoffs.push("Có rủi ro xung đột với yêu cầu đang chờ duyệt.");
  }

  return {
    score: Math.round(score * 100) / 100,
    soft,
    reasons,
    tradeoffs,
    pendingConflictRisk: holdRisk,
  };
}
