"use server";

import { revalidatePath } from "next/cache";
import { acceptAppointmentEffects, transitionAppointment } from "@ed4u/domain";
import { db } from "@/lib/db";
import { assertRelated, assertTenant, requirePermission } from "@/lib/authz";
import { toActionError, type ActionResult } from "@/lib/actionResult";

/**
 * Accepting an appointment requires three independent checks, in this order:
 *
 *  1. `appointment.accept` — only a TEACHER holds it.
 *  2. tenant boundary — the row must belong to the actor's school.
 *  3. assignee — the teacher must be *this* appointment's teacher.
 *
 * The permission alone is not sufficient: without check 3 any teacher could
 * accept any other teacher's appointments.
 */
export async function acceptAppointmentAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requirePermission("appointment.accept");
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Thiếu mã lịch hẹn." };

  try {
    await db.$transaction(async (tx) => {
      const apt = await tx.appointment.findUnique({ where: { id } });
      if (!apt) throw new Error("NOT_FOUND");
      assertTenant(actor, apt.tenantId);
      assertRelated(actor, [apt.teacherId], "Bạn không phải giáo viên của lịch hẹn này.");

      const next = transitionAppointment(apt.status, "ACCEPTED");
      if (!next.ok) throw next.error;

      const effects = acceptAppointmentEffects({
        title: apt.title,
        startAt: apt.startAt,
        endAt: apt.endAt,
        studentId: apt.studentId,
        teacherId: apt.teacherId,
      });

      await tx.appointment.update({ where: { id }, data: { status: effects.appointmentStatus } });
      await tx.conversation.create({ data: { appointmentId: id } });
      await tx.notification.createMany({
        data: effects.notifications.map((n) => ({
          tenantId: actor.tenantId,
          userId: n.userId,
          type: n.type,
          title: "Lịch hẹn được chấp nhận",
          body: apt.title,
        })),
      });
      await tx.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: "APPOINTMENT_ACCEPT",
          entityType: "Appointment",
          entityId: id,
          requestId: id,
        },
      });
    });
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/appointments");
  revalidatePath("/calendar");
  return { ok: true };
}
