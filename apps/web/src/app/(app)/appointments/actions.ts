"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  acceptAppointmentEffects,
  can,
  chatAllowed,
  civilDateTimeToInstant,
  civilInZone,
  periodOccurrence,
  transitionAppointment,
} from "@ed4u/domain";
import { db } from "@/lib/db";
import { assertRelated, assertTenant, requireActor, requirePermission } from "@/lib/authz";

function parseLocalDateTime(date: string, time: string, timeZone: string): Date {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) throw new Error("Ngày hoặc giờ không hợp lệ.");
  return civilDateTimeToInstant(
    {
      year: Number(d[1]),
      month: Number(d[2]),
      day: Number(d[3]),
      hour: Number(t[1]),
      minute: Number(t[2]),
    },
    timeZone,
  );
}

async function ensureActiveTeacher(tenantId: string, teacherId: string) {
  const profile = await db.teacherProfile.findFirst({
    where: {
      tenantId,
      userId: teacherId,
      user: {
        roles: { some: { role: "TEACHER" } },
        memberships: {
          some: { tenantId, memberType: "TEACHER", membershipStatus: "ACTIVE" },
        },
      },
    },
    include: { user: true },
  });
  if (!profile) throw new Error("Giáo viên không còn đủ điều kiện nhận lịch hẹn.");
  return profile;
}

async function assertAppointmentAvailability(input: {
  tenantId: string;
  studentId: string;
  teacherId: string;
  startAt: Date;
  endAt: Date;
  ignoreAppointmentId?: string;
}) {
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: input.tenantId },
    select: { timezone: true },
  });
  const [appointmentConflict, mentorConflict, teacherProfile] = await Promise.all([
    db.appointment.findFirst({
      where: {
        tenantId: input.tenantId,
        status: "ACCEPTED",
        ...(input.ignoreAppointmentId ? { id: { not: input.ignoreAppointmentId } } : {}),
        OR: [{ studentId: input.studentId }, { teacherId: input.teacherId }],
        startAt: { lt: input.endAt },
        endAt: { gt: input.startAt },
      },
      select: { id: true },
    }),
    db.mentorBooking.findFirst({
      where: {
        tenantId: input.tenantId,
        studentId: input.studentId,
        cancelledAt: null,
        startAt: { lt: input.endAt },
        endAt: { gt: input.startAt },
      },
      select: { id: true },
    }),
    db.teacherProfile.findFirst({
      where: { tenantId: input.tenantId, userId: input.teacherId },
      include: {
        blocks: { where: { startAt: { lt: input.endAt }, endAt: { gt: input.startAt } } },
      },
    }),
  ]);
  if (appointmentConflict) throw new Error("Khung giờ trùng một lịch hẹn đã được chấp nhận.");
  if (mentorConflict) throw new Error("Học sinh đã có lịch mentoring trong khung giờ này.");
  if (teacherProfile?.blocks.length)
    throw new Error(`Giáo viên đang bận: ${teacherProfile.blocks[0]!.reason}.`);

  const civil = civilInZone(input.startAt, tenant.timezone);
  const weekday = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][civil.weekday];
  if (weekday && weekday !== "SAT" && weekday !== "SUN") {
    const entries = await db.timetableEntry.findMany({
      where: {
        tenantId: input.tenantId,
        teacherId: input.teacherId,
        weekday: weekday as "MON" | "TUE" | "WED" | "THU" | "FRI",
      },
      include: { period: true },
    });
    for (const entry of entries) {
      const occurrence = periodOccurrence({
        anchor: input.startAt,
        weekday: entry.weekday,
        startTime: entry.period.startTime,
        endTime: entry.period.endTime,
        timeZone: tenant.timezone,
      });
      if (occurrence.startAt < input.endAt && occurrence.endAt > input.startAt) {
        throw new Error("Khung giờ trùng thời khóa biểu giảng dạy của giáo viên.");
      }
    }
  }
}

