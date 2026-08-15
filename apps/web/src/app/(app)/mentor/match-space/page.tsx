import { matchMentors, validateMentors, validateStudentRequest } from "@ed4u/mentor-engine";
import { toEngineCandidates } from "@ed4u/domain";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { MatchSpaceView } from "@/features/mentor/MatchSpaceView";
import { requireActor } from "@/lib/authz";

export default async function MatchSpacePage() {
  const actor = await requireActor();
  const profiles = await db.mentorProfile.findMany({ where: { tenantId: actor.tenantId } });
  const scoped = toEngineCandidates(
    profiles.map((p) => ({
      id: p.id,
      tenantId: p.tenantId,
      verified: p.verified,
      name: p.headline,
      expertise: p.expertise,
      availability: p.availability,
      pricePerHour: p.pricePerHour,
    })),
    actor.tenantId,
  );

  let nodes = scoped.map((p) => ({
    mentorId: p.id,
    matchScore: 50,
    eligible: p.verified,
    rejectionReasons: p.verified ? [] : ["unverified"],
    clusterKey: p.expertise[0] ?? "IELTS",
  }));

  const requestResult = validateStudentRequest({
    requestId: "demo-ielts",
    goal: { domain: "IELTS", focusSkills: ["IELTS.WRITING"] },
    hardConstraints: {
      verifiedOnly: true,
      maxPricePerHour: 250_000,
      requiredExpertise: [],
      requireAllAvailability: false,
    },
    availability: ["TUE_19_00"],
    softPreferences: { teachingStyles: [], languages: [] },
    additionalPreferences: [],
  });

  const mentorResult = validateMentors(
    scoped.map((p, i) => ({
      id: p.id,
      name: p.name,
      birthYear: 2000,
      gender: "undisclosed",
      verified: p.verified,
      credentials: {
        ielts: { overall: 8, listening: 8, reading: 8, writing: 8, speaking: 8 },
        sat: null,
        hsk: null,
      },
      expertise: p.expertise.length ? p.expertise : ["IELTS.WRITING"],
      availability: p.availability.length ? p.availability : ["TUE_19_00"],
      pricePerHour: p.pricePerHour,
      sessionsCompleted: 20 + i,
      teachingExperienceMonths: 18,
      rating: 4.6,
      ratingCount: 12,
      teachingStyles: ["PATIENT"],
      languages: ["VI"],
    })),
  );

  if (requestResult.ok && mentorResult.ok) {
    const result = matchMentors({
      request: requestResult.value,
      mentors: mentorResult.value,
      topK: 8,
    });
    const recIds = new Set(result.recommendations.map((r) => r.mentorId));
    nodes = [
      ...result.recommendations.map((r) => ({
        mentorId: r.mentorId,
        matchScore: r.matchScore,
        eligible: true,
        rejectionReasons: [] as string[],
        clusterKey: "IELTS",
      })),
      ...mentorResult.value
        .filter((m) => !recIds.has(m.id))
        .map((m) => ({
          mentorId: m.id,
          matchScore: 0,
          eligible: false,
          rejectionReasons: ["filtered out by hard constraints or outside Top-K"],
          clusterKey: "IELTS",
        })),
    ];
  }

  return (
    <div>
      <PageHeader
        title="Mentor Match Space"
        description="Khoảng cách = hàm đơn điệu của (1 − matchScore). Gần hơn = phù hợp hơn."
      />
      <MatchSpaceView requestId="demo-ielts" engineVersion="mentor-engine-v1.0.0" mentors={nodes} />
    </div>
  );
}
