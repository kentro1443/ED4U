import "server-only";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const DEFAULT_MODEL = "gemini-3.6-flash";

export class GeminiConfigurationError extends Error {
  constructor(
    message = "Gemini chưa được cấu hình. Hãy thêm GEMINI_API_KEY vào apps/web/.env.local rồi khởi động lại server.",
  ) {
    super(message);
    this.name = "GeminiConfigurationError";
  }
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new GeminiConfigurationError();
  // No apiVersion override: structured output (`responseJsonSchema`) only exists
  // on the SDK's default Gemini API surface. Pinning "v1" makes every request
  // fail with INVALID_ARGUMENT for an unknown `responseJsonSchema` field.
  return new GoogleGenAI({ apiKey });
}

/**
 * Gemini accepts a documented subset of JSON Schema. Zod emits keywords outside
 * that subset (`$schema`, `pattern`, `exclusiveMinimum`/`exclusiveMaximum`), and
 * the API rejects the whole request when it sees them. Strip them for the wire
 * format only — the response is still validated against the full Zod schema, so
 * format rules stay deterministic and enforced on our side.
 */
const UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  "$schema",
  "$id",
  "pattern",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "additionalProperties",
]);

function toGeminiJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toGeminiJsonSchema);
  if (value === null || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (UNSUPPORTED_SCHEMA_KEYWORDS.has(key)) continue;
    result[key] = toGeminiJsonSchema(child);
  }
  return result;
}

export async function generateGeminiStructured<T>({
  schema,
  systemInstruction,
  contents,
  signal,
}: {
  schema: z.ZodType<T>;
  systemInstruction: string;
  contents: string;
  signal?: AbortSignal;
}): Promise<T> {
  if (signal?.aborted) throw signal.reason ?? new Error("Gemini request was aborted");

  const client = createGeminiClient();
  const response = await client.models.generateContent({
    model: geminiModel(),
    contents,
    config: {
      systemInstruction,
      temperature: 0,
      responseMimeType: "application/json",
      responseJsonSchema: toGeminiJsonSchema(z.toJSONSchema(schema, { target: "draft-7" })),
      abortSignal: signal,
    },
  });

  const text = response.text?.trim();
  if (!text) throw new Error("Gemini không trả về dữ liệu phân tích.");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Gemini trả về JSON không hợp lệ.");
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Dữ liệu Gemini không khớp schema: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}