async function acceptAppointmentTx(appointmentId: string, actorId: string, tenantId: string) {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text FROM "Appointment"
      WHERE "id"=${appointmentId} AND "tenantId"=${tenantId}
      FOR UPDATE
    `;
    if (!rows[0]) throw new Error("Không tìm thấy lịch hẹn.");
    const appointment = await tx.appointment.findFirstOrThrow({
      where: { id: appointmentId, tenantId },
    });
    const transition = transitionAppointment(appointment.status, "ACCEPTED");
    if (!transition.ok) throw transition.error;

    // Availability check is deliberately re-run immediately before the state change.
    await assertAppointmentAvailability({
      tenantId,
      studentId: appointment.studentId,
      teacherId: appointment.teacherId,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      ignoreAppointmentId: appointment.id,
    });
    const effects = acceptAppointmentEffects({
      title: appointment.title,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      studentId: appointment.studentId,
      teacherId: appointment.teacherId,
    });
    await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        status: effects.appointmentStatus,
        proposedStartAt: null,
        proposedEndAt: null,
      },
    });
    await tx.conversation.upsert({
      where: { appointmentId: appointment.id },
      update: {},
      create: { appointmentId: appointment.id },
    });
    await tx.notification.createMany({
      data: effects.notifications.map((notification) => ({
        tenantId,
        userId: notification.userId,
        type: notification.type,
        title: "Lịch hẹn đã được xác nhận",
        body: appointment.title,
        entityType: "Appointment",
        entityId: appointment.id,
      })),
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId,
        action: "APPOINTMENT_ACCEPT",
        entityType: "Appointment",
        entityId: appointment.id,
        requestId: randomUUID(),
        beforeJson: { status: appointment.status },
        afterJson: { status: "ACCEPTED", startAt: appointment.startAt.toISOString() },
      },
    });
    return appointment;
  });
}

export async function createAppointmentAction(input: {
  teacherId: string;
  title: string;
  date: string;
  start: string;
  end: string;
}) {
  const actor = await requirePermission("appointment.create");
  if (actor.memberType !== "STUDENT" || actor.membershipStatus !== "ACTIVE") {
    return { ok: false as const, error: "Chỉ học sinh đang theo học mới được tạo lịch hẹn." };
  }
  try {
    const teacher = await ensureActiveTeacher(actor.tenantId, input.teacherId);
    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: actor.tenantId },
      select: { timezone: true },
    });
    const startAt = parseLocalDateTime(input.date, input.start, tenant.timezone);
    const endAt = parseLocalDateTime(input.date, input.end, tenant.timezone);
    const duration = endAt.getTime() - startAt.getTime();
    if (startAt.getTime() <= Date.now()) throw new Error("Lịch hẹn phải nằm trong tương lai.");
    if (duration < 15 * 60_000 || duration > 3 * 60 * 60_000)
      throw new Error("Thời lượng lịch hẹn phải từ 15 phút đến 3 giờ.");

    const created = await db.$transaction(async (tx) => {
      const appointment = await tx.appointment.create({
        data: {
          tenantId: actor.tenantId,
          studentId: actor.userId,
          teacherId: input.teacherId,
          title: input.title.trim() || "Tư vấn học sinh",
          startAt,
          endAt,
          status: "REQUESTED",
        },
      });
      await tx.notification.create({
        data: {
          tenantId: actor.tenantId,
          userId: input.teacherId,
          type: "APPOINTMENT_REQUESTED",
          title: "Có yêu cầu lịch hẹn mới",
          body: `${actor.schoolMemberCode} · ${appointment.title}`,
          entityType: "Appointment",
          entityId: appointment.id,
        },
      });
      return appointment;
    });
    revalidatePath("/appointments");
    return { ok: true as const, appointmentId: created.id, teacherName: teacher.user.fullName };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể tạo lịch hẹn.",
    };
  }
}

export async function acceptAppointmentAction(_previous: unknown, formData: FormData) {
  const actor = await requirePermission("appointment.accept");
  const id = String(formData.get("id") ?? "");
  try {
    const apt = await db.appointment.findUnique({ where: { id } });
    if (!apt) return { ok: false as const, error: "Không tìm thấy lịch hẹn." };
    assertTenant(actor, apt.tenantId);
    assertRelated(actor, [apt.teacherId], "Bạn không phải giáo viên của lịch hẹn này.");
    await acceptAppointmentTx(apt.id, actor.userId, actor.tenantId);
    revalidatePath("/appointments");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể chấp nhận lịch hẹn.",
    };
  }
}

export async function teacherRespondAppointmentAction(input: {
  appointmentId: string;
  action: "DECLINE" | "PROPOSE";
  date?: string;
  start?: string;
  end?: string;
  note?: string;
}) {
  const actor = await requirePermission("appointment.accept");
  try {
    const apt = await db.appointment.findFirstOrThrow({
      where: { id: input.appointmentId, tenantId: actor.tenantId },
    });
    assertRelated(actor, [apt.teacherId], "Bạn không phải giáo viên của lịch hẹn này.");
    const note = input.note?.trim() ?? "";
    if (input.action === "DECLINE") {
      if (!note) throw new Error("Từ chối lịch hẹn phải có lý do.");
      const transition = transitionAppointment(apt.status, "DECLINED");
      if (!transition.ok) throw transition.error;
      await db.$transaction(async (tx) => {
        await tx.appointment.update({
          where: { id: apt.id },
          data: { status: transition.value, responseNote: note },
        });
        await tx.notification.create({
          data: {
            tenantId: actor.tenantId,
            userId: apt.studentId,
            type: "APPOINTMENT_DECLINED",
            title: "Lịch hẹn bị từ chối",
            body: note,
            entityType: "Appointment",
            entityId: apt.id,
          },
        });
      });
    } else {
      if (!input.date || !input.start || !input.end)
        throw new Error("Hãy chọn khung giờ thay thế đầy đủ.");
      const tenant = await db.tenant.findUniqueOrThrow({
        where: { id: actor.tenantId },
        select: { timezone: true },
      });
      const proposedStartAt = parseLocalDateTime(input.date, input.start, tenant.timezone);
      const proposedEndAt = parseLocalDateTime(input.date, input.end, tenant.timezone);
      if (proposedEndAt <= proposedStartAt || proposedStartAt <= new Date())
        throw new Error("Khung giờ thay thế không hợp lệ.");
      const transition = transitionAppointment(apt.status, "RESCHEDULE_PROPOSED");
      if (!transition.ok) throw transition.error;
      await db.$transaction(async (tx) => {
        await tx.appointment.update({
          where: { id: apt.id },
          data: {
            status: transition.value,
            proposedStartAt,
            proposedEndAt,
            responseNote: note || null,
          },
        });
        await tx.notification.create({
          data: {
            tenantId: actor.tenantId,
            userId: apt.studentId,
            type: "APPOINTMENT_RESCHEDULE_PROPOSED",
            title: "Giáo viên đề xuất giờ khác",
            body: note || "Hãy xem và xác nhận khung giờ mới.",
            entityType: "Appointment",
            entityId: apt.id,
          },
        });
      });
    }
    revalidatePath("/appointments");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể xử lý lịch hẹn.",
    };
  }
}

export async function studentRespondRescheduleAction(appointmentId: string, accept: boolean) {
  const actor = await requirePermission("appointment.respond");
  try {
    const apt = await db.appointment.findFirstOrThrow({
      where: { id: appointmentId, tenantId: actor.tenantId },
    });
    assertRelated(actor, [apt.studentId], "Lịch hẹn này không thuộc tài khoản của bạn.");
    if (apt.status !== "RESCHEDULE_PROPOSED" || !apt.proposedStartAt || !apt.proposedEndAt) {
      throw new Error("Không có đề xuất đổi lịch đang chờ xử lý.");
    }
    if (!accept) {
      const transition = transitionAppointment(apt.status, "DECLINED");
      if (!transition.ok) throw transition.error;
      await db.appointment.update({ where: { id: apt.id }, data: { status: transition.value } });
    } else {
      await assertAppointmentAvailability({
        tenantId: actor.tenantId,
        studentId: apt.studentId,
        teacherId: apt.teacherId,
        startAt: apt.proposedStartAt,
        endAt: apt.proposedEndAt,
        ignoreAppointmentId: apt.id,
      });
      const transition = transitionAppointment(apt.status, "ACCEPTED");
      if (!transition.ok) throw transition.error;
      await db.$transaction(async (tx) => {
        await tx.appointment.update({
          where: { id: apt.id },
          data: {
            status: transition.value,
            startAt: apt.proposedStartAt!,
            endAt: apt.proposedEndAt!,
            proposedStartAt: null,
            proposedEndAt: null,
          },
        });
        await tx.conversation.upsert({
          where: { appointmentId: apt.id },
          update: {},
          create: { appointmentId: apt.id },
        });
        await tx.notification.create({
          data: {
            tenantId: actor.tenantId,
            userId: apt.teacherId,
            type: "APPOINTMENT_RESCHEDULE_ACCEPTED",
            title: "Học sinh đã chấp nhận giờ mới",
            body: apt.title,
            entityType: "Appointment",
            entityId: apt.id,
          },
        });
      });
    }
    revalidatePath("/appointments");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể phản hồi đề xuất đổi lịch.",
    };
  }
}

export async function sendAppointmentMessageAction(appointmentId: string, body: string) {
  const actor = await requireActor();
  const text = body.trim();
  if (!text || text.length > 3000)
    return { ok: false as const, error: "Tin nhắn phải có từ 1–3000 ký tự." };
  try {
    const apt = await db.appointment.findFirst({
      where: { id: appointmentId, tenantId: actor.tenantId },
      include: { conversation: true },
    });
    if (!apt) throw new Error("Không tìm thấy lịch hẹn.");
    assertRelated(actor, [apt.studentId, apt.teacherId], "Bạn không thuộc cuộc hẹn này.");
    if (!chatAllowed(apt.status) || !apt.conversation)
      throw new Error("Chat chỉ mở sau khi lịch hẹn được chấp nhận.");
    await db.message.create({
      data: { conversationId: apt.conversation.id, senderId: actor.userId, body: text },
    });
    revalidatePath("/appointments");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể gửi tin nhắn.",
    };
  }
}
