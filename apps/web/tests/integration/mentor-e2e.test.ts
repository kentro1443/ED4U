import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestClient } from "./harness";
import type { PrismaClient } from "../../src/generated/prisma/client";
import {
  parseMentorMatchPayload,
  parseMentorRunSnapshot,
  type MentorMatchPayloadV1,
  type MentorRunSnapshotV1,
} from "../../src/lib/mentor/schemas";
import { nextSlotOccurrence } from "@ed4u/domain";
import { createMentorBookingTx } from "../../src/lib/mentor/bookingTx";

describe("Slice 3: Mentor E2E & Concurrency Integration Tests", () => {
  let db: PrismaClient;
  let tenantId: string;
  let studentAId: string;
  let studentBId: string;
  let mentorUserId: string;
  let mentorProfileId: string;

  beforeAll(async () => {
    db = createTestClient();
    const suffix = randomUUID().slice(0, 8);
    tenantId = randomUUID();

    await db.tenant.create({
      data: {
        id: tenantId,
        slug: `test-mentor-${suffix}`,
        name: `Mentor Test ${suffix}`,
        timezone: "Asia/Ho_Chi_Minh",
      },
    });

    studentAId = randomUUID();
    studentBId = randomUUID();
    mentorUserId = randomUUID();

    const PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=4$dGVzdHNhbHR0ZXN0$0000000000000000000000";

    await db.user.createMany({
      data: [
        { id: studentAId, tenantId, fullName: "Học sinh A", passwordHash: PASSWORD_HASH },
        { id: studentBId, tenantId, fullName: "Học sinh B", passwordHash: PASSWORD_HASH },
        {
          id: mentorUserId,
          tenantId,
          fullName: "Mentor Khôi",
          passwordHash: PASSWORD_HASH,
          dateOfBirth: new Date("2002-05-15"),
          gender: "MALE",
        },
      ],
    });

    await db.userRoleAssignment.create({
      data: {
        userId: mentorUserId,
        role: "MENTOR",
        assignedBy: "SYSTEM",
      },
    });

    await db.schoolMembership.createMany({
      data: [
        {
          tenantId,
          userId: studentAId,
          schoolMemberCode: `HSA-${suffix}`,
          memberType: "STUDENT",
          membershipStatus: "ACTIVE",
          startedAt: new Date(),
        },
        {
          tenantId,
          userId: studentBId,
          schoolMemberCode: `HSB-${suffix}`,
          memberType: "STUDENT",
          membershipStatus: "ACTIVE",
          startedAt: new Date(),
        },
        {
          tenantId,
          userId: mentorUserId,
          schoolMemberCode: `MEN-${suffix}`,
          memberType: "STUDENT",
          membershipStatus: "GRADUATED",
          startedAt: new Date("2020-09-01"),
        },
      ],
    });

    mentorProfileId = randomUUID();
    await db.mentorProfile.create({
      data: {
        id: mentorProfileId,
        tenantId,
        userId: mentorUserId,
        headline: "IELTS 8.0 chuyên Writing & Speaking",
        verified: true,
        credentialsCheckedDomains: ["IELTS"],
        ieltsOverall: 8.0,
        ieltsWriting: 8.0,
        ieltsSpeaking: 8.0,
        pricePerHour: 250_000,
        expertise: ["IELTS.WRITING", "IELTS.SPEAKING"],
        availability: ["TUE_19_00", "THU_19_00"],
        teachingStyles: ["STRUCTURED"],
        languages: ["VI"],
        graduationYear: 2024,
      },
    });
  });

  afterAll(async () => {
    await db.mentorBooking.deleteMany({ where: { tenantId } });
    await db.notification.deleteMany({ where: { tenantId } });
    await db.auditEvent.deleteMany({ where: { tenantId } });
    await db.mentorRecommendationRun.deleteMany({ where: { request: { tenantId } } });
    await db.mentorMatchRequest.deleteMany({ where: { tenantId } });
    await db.mentorProfile.deleteMany({ where: { tenantId } });
    await db.userRoleAssignment.deleteMany({ where: { user: { tenantId } } });
    await db.schoolMembership.deleteMany({ where: { tenantId } });
    await db.user.deleteMany({ where: { tenantId } });
    await db.tenant.deleteMany({ where: { id: tenantId } });
    await db.$disconnect();
  });

  it("persists and reads immutable MentorMatchRequest and MentorRecommendationRun", async () => {
    const reqId = randomUUID();

    const matchPayload: MentorMatchPayloadV1 = {
      schemaVersion: "mentor-match-payload.v1",
      rawText: "Em muốn học IELTS Writing",
      canonicalRequest: {
        requestId: reqId,
        goal: { domain: "IELTS", focusSkills: ["IELTS.WRITING"] },
        hardConstraints: {
          verifiedOnly: true,
          maxPricePerHour: 300_000,
          requiredExpertise: [],
          requireAllAvailability: false,
        },
        availability: ["TUE_19_00"],
        softPreferences: { teachingStyles: ["STRUCTURED"], languages: ["VI"] },
        additionalPreferences: [],
      },
      parsedSummary: {
        domain: "IELTS",
        focusSkills: ["IELTS.WRITING"],
        maxPricePerHour: 300_000,
        availability: ["TUE_19_00"],
        verifiedOnly: true,
      },
      createdAt: new Date().toISOString(),
    };

    const runSnapshot: MentorRunSnapshotV1 = {
      schemaVersion: "mentor-run-snapshot.v1",
      engineVersion: "mentor-engine-v1.0.0",
      result: {
        engineVersion: "mentor-engine-v1.0.0",
        packageVersion: "1.0.0",
        schemaVersion: "1.0.0",
        configVersions: { ontology: "1", aliases: "1", weights: "1" },
        requestResolution: { status: "RESOLVED", coverage: 1, resolved: [], unresolved: [] },
        recommendations: [
          {
            mentorId: mentorProfileId,
            rank: 1,
            matchScore: 95,
            scoreBreakdown: { SUBJECT_EXPERTISE: 0.95 },
            appliedWeights: { SUBJECT_EXPERTISE: 1.0 },
            reasons: ["IELTS 8.0 Writing"],
            tradeoffs: [],
            dataCoverage: 1.0,
          },
        ],
        diagnostics: { candidateCount: 1, eligibleCount: 1, latencyMs: 2.1 },
      },
      hardConstraintSnapshot: {
        eligible: [mentorProfileId],
        rejected: [],
      },
      mentorDisplaySnapshot: [
        {
          mentorId: mentorProfileId,
          fullName: "Mentor Khôi",
          headline: "IELTS 8.0",
          clusterKey: "IELTS",
          pricePerHour: 250_000,
          verified: true,
          availability: ["TUE_19_00", "THU_19_00"],
        },
      ],
      createdAt: new Date().toISOString(),
    };

    await db.mentorMatchRequest.create({
      data: {
        id: reqId,
        tenantId,
        studentId: studentAId,
        rawText: matchPayload.rawText,
        payload: matchPayload as any,
      },
    });

    const run = await db.mentorRecommendationRun.create({
      data: {
        requestId: reqId,
        engineVersion: "mentor-engine-v1.0.0",
        result: runSnapshot as any,
      },
    });

    const fetchedRun = await db.mentorRecommendationRun.findUnique({
      where: { id: run.id },
      include: { request: true },
    });

    expect(fetchedRun).not.toBeNull();
    const parsedPayload = parseMentorMatchPayload(fetchedRun!.request.payload);
    const parsedSnapshot = parseMentorRunSnapshot(fetchedRun!.result);

    expect(parsedPayload?.canonicalRequest.goal.domain).toBe("IELTS");
    expect(parsedSnapshot?.result.recommendations[0]?.matchScore).toBe(95);
  });

  it("handles concurrent bookings safely with exactly one winner for identical session instant", async () => {
    const slotPattern = "TUE_19_00";
    const { startAt, endAt } = nextSlotOccurrence(
      slotPattern,
      "Asia/Ho_Chi_Minh",
      new Date("2026-08-16T00:00:00.000Z"),
    );

    const bookForStudent = (studentId: string) =>
      createMentorBookingTx(db, {
        tenantId,
        studentId,
        mentorId: mentorProfileId,
        slotPattern,
        startAt,
        endAt,
        maxPricePerHour: 300_000,
      });

    const results = await Promise.allSettled([
      bookForStudent(studentAId),
      bookForStudent(studentBId),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    const savedBookings = await db.mentorBooking.findMany({
      where: { tenantId, mentorId: mentorProfileId, startAt, cancelledAt: null },
    });
    expect(savedBookings).toHaveLength(1);
  });
});
