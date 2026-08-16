import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { generateGeminiStructured, GeminiConfigurationError } from "@/lib/ai/gemini";
import { z } from "zod";

describe("Gemini client configuration", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  it("fails explicitly when no server-side API key is configured", async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(
      generateGeminiStructured({
        schema: z.object({ value: z.string() }),
        systemInstruction: "Return JSON",
        contents: "test",
      }),
    ).rejects.toBeInstanceOf(GeminiConfigurationError);
  });
});
