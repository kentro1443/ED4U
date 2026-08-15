import { StateTransitionError, err, ok, type Result } from "./errors";

export const APPOINTMENT_STATUSES = [
  "REQUESTED",
  "ACCEPTED",
  "DECLINED",
  "RESCHEDULE_PROPOSED",
  "CANCELLED",
  "COMPLETED",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

const TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  REQUESTED: ["ACCEPTED", "DECLINED", "RESCHEDULE_PROPOSED", "CANCELLED"],
  ACCEPTED: ["CANCELLED", "COMPLETED", "RESCHEDULE_PROPOSED"],
  DECLINED: [],
  RESCHEDULE_PROPOSED: ["ACCEPTED", "DECLINED", "CANCELLED", "REQUESTED"],
  CANCELLED: [],
  COMPLETED: [],
};

export function canTransitionAppointment(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transitionAppointment(
  from: AppointmentStatus,
  to: AppointmentStatus,
): Result<AppointmentStatus, StateTransitionError> {
  if (!canTransitionAppointment(from, to)) {
    return err(
      new StateTransitionError(`Không thể chuyển lịch hẹn từ ${from} sang ${to}.`, { from, to }),
    );
  }
  return ok(to);
}

export interface AcceptAppointmentEffects {
  appointmentStatus: "ACCEPTED";
  calendarProjection: {
    source: "APPOINTMENT";
    persistedEventRow: false;
    title: string;
    startAt: Date;
    endAt: Date;
    visibility: "PRIVATE";
    studentId: string;
    teacherId: string;
  };
  conversation: {
    kind: "APPOINTMENT";
    participantIds: [string, string];
  };
  notifications: Array<{ userId: string; type: "APPOINTMENT_ACCEPTED" }>;
}

/**
 * On ACCEPT the system must atomically create calendar projection + private
 * conversation + notifications. Chat exists only after acceptance.
 */
export function acceptAppointmentEffects(input: {
  title: string;
  startAt: Date;
  endAt: Date;
  studentId: string;
  teacherId: string;
}): AcceptAppointmentEffects {
  return {
    appointmentStatus: "ACCEPTED",
    calendarProjection: {
      source: "APPOINTMENT",
      persistedEventRow: false,
      title: input.title,
      startAt: input.startAt,
      endAt: input.endAt,
      visibility: "PRIVATE",
      studentId: input.studentId,
      teacherId: input.teacherId,
    },
    conversation: {
      kind: "APPOINTMENT",
      participantIds: [input.studentId, input.teacherId],
    },
    notifications: [
      { userId: input.studentId, type: "APPOINTMENT_ACCEPTED" },
      { userId: input.teacherId, type: "APPOINTMENT_ACCEPTED" },
    ],
  };
}

export function chatAllowed(status: AppointmentStatus): boolean {
  return status === "ACCEPTED" || status === "COMPLETED" || status === "RESCHEDULE_PROPOSED";
}
