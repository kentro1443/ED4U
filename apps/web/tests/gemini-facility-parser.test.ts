import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/gemini", () => ({
  generateGeminiStructured: vi.fn(),
  geminiModel: () => "gemini-test-model",
}));

import { generateGeminiStructured } from "@/lib/ai/gemini";
import { parseFacilityPromptWithGemini } from "@/lib/facility/gemini-parser";

const generate = vi.mocked(generateGeminiStructured);

const context = {
  localToday: "2026-08-16",
  timeZone: "Asia/Ho_Chi_Minh",
  allowedRoomTypes: ["AUDITORIUM", "CLASSROOM"],
  allowedFeatures: ["PROJECTOR", "COMPUTERS"],
  allowedBuildings: ["A", "STEM"],
};

function extraction(overrides: Record<string, unknown> = {}) {
  return {
    attendees: 80,
    date: null,
    day: "MON",
    start: "13:00",
    end: "17:00",
    requiredFeatures: ["PROJECTOR"],
    preferredRoomType: "AUDITORIUM",
    preferredBuilding: null,
    flexible: false,
    notes: [],
    ...overrides,
  };
}

describe("Gemini facility parser boundary", () => {
  beforeEach(() => generate.mockReset());

  it("returns only canonical values supported by the current school catalog", async () => {
    generate.mockResolvedValue(extraction());

    const parsed = await parseFacilityPromptWithGemini({
      rawText: "80 người chiều thứ Hai, cần máy chiếu, ưu tiên hội trường",
      ...context,
    });

    expect(parsed).toMatchObject({
      attendees: 80,
      day: "MON",
      start: "13:00",
      end: "17:00",
      requiredFeatures: ["PROJECTOR"],
      preferredRoomType: "AUDITORIUM",
      flexible: false,
    });
  });

  it("reports and excludes model values absent from the tenant catalog", async () => {
    generate.mockResolvedValue(
      extraction({
        requiredFeatures: ["PROJECTOR", "HOLOGRAM"],
        preferredRoomType: "SPACE_STATION",
        preferredBuilding: "MOON",
      }),
    );

    const parsed = await parseFacilityPromptWithGemini({
      rawText: "Cần hologram ở khu Mặt Trăng",
      ...context,
    });

    expect(parsed.requiredFeatures).toEqual(["PROJECTOR"]);
    expect(parsed.preferredRoomType).toBeNull();
    expect(parsed.preferredBuilding).toBeNull();
    expect(parsed.notes.join(" ")).toContain("HOLOGRAM");
    expect(parsed.notes.join(" ")).toContain("SPACE_STATION");
    expect(parsed.notes.join(" ")).toContain("MOON");
  });

  it("preserves an explicit date without inventing a weekday fallback", async () => {
    generate.mockResolvedValue(extraction({ date: "2026-08-18", day: "TUE" }));

    const parsed = await parseFacilityPromptWithGemini({
      rawText: "Ngày 18/8/2026",
      ...context,
    });

    expect(parsed.date).toBe("2026-08-18");
    expect(parsed.day).toBe("TUE");
  });

  it("keeps required fields unresolved when the student did not state them", async () => {
    generate.mockResolvedValue(
      extraction({ attendees: null, date: null, day: null, start: null, end: null }),
    );

    const parsed = await parseFacilityPromptWithGemini({
      rawText: "Mình cần một phòng phù hợp",
      ...context,
    });

    expect(parsed.attendees).toBeNull();
    expect(parsed.start).toBeNull();
    expect(parsed.notes.join(" ")).toContain("Chưa xác định số người");
    expect(parsed.notes.join(" ")).toContain("Chưa xác định ngày");
  });
});
