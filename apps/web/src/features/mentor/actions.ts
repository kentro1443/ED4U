"use server";

import {
  applyHardConstraints,
  matchMentors,
  validateMentors,
  validateStudentRequest,
  type StudentRequest,
} from "@ed4u/mentor-engine";
import { can } from "@ed4u/domain";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { MENTOR_PROFILE_INCLUDE, toCanonicalMentors } from "@/lib/mentor/adapter";
import { parseMentorPrompt, type ParsedStudentRequestDTO } from "@/lib/mentor/parser";
import type { MentorMatchPayloadV1, MentorRunSnapshotV1 } from "@/lib/mentor/schemas";
import type { Prisma } from "@/generated/prisma/client";

export async function parsePromptAction(
  prompt: string,
): Promise<{ ok: true; data: ParsedStudentRequestDTO } | { ok: false; error: string }> {
  try {
    const actor = await requireActor();
    if (!can(actor, "mentor.match")) {
      return { ok: false, error: "Bạn không có quyền tìm kiếm mentor." };
    }
    const requestId = `req_${Date.now()}_${actor.userId.slice(0, 8)}`;
    const parsed = parseMentorPrompt(prompt, requestId);
    return { ok: true, data: parsed };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Lỗi phân tích yêu cầu." };
  }
}

export async function createMentorMatchRunAction(payload: {
  rawText: string;
  canonicalRequest: StudentRequest;
}): Promise<{ ok: true; runId: string } | { ok: false; error: string }> {
  try {
    const actor = await requireActor();

    // Invariant 14: Ensure actor has mentor.match permission and is an active student
    if (!can(actor, "mentor.match")) {
      return { ok: false, error: "Tài khoản của bạn không có quyền tìm kiếm mentor." };
    }
    if (actor.memberType !== "STUDENT" || actor.membershipStatus !== "ACTIVE") {
      return {
        ok: false,
        error: "Chỉ học sinh đang theo học (ACTIVE) mới được tạo yêu cầu tìm kiếm mentor.",
      };
    }

    // Validate request schema
    const reqValidation = validateStudentRequest(payload.canonicalRequest);
    if (!reqValidation.ok) {
      const issueMsg = reqValidation.issues.map((i) => `${i.path}: ${i.message}`).join("; ");
      return { ok: false, error: `Yêu cầu không hợp lệ: ${issueMsg}` };
    }
    const validatedRequest = reqValidation.value;

    // Invariant 5: Query candidate mentors belonging to actor.tenantId who have MENTOR role & GRADUATED status
    const profiles = await db.mentorProfile.findMany({
      where: {
        tenantId: actor.tenantId,
        user: {
          roles: { some: { role: "MENTOR" } },
          memberships: { some: { membershipStatus: "GRADUATED" } },
        },
      },
      include: MENTOR_PROFILE_INCLUDE,
      orderBy: { id: "asc" },
    });

    if (profiles.length === 0) {
      return { ok: false, error: "Không tìm thấy hồ sơ mentor nào trong trường của bạn." };
    }

    const { mentors: candidates } = toCanonicalMentors(profiles);
    const mentorValidation = validateMentors(candidates);
    if (!mentorValidation.ok) {
      const issueMsg = mentorValidation.issues.map((i) => `${i.path}: ${i.message}`).join("; ");
      return { ok: false, error: `Dữ liệu mentor không đạt chuẩn: ${issueMsg}` };
    }

    // Run hard constraint evaluation to record historical eligible/rejected snapshot
    const hardConstraintResult = applyHardConstraints(validatedRequest, mentorValidation.value);

    // Run engine matching
    const matchResponse = matchMentors({
      request: validatedRequest,
      mentors: mentorValidation.value,
      topK: 8,
    });

    // Build minimal mentor display snapshot for historical reproducibility
    const mentorDisplaySnapshot = profiles.map((p) => {
      let clusterKey = "GENERAL";
      if (p.ieltsOverall !== null || p.credentialsCheckedDomains.includes("IELTS")) {
        clusterKey = "IELTS";
      } else if (p.satTotal !== null || p.credentialsCheckedDomains.includes("SAT")) {
        clusterKey = "SAT";
      } else if (p.hskLevel !== null || p.credentialsCheckedDomains.includes("HSK")) {
        clusterKey = "HSK";
      }

      return {
        mentorId: p.id,
        fullName: p.user.fullName,
        headline: p.headline,
        clusterKey,
        pricePerHour: p.pricePerHour,
        verified: p.verified,
        school: p.school,
        rating: p.rating,
        ratingCount: p.ratingCount,
        expertise: p.expertise,
        availability: p.availability,
      };
    });

    // Prepare immutable snapshots
    const matchPayload: MentorMatchPayloadV1 = {
      schemaVersion: "mentor-match-payload.v1",
      rawText: payload.rawText,
      canonicalRequest: validatedRequest,
      parsedSummary: {
        domain: validatedRequest.goal.domain,
        focusSkills: validatedRequest.goal.focusSkills,
        maxPricePerHour: validatedRequest.hardConstraints.maxPricePerHour,
        availability: validatedRequest.availability,
        verifiedOnly: validatedRequest.hardConstraints.verifiedOnly,
        unhandled: validatedRequest.additionalPreferences,
      },
      createdAt: new Date().toISOString(),
    };

    const runSnapshot: MentorRunSnapshotV1 = {
      schemaVersion: "mentor-run-snapshot.v1",
      engineVersion: matchResponse.engineVersion,
      result: matchResponse,
      hardConstraintSnapshot: {
        eligible: hardConstraintResult.eligible.map((m) => m.id),
        rejected: hardConstraintResult.rejected.map((r) => ({
          mentorId: r.mentorId,
          reasons: r.reasons,
        })),
      },
      mentorDisplaySnapshot,
      createdAt: new Date().toISOString(),
    };

    // Persist in transaction
    const [_, run] = await db.$transaction([
      db.mentorMatchRequest.create({
        data: {
          id: validatedRequest.requestId,
          tenantId: actor.tenantId,
          studentId: actor.userId,
          rawText: payload.rawText,
          payload: matchPayload as unknown as Prisma.InputJsonValue,
        },
      }),
      db.mentorRecommendationRun.create({
        data: {
          requestId: validatedRequest.requestId,
          engineVersion: matchResponse.engineVersion,
          result: runSnapshot as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);

    return { ok: true, runId: run.id };
  } catch (err) {
    console.error("createMentorMatchRunAction error:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Đã xảy ra lỗi khi chạy Mentor Engine.",
    };
  }
}
