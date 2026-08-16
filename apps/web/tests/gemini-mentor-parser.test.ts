import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/gemini", () => ({
  generateGeminiStructured: vi.fn(),
  geminiModel: () => "gemini-test-model",
}));

import { generateGeminiStructured } from "@/lib/ai/gemini";
import { parseMentorPromptWithGemini } from "@/lib/mentor/gemini-parser";

const generate = vi.mocked(generateGeminiStructured);

function extraction(overrides: Record<string, unknown> = {}) {
  return {
    domain: "IELTS",
    currentScore: 6,
    targetScore: 7,
    focusSkills: ["IELTS.WRITING"],
    maxPricePerHour: 250_000,
    verifiedOnly: true,
    requiredExpertise: [],
    requireAllAvailability: false,
    availability: ["TUE_19_00", "THU_19_00"],
    teachingStyles: ["STRUCTURED"],
    languages: ["VI"],
    gender: null,
    additionalPreferences: [],
    unhandled: [],
    notes: [],
    ...overrides,
  };
}

describe("Gemini mentor parser boundary", () => {
  beforeEach(() => generate.mockReset());

  it("maps structured extraction through the unchanged engine resolver", async () => {
    generate.mockResolvedValue(extraction());

    const parsed = await parseMentorPromptWithGemini("IELTS Writing 6 lên 7", "req-live-1");

    expect(parsed.canonicalRequest?.requestId).toBe("req-live-1");
    expect(parsed.canonicalRequest?.goal.focusSkills).toEqual(["IELTS.WRITING"]);
    expect(parsed.canonicalRequest?.hardConstraints.maxPricePerHour).toBe(250_000);
    expect(parsed.canonicalRequest?.hardConstraints.verifiedOnly).toBe(true);
  });

  it("redacts contact details before any remote parser sees the prompt", async () => {
    generate.mockResolvedValue(extraction());

    await parseMentorPromptWithGemini(
      "IELTS Writing, liên hệ student@example.com hoặc 0912345678",
      "req-live-2",
    );

    const call = generate.mock.calls[0]?.[0];
    expect(call?.contents).toContain("[email]");
    expect(call?.contents).toContain("[phone]");
    expect(call?.contents).not.toContain("student@example.com");
    expect(call?.contents).not.toContain("0912345678");
  });

  it("does not invent a numeric budget for a vague request", async () => {
    generate.mockResolvedValue(
      extraction({
        maxPricePerHour: null,
        notes: ["Ngân sách được mô tả mơ hồ."],
      }),
    );

    const parsed = await parseMentorPromptWithGemini("Cần mentor IELTS giá rẻ", "req-live-3");

    expect(parsed.maxPricePerHour).toBeUndefined();
    expect(parsed.canonicalRequest?.hardConstraints.maxPricePerHour).toBeUndefined();
  });

  it("keeps an off-scale model value out of the canonical request", async () => {
    generate.mockResolvedValue(extraction({ targetScore: 7.3 }));

    const parsed = await parseMentorPromptWithGemini("IELTS mục tiêu 7.3", "req-live-4");

    expect(parsed.canonicalRequest?.goal.targetScore).toBeUndefined();
    expect(parsed.unhandledFragments.join(" ")).toContain("7.3");
    expect(parsed.parserNotes.join(" ")).toContain("schema");
  });

  it("surfaces provider failure instead of silently using a fake parser", async () => {
    generate.mockRejectedValue(new Error("provider unavailable"));

    await expect(parseMentorPromptWithGemini("IELTS Writing", "req-live-5")).rejects.toThrow(
      "nhập tiêu chí thủ công",
    );
  });
});
