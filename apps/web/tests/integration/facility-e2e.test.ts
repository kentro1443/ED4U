import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planRooms, type PlanningRequest } from "@ed4u/facility-engine";
import { civilDateKey, civilInZone, civilDateTimeToInstant } from "@ed4u/domain";
import { buildFacilitySchoolState } from "../../src/lib/facility/state";
import { approveRoomRequestTx } from "../../src/features/services/roomBooking";
import { createTestClient } from "./harness";

const db = createTestClient();
const db2 = createTestClient();
let tenantId = "";
let adminId = "";
let studentA = "";
let studentB = "";
let timezone = "Asia/Ho_Chi_Minh";
const createdRequestIds: string[] = [];

beforeAll(async () => {
  const tenant = await db.tenant.findFirstOrThrow({ where: { slug: "ed4u-demo" } });
  tenantId = tenant.id;
  timezone = tenant.timezone;
  const [admin, a, b] = await Promise.all([
    db.schoolMembership.findFirstOrThrow({ where: { tenantId, schoolMemberCode: "AD000001" } }),
    db.schoolMembership.findFirstOrThrow({ where: { tenantId, schoolMemberCode: "HS000002" } }),
    db.schoolMembership.findFirstOrThrow({ where: { tenantId, schoolMemberCode: "HS000003" } }),
  ]);
  adminId = admin.userId;
  studentA = a.userId;
  studentB = b.userId;
});

afterAll(async () => {
  if (createdRequestIds.length) {
    await db.notification.deleteMany({ where: { tenantId, entityId: { in: createdRequestIds } } });
    await db.auditEvent.deleteMany({ where: { tenantId, entityId: { in: createdRequestIds } } });
    await db.roomBooking.deleteMany({ where: { requestId: { in: createdRequestIds } } });
    await db.roomRequest.deleteMany({ where: { id: { in: createdRequestIds } } });
  }
  await Promise.all([db.$disconnect(), db2.$disconnect()]);
});

describe("Facility E2E live state and concurrency", () => {
  it("adapts confirmed bookings as hard conflicts and pending holds as soft risk", async () => {
    const confirmed = await db.roomRequest.findFirstOrThrow({
      where: { tenantId, status: "APPROVED", room: { code: "R04" } },
    });
    const date = civilDateKey(civilInZone(confirmed.eventStart, timezone));
    const context = await buildFacilitySchoolState(db, { tenantId, date });
    const request: PlanningRequest = {
      requestId: "facility-live-state-test",
      attendees: 80,
      requiredFeatures: ["PROJECTOR"],
      preferredRoomType: "AUDITORIUM",
      day: context.day,
      timeWindow: { start: "16:00", end: "18:00", flexible: false },
      setupMinutes: 15,
      cleanupMinutes: 15,
    };
    const result = planRooms(context.state, request);
    expect(result.kind).toBe("PLANS");
    if (result.kind !== "PLANS") return;

    expect(result.plans.some((plan) => plan.roomCode === "R04")).toBe(false);
    const softHoldPlan = result.plans.find((plan) => plan.roomCode === "R16");
    expect(softHoldPlan).toBeDefined();
    expect(softHoldPlan?.pendingConflictRisk).toBeGreaterThan(0);
    expect(softHoldPlan?.hardPassed).toBe(true);
  });

  it("serializes two real PostgreSQL approvals for one room so exactly one wins", async () => {
    const room = await db.room.findFirstOrThrow({ where: { tenantId, code: "R10" } });
    const start = civilDateTimeToInstant(
      { year: 2026, month: 8, day: 17, hour: 18, minute: 0 },
      timezone,
    );
    const end = civilDateTimeToInstant(
      { year: 2026, month: 8, day: 17, hour: 19, minute: 0 },
      timezone,
    );
    const requests = await Promise.all(
      [studentA, studentB].map((studentId) =>
        db.roomRequest.create({
          data: {
            tenantId,
            roomId: room.id,
            requestedBy: studentId,
            status: "PENDING_APPROVAL",
            eventStart: start,
            eventEnd: end,
            setupMinutes: 15,
            cleanupMinutes: 15,
            holdCreatedAt: new Date(),
            purpose: "Concurrency integration test",
          },
        }),
      ),
    );
    createdRequestIds.push(...requests.map((request) => request.id));

    const results = await Promise.allSettled([
      approveRoomRequestTx(db, { requestId: requests[0]!.id, actorId: adminId, tenantId }),
      approveRoomRequestTx(db2, { requestId: requests[1]!.id, actorId: adminId, tenantId }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    const bookings = await db.roomBooking.findMany({
      where: { requestId: { in: createdRequestIds }, cancelledAt: null },
    });
    expect(bookings).toHaveLength(1);
    const statuses = await db.roomRequest.findMany({
      where: { id: { in: createdRequestIds } },
      select: { status: true },
    });
    expect(statuses.filter((request) => request.status === "APPROVED")).toHaveLength(1);
    expect(statuses.filter((request) => request.status === "PENDING_APPROVAL")).toHaveLength(1);
  });
});
