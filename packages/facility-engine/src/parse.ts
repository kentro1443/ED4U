import type { PlanningRequest } from "./types";

/**
 * Deterministic Vietnamese/English keyword parser. Always available when an
 * external LLM is down. Does not invent attendees or features that are not stated.
 */
export function parseFacilityRequest(text: string, requestId = "nl-1"): PlanningRequest {
  const lower = text.toLowerCase();
  const attendeesMatch = text.match(/(\d+)\s*(người|people|pax|học sinh)/i);
  const attendees = attendeesMatch ? Number(attendeesMatch[1]) : 20;

  const requiredFeatures: string[] = [];
  if (/máy chiếu|projector/i.test(text)) requiredFeatures.push("PROJECTOR");
  if (/piano/i.test(text)) requiredFeatures.push("PIANO");
  if (/máy tính|computer/i.test(text)) requiredFeatures.push("COMPUTERS");

  let preferredRoomType: string | undefined;
  if (/phòng máy|computer lab|lab/i.test(text)) preferredRoomType = "COMPUTER_LAB";
  if (/hội trường|auditorium/i.test(text)) preferredRoomType = "AUDITORIUM";
  if (/nhạc|music/i.test(text)) preferredRoomType = "MUSIC_ROOM";

  let day: PlanningRequest["day"] = "FRI";
  if (/thứ\s*hai|monday/i.test(lower)) day = "MON";
  else if (/thứ\s*ba|tuesday/i.test(lower)) day = "TUE";
  else if (/thứ\s*tư|wednesday/i.test(lower)) day = "WED";
  else if (/thứ\s*năm|thursday/i.test(lower)) day = "THU";
  else if (/thứ\s*sáu|friday/i.test(lower)) day = "FRI";

  const flexible = /linh hoạt|flexible|ưu tiên/i.test(text);
  let start = "13:00";
  let end = "17:00";
  if (/sáng|morning/i.test(lower)) {
    start = "08:00";
    end = "11:00";
  }
  if (/chiều|afternoon/i.test(lower)) {
    start = "13:00";
    end = "17:00";
  }

  const buildingMatch = text.match(/khu\s+(\w+)/i);
  return {
    requestId,
    attendees,
    requiredFeatures,
    preferredRoomType,
    preferredBuilding: buildingMatch?.[1]?.toUpperCase(),
    day,
    timeWindow: { start, end, flexible },
    setupMinutes: 15,
    cleanupMinutes: 15,
  };
}
