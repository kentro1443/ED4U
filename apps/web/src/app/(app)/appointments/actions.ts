"use server";

import { revalidatePath } from "next/cache";
import { acceptAppointmentEffects, transitionAppointment } from "@ed4u/domain";
import { currentActor } from "@/lib/auth";
import { db } from "@/lib/db";

export async function acceptAppointmentAction(formData: FormData) {
  const actor = await currentActor();
  if (!actor) return;
  const id = String(formData.get("id"));
  await db.$transaction(async (tx) => {
    const apt = await tx.appointment.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!apt) return;
    const next = transitionAppointment(apt.status, "ACCEPTED");
    if (!next.ok) return;
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
  revalidatePath("/appointments");
  revalidatePath("/calendar");
}
