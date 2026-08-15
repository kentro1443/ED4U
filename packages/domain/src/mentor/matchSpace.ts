import { createHash } from "node:crypto";

export const MATCH_BANDS = [
  { min: 90, max: 100, id: "exceptional", label: "Exceptional fit" },
  { min: 80, max: 89.999, id: "strong", label: "Strong fit" },
  { min: 70, max: 79.999, id: "good", label: "Good fit" },
  { min: 0, max: 69.999, id: "exploratory", label: "Exploratory" },
] as const;

export const MATCH_SCORE_DISCLAIMER = "Match score ≠ probability";

export type ConstraintLens = "All" | "Eligible" | "Filtered out";

export interface MentorNodeInput {
  mentorId: string;
  matchScore: number;
  eligible: boolean;
  rejectionReasons: readonly string[];
  clusterKey?: string;
}

export interface MentorNodeLayout {
  mentorId: string;
  matchScore: number;
  eligible: boolean;
  rejectionReasons: readonly string[];
  /** Radial distance: monotonic in (1 - matchScore). Closer = higher score. */
  radius: number;
  angle: number;
  x: number;
  y: number;
  band: (typeof MATCH_BANDS)[number]["id"];
}

export interface MatchSpaceLayout {
  student: { x: 0; y: 0 };
  disclaimer: typeof MATCH_SCORE_DISCLAIMER;
  bands: typeof MATCH_BANDS;
  nodes: MentorNodeLayout[];
  engineVersion: string;
}

const MIN_R = 0.18;
const MAX_R = 1;

/** Distance is a strictly decreasing function of matchScore on [0, 100]. */
export function radiusFromScore(matchScore: number): number {
  const s = Math.min(100, Math.max(0, matchScore));
  return MIN_R + (1 - s / 100) * (MAX_R - MIN_R);
}

export function bandForScore(matchScore: number): (typeof MATCH_BANDS)[number]["id"] {
  if (matchScore >= 90) return "exceptional";
  if (matchScore >= 80) return "strong";
  if (matchScore >= 70) return "good";
  return "exploratory";
}

function stableAngle(seed: string, clusterKey: string | undefined, index: number): number {
  const h = createHash("sha256")
    .update(`${seed}|${clusterKey ?? ""}|${index}`)
    .digest();
  const n = h.readUInt32BE(0) / 0x1_0000_0000;
  let clusterOffset = 0;
  if (clusterKey) {
    const c = createHash("sha256").update(`cluster:${clusterKey}`).digest();
    clusterOffset = (c.readUInt32BE(0) / 0x1_0000_0000) * Math.PI * 2;
  }
  return clusterOffset + n * Math.PI * 2;
}

export function layoutMatchSpace(input: {
  requestId: string;
  engineVersion: string;
  mentors: readonly MentorNodeInput[];
  lens?: ConstraintLens;
}): MatchSpaceLayout {
  const lens = input.lens ?? "All";
  const seed = `${input.requestId}|${input.engineVersion}|${input.mentors.map((m) => m.mentorId).join(",")}`;
  const filtered = input.mentors.filter((m) => {
    if (lens === "Eligible") return m.eligible;
    if (lens === "Filtered out") return !m.eligible;
    return true;
  });

  const nodes: MentorNodeLayout[] = filtered.map((m, index) => {
    const radius = m.eligible ? radiusFromScore(m.matchScore) : MAX_R + 0.12 + (index % 5) * 0.01;
    const angle = stableAngle(seed, m.clusterKey, index);
    return {
      mentorId: m.mentorId,
      matchScore: m.matchScore,
      eligible: m.eligible,
      rejectionReasons: [...m.rejectionReasons],
      radius,
      angle,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      band: bandForScore(m.matchScore),
    };
  });

  return {
    student: { x: 0, y: 0 },
    disclaimer: MATCH_SCORE_DISCLAIMER,
    bands: MATCH_BANDS,
    nodes,
    engineVersion: input.engineVersion,
  };
}

export function distanceMonotonic(higherScore: number, lowerScore: number): boolean {
  return radiusFromScore(higherScore) < radiusFromScore(lowerScore);
}
