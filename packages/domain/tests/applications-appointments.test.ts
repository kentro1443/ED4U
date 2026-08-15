import { describe, expect, it } from "vitest";
import {
  acceptAppointmentEffects,
  acceptTransfer,
  chatAllowed,
  nextSubmissionVersion,
  requestTransfer,
  transitionApplication,
} from "../src/index";

describe("application versioning and transfer", () => {
  it("never overwrites a reviewed PDF; resubmit increments version", () => {
    const v1 = nextSubmissionVersion([], "file-a", "stu");
    expect(v1.ok).toBe(true);
    if (!v1.ok) return;
    const v2 = nextSubmissionVersion([v1.value], "file-b", "stu");
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;
    expect(v2.value.versionNumber).toBe(2);
    expect(v2.value.fileId).toBe("file-b");
    expect(v1.value.fileId).toBe("file-a");
  });

  it("keeps teacher A as assignee until B accepts", () => {
    const requested = requestTransfer({ currentTeacherId: "A", pendingTransferTo: null }, "A", "B");
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;
    expect(requested.value.currentTeacherId).toBe("A");
    expect(requested.value.pendingTransferTo).toBe("B");
    const accepted = acceptTransfer(requested.value, "B");
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.value.currentTeacherId).toBe("B");
    expect(accepted.value.pendingTransferTo).toBeNull();
  });

  it("rejects illegal application transitions", () => {
    const r = transitionApplication("REJECTED", "APPROVED");
    expect(r.ok).toBe(false);
  });
});

describe("appointment ACCEPT creates calendar + chat in one transaction description", () => {
  it("returns calendar projection, conversation, and notifications together", () => {
    const effects = acceptAppointmentEffects({
      title: "Gặp cô Lan",
      startAt: new Date("2026-08-18T15:00:00Z"),
      endAt: new Date("2026-08-18T15:30:00Z"),
      studentId: "stu",
      teacherId: "tea",
    });
    expect(effects.appointmentStatus).toBe("ACCEPTED");
    expect(effects.calendarProjection.source).toBe("APPOINTMENT");
    expect(effects.calendarProjection.persistedEventRow).toBe(false);
    expect(effects.conversation.kind).toBe("APPOINTMENT");
    expect(effects.conversation.participantIds).toEqual(["stu", "tea"]);
    expect(effects.notifications).toHaveLength(2);
    expect(chatAllowed("REQUESTED")).toBe(false);
    expect(chatAllowed("ACCEPTED")).toBe(true);
  });
});
