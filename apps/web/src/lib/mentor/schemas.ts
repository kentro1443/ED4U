import { z } from "zod";
import { StudentRequestSchema } from "@ed4u/mentor-engine";

/* -------------------------------------------------------------------------- */
/* Payload for MentorMatchRequest                                             */
/* -------------------------------------------------------------------------- */

export const MentorMatchPayloadV1Schema = z.strictObject({
  schemaVersion: z.literal("mentor-match-payload.v1"),
  rawText: z.string(),
  canonicalRequest: StudentRequestSchema,
  parsedSummary: z
    .object({
      domain: z.string(),
      focusSkills: z.array(z.string()),
      maxPricePerHour: z.number().optional(),
      availability: z.array(z.string()),
      verifiedOnly: z.boolean().optional(),
      unhandled: z.array(z.string()).optional(),
    })
    .optional(),
  createdAt: z.string(),
});

export type MentorMatchPayloadV1 = z.infer<typeof MentorMatchPayloadV1Schema>;

/* -------------------------------------------------------------------------- */
/* Snapshot for MentorRecommendationRun                                       */
/* -------------------------------------------------------------------------- */

const MentorRecommendationSchema = z.object({
  mentorId: z.string(),
  rank: z.number(),
  matchScore: z.number(),
  scoreBreakdown: z.record(z.string(), z.number()),
  appliedWeights: z.record(z.string(), z.number()),
  reasons: z.array(z.string()),
  tradeoffs: z.array(z.string()),
  dataCoverage: z.number(),
});

const MatchDiagnosticsSchema = z.object({
  candidateCount: z.number(),
  eligibleCount: z.number(),
  filteredOut: z.record(z.string(), z.number()).optional(),
  filteredOutByReason: z.record(z.string(), z.number()).optional(),
  latencyMs: z.number(),
  noFeasibleMatch: z.boolean().optional(),
  focusSkills: z.array(z.string()).optional(),
});

const RequestResolutionSchema = z.object({
  status: z.enum(["RESOLVED", "PARTIALLY_RESOLVED", "UNRESOLVED"]),
  coverage: z.number(),
  resolved: z.array(
    z.object({
      kind: z.string(),
      raw: z.string(),
      canonical: z.string(),
      status: z.enum(["RESOLVED", "SEMANTICALLY_RESOLVED"]),
    }),
  ),
  unresolved: z.array(
    z.object({
      kind: z.string(),
      raw: z.string(),
      status: z.string(),
      reason: z.string(),
      candidates: z.array(z.string()).optional(),
    }),
  ),
});

const MatchResponseSchema = z.object({
  engineVersion: z.string(),
  packageVersion: z.string(),
  schemaVersion: z.string(),
  configVersions: z.object({
    ontology: z.string(),
    aliases: z.string(),
    weights: z.string(),
  }),
  requestResolution: RequestResolutionSchema,
  recommendations: z.array(MentorRecommendationSchema),
  diagnostics: MatchDiagnosticsSchema,
});

export const MentorDisplayNodeSchema = z.object({
  mentorId: z.string(),
  fullName: z.string(),
  headline: z.string().nullable(),
  clusterKey: z.string(),
  pricePerHour: z.number(),
  verified: z.boolean(),
  school: z.string().nullable().optional(),
  rating: z.number().nullable().optional(),
  ratingCount: z.number().nullable().optional(),
  expertise: z.array(z.string()).optional(),
  availability: z.array(z.string()).optional(),
});

export type MentorDisplayNode = z.infer<typeof MentorDisplayNodeSchema>;

export const MentorRunSnapshotV1Schema = z.strictObject({
  schemaVersion: z.literal("mentor-run-snapshot.v1"),
  engineVersion: z.string(),
  result: MatchResponseSchema,
  hardConstraintSnapshot: z.object({
    eligible: z.array(z.string()),
    rejected: z.array(
      z.object({
        mentorId: z.string(),
        reasons: z.array(z.string()),
      }),
    ),
  }),
  mentorDisplaySnapshot: z.array(MentorDisplayNodeSchema),
  createdAt: z.string(),
});

export type MentorRunSnapshotV1 = z.infer<typeof MentorRunSnapshotV1Schema>;

export function parseMentorMatchPayload(json: unknown): MentorMatchPayloadV1 | null {
  const parsed = MentorMatchPayloadV1Schema.safeParse(json);
  if (!parsed.success) {
    console.error("Failed to parse MentorMatchPayload:", parsed.error.format());
    return null;
  }
  return parsed.data;
}

export function parseMentorRunSnapshot(json: unknown): MentorRunSnapshotV1 | null {
  const parsed = MentorRunSnapshotV1Schema.safeParse(json);
  if (!parsed.success) {
    console.error("Failed to parse MentorRunSnapshot:", parsed.error.format());
    return null;
  }
  return parsed.data;
}
