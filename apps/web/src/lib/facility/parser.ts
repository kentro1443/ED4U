import { addCivilDays, civilDateKey, civilInZone } from "@ed4u/domain";
import { parseFacilityRequest, type PlanningRequest } from "@ed4u/facility-engine";

export interface ParsedFacilityPrompt {
  attendees: number | null;
  date: string | null;
  day: PlanningRequest["day"] | null;
  start: string | null;
  end: string | null;
  requiredFeatures: string[];
  preferredRoomType: string | null;
  preferredBuilding: string | null;
  flexible: boolean;
  notes: string[];
}

export function parseFacilityPrompt(rawText: string): ParsedFacilityPrompt {
  const text = rawText.trim();
  const parsed = parseFacilityRequest(text, "preview");
  const attendees = text.match(/(\d+)\s*(?:người|people|pax|học sinh)/i);

  let day: PlanningRequest["day"] | null = null;
  if (/(?:thứ\s*hai|t2|monday|mon\b)/i.test(text)) day = "MON";
  else if (/(?:thứ\s*ba|t3|tuesday|tue\b)/i.test(text)) day = "TUE";
  else if (/(?:thứ\s*tư|t4|wednesday|wed\b)/i.test(text)) day = "WED";
  else if (/(?:thứ\s*năm|t5|thursday|thu\b)/i.test(text)) day = "THU";
  else if (/(?:thứ\s*sáu|t6|friday|fri\b)/i.test(text)) day = "FRI";

  let start: string | null = null;
  let end: string | null = null;
  const explicitRange =
    /(?:từ\s*)?(\d{1,2}):?(\d{2})?\s*(?:-|–|đến|to)\s*(\d{1,2}):?(\d{2})?/i.exec(text);
  if (explicitRange) {
    start = `${String(Number(explicitRange[1])).padStart(2, "0")}:${explicitRange[2] ?? "00"}`;
    end = `${String(Number(explicitRange[3])).padStart(2, "0")}:${explicitRange[4] ?? "00"}`;
  } else if (/(?:sáng|buổi sáng|morning)/i.test(text)) {
    start = "08:00";
    end = "11:00";
  } else if (/(?:chiều|buổi chiều|afternoon)/i.test(text)) {
    start = "13:00";
    end = "17:00";
  } else if (/(?:tối|buổi tối|evening)/i.test(text)) {
    start = "18:00";
    end = "20:00";
  }

  const notes: string[] = [];
  if (!attendees)
    notes.push("Chưa xác định số người; vui lòng nhập trước khi chạy bộ lập kế hoạch.");
  if (!day) notes.push("Chưa xác định ngày trong tuần; vui lòng chọn ngày cụ thể.");
  if (!start || !end) notes.push("Chưa xác định khung giờ; vui lòng chọn giờ bắt đầu và kết thúc.");

  return {
    attendees: attendees ? Number(attendees[1]) : null,
    date: null,
    day,
    start,
    end,
    requiredFeatures: parsed.requiredFeatures,
    preferredRoomType: parsed.preferredRoomType ?? null,
    preferredBuilding: parsed.preferredBuilding ?? null,
    flexible: /(?:linh hoạt\s*(?:thời gian|giờ)|giờ\s*linh hoạt|flexible\s*(?:time|hours?))/i.test(
      text,
    ),
    notes,
  };
}

const DAY_INDEX: Record<PlanningRequest["day"], number> = {
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
};

export function nextFacilityDateForDay(
  day: PlanningRequest["day"],
  timeZone: string,
  now: Date = new Date(),
): string {
  const local = civilInZone(now, timeZone);
  let delta = DAY_INDEX[day] - local.weekday;
  if (local.weekday === 0) delta = DAY_INDEX[day];
  if (delta < 0) delta += 7;
  const target = addCivilDays(local, delta);
  return civilDateKey(target);
}
