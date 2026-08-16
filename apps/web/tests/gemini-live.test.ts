import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseFacilityPromptWithGemini } from "@/lib/facility/gemini-parser";
import { parseMentorPromptWithGemini } from "@/lib/mentor/gemini-parser";

const LIVE = process.env.GEMINI_LIVE_TESTS === "true" && Boolean(process.env.GEMINI_API_KEY);

describe.runIf(LIVE)("Gemini live semantic parsing", () => {
  it.each([
    [
      "Em IELTS khoảng 6.0, Writing yếu, muốn lên 7.0, tối thứ 3, tối đa 250k/giờ.",
      "IELTS",
      "IELTS.WRITING",
      250_000,
    ],
    ["Cần SAT Math target 1450, chiều thứ 6, chỉ mentor đã xác minh.", "SAT", "SAT.MATH", null],
    ["Em học HSK 3 lên 5, tối thứ 2 và thứ 4, thích dạy có cấu trúc.", "HSK", null, null],
  ])(
    "parses mentor request: %s",
    async (prompt, domain, skill, budget) => {
      const parsed = await parseMentorPromptWithGemini(prompt, `live-${domain}`);
      expect(parsed.domain).toBe(domain);
      if (skill) expect(parsed.focusSkills).toContain(skill);
      if (budget) expect(parsed.maxPricePerHour).toBe(budget);
      expect(parsed.canonicalRequest).toBeDefined();
    },
    30_000,
  );

  it.each([
    ["80 người, chiều thứ Hai, cần máy chiếu, ưu tiên hội trường", 80, "MON"],
    ["35 người, sáng thứ Ba, cần máy tính, ưu tiên phòng máy", 35, "TUE"],
    ["20 người, thứ Năm từ 18:00-20:00, cần máy chiếu", 20, "THU"],
  ])(
    "parses facility request: %s",
    async (prompt, attendees, day) => {
      const parsed = await parseFacilityPromptWithGemini({
        rawText: prompt,
        localToday: "2026-08-16",
        timeZone: "Asia/Ho_Chi_Minh",
        allowedRoomTypes: ["AUDITORIUM", "COMPUTER_LAB", "CLASSROOM"],
        allowedFeatures: ["PROJECTOR", "COMPUTERS"],
        allowedBuildings: ["A", "STEM"],
      });
      expect(parsed.attendees).toBe(attendees);
      expect(parsed.day).toBe(day);
    },
    30_000,
  );
});
