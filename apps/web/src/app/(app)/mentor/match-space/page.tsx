import {
  applyHardConstraints,
  matchMentors,
  validateMentors,
  validateStudentRequest,
} from "@ed4u/mentor-engine";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { MatchSpaceView } from "@/features/mentor/MatchSpaceView";
import { requireActor } from "@/lib/authz";
import { MENTOR_PROFILE_INCLUDE, toCanonicalMentors } from "@/lib/mentor/adapter";

/**
 * Slice 1 scope: this page now runs the real engine over real columns. What it
 * still lacks is a student-authored request — the request below is a fixed
 * demo request, clearly labelled as such in the UI. The input flow, the
 * deterministic parser and the persisted `MentorMatchRequest` /
 * `MentorRecommendationRun` arrive in Slice 4, and the visualisation itself is
 * rebuilt in Slice 5.
 *
 * What is gone: fabricated birth years, invented IELTS bands, a hard-coded
 * rating, and the silent `matchScore: 50` that rendered whenever validation
 * failed. A failure is now shown as a failure.
 */

const DEMO_REQUEST_ID = "demo-ielts-writing";

export default async function MatchSpacePage() {
  const actor = await requireActor();

  const profiles = await db.mentorProfile.findMany({
    where: { tenantId: actor.tenantId },
    include: MENTOR_PROFILE_INCLUDE,
    orderBy: { id: "asc" },
  });

  const { mentors: candidates, failures } = toCanonicalMentors(profiles);
  const nameById = new Map(profiles.map((p) => [p.id, p.user.fullName]));

  const requestResult = validateStudentRequest({
    requestId: DEMO_REQUEST_ID,
    goal: { domain: "IELTS", focusSkills: ["IELTS.WRITING"] },
    hardConstraints: {
      verifiedOnly: true,
      maxPricePerHour: 500_000,
      requiredExpertise: [],
      requireAllAvailability: false,
    },
    // A student who can study on most weekday evenings. Narrow availability is
    // a legitimate result (the engine rejects on AVAILABILITY), but a demo
    // request that leaves one survivor out of 24 shows nothing.
    availability: ["MON_17_30", "MON_18_00", "TUE_19_00", "TUE_20_00", "WED_17_00", "THU_18_30"],
    softPreferences: { teachingStyles: ["STRUCTURED"], languages: ["VI"] },
    additionalPreferences: [],
  });
  const mentorResult = validateMentors(candidates);

  // Validation failures are surfaced, never papered over with a placeholder
  // score. If the engine cannot run, the page says so and names the reason.
  const errors: string[] = [];
  if (!requestResult.ok) {
    errors.push(
      ...requestResult.issues.map((issue) => `Yêu cầu · ${issue.path}: ${issue.message}`),
    );
  }
  if (!mentorResult.ok) {
    errors.push(...mentorResult.issues.map((issue) => `Mentor · ${issue.path}: ${issue.message}`));
  }

  const result =
    requestResult.ok && mentorResult.ok
      ? matchMentors({ request: requestResult.value, mentors: mentorResult.value, topK: 8 })
      : null;

  // Why each excluded mentor was excluded, taken from the engine's own hard
  // constraint pass rather than described in prose by this page.
  const rejectionsById = new Map<string, string[]>(
    requestResult.ok && mentorResult.ok
      ? applyHardConstraints(requestResult.value, mentorResult.value).rejected.map((r) => [
          r.mentorId,
          r.reasons,
        ])
      : [],
  );

  const recommendedIds = new Set(result?.recommendations.map((r) => r.mentorId) ?? []);
  const nodes =
    result && mentorResult.ok
      ? [
          ...result.recommendations.map((r) => ({
            mentorId: r.mentorId,
            displayName: nameById.get(r.mentorId) ?? r.mentorId,
            matchScore: r.matchScore,
            eligible: true,
            rejectionReasons: [] as string[],
            clusterKey: "IELTS",
          })),
          ...mentorResult.value
            .filter((m) => !recommendedIds.has(m.id))
            .map((m) => ({
              mentorId: m.id,
              displayName: nameById.get(m.id) ?? m.id,
              matchScore: 0,
              eligible: false,
              // An eligible mentor that simply missed Top-K has no rejection
              // reason, and saying otherwise would be a small lie.
              rejectionReasons: rejectionsById.get(m.id) ?? ["Nằm ngoài Top-K"],
              clusterKey: "IELTS",
            })),
        ]
      : [];

  return (
    <div>
      <PageHeader
        title="Mentor Match Space"
        description="Khoảng cách = hàm đơn điệu của (1 − matchScore). Gần hơn = phù hợp hơn."
      />

      <p className="mb-4 rounded-lg border border-[var(--line)] bg-[var(--card)] p-3 text-sm text-[var(--muted)]">
        Đang dùng một yêu cầu mẫu cố định (IELTS Writing, tối đa 500.000 đ/giờ, chỉ mentor đã xác
        minh). Ô nhập yêu cầu của học sinh sẽ có ở giai đoạn sau.
      </p>

      {errors.length > 0 ? (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-[var(--clay)] bg-[var(--card)] p-4 text-sm"
        >
          <p className="font-medium">Không chạy được Mentor Engine.</p>
          <p className="mt-1 text-[var(--muted)]">
            Dữ liệu không hợp lệ theo hợp đồng của engine. Không có kết quả thay thế nào được hiển
            thị.
          </p>
          <ul className="mt-2 list-disc pl-5">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {failures.length > 0 ? (
        <div className="mb-4 rounded-lg border border-[var(--line)] bg-[var(--card)] p-4 text-sm">
          <p className="font-medium">
            {failures.length} hồ sơ mentor bị loại khỏi lượt chạy vì thiếu dữ liệu bắt buộc.
          </p>
          <ul className="mt-2 list-disc pl-5 text-[var(--muted)]">
            {failures.map((failure) => (
              <li key={failure.mentorId}>
                {failure.displayName} — {failure.reasons.join(" ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result ? (
        <MatchSpaceView
          requestId={DEMO_REQUEST_ID}
          engineVersion={result.engineVersion}
          mentors={nodes}
        />
      ) : null}
    </div>
  );
}
