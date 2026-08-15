import { can, chatAllowed } from "@ed4u/domain";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { AcceptAppointmentButton } from "./AcceptAppointmentButton";
import {
  AppointmentConversation,
  AppointmentCreatePanel,
  StudentRescheduleActions,
  TeacherAppointmentActions,
} from "./AppointmentWorkflow";

function formatDateTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default async function AppointmentsPage() {
  const actor = await requireActor();
  const [tenant, list] = await Promise.all([
    db.tenant.findUniqueOrThrow({ where: { id: actor.tenantId }, select: { timezone: true } }),
    db.appointment.findMany({
      where: {
        tenantId: actor.tenantId,
        OR: [{ studentId: actor.userId }, { teacherId: actor.userId }],
      },
      include: { conversation: { include: { messages: { orderBy: { createdAt: "asc" } } } } },
      orderBy: { startAt: "asc" },
      take: 30,
    }),
  ]);
  const participantIds = [
    ...new Set(
      list.flatMap((appointment) => [
        appointment.studentId,
        appointment.teacherId,
        ...(appointment.conversation?.messages.map((message) => message.senderId) ?? []),
      ]),
    ),
  ];
  const users = await db.user.findMany({
    where: { tenantId: actor.tenantId, id: { in: participantIds } },
    select: { id: true, fullName: true },
  });
  const userName = new Map(users.map((user) => [user.id, user.fullName]));
  const canCreate =
    can(actor, "appointment.create") &&
    actor.memberType === "STUDENT" &&
    actor.membershipStatus === "ACTIVE";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Lịch hẹn giáo viên"
        description="Học sinh gửi yêu cầu → giáo viên chấp nhận / từ chối / đề xuất giờ khác. Chat riêng chỉ mở sau khi lịch được chấp nhận."
      />
      {canCreate ? <AppointmentCreatePanel /> : null}

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--ink)]">
          {actor.memberType === "STUDENT" ? "Lịch hẹn của bạn" : "Lịch hẹn cần xử lý"}
        </h2>
        {list.length === 0 ? (
          <EmptyState
            title="Chưa có lịch hẹn"
            description={
              canCreate
                ? "Mô tả nhu cầu và chọn giáo viên ở phía trên."
                : "Không có lịch hẹn nào thuộc tài khoản này."
            }
          />
        ) : (
          <div className="space-y-4">
            {list.map((appointment) => {
              const isTeacher = appointment.teacherId === actor.userId;
              const isStudent = appointment.studentId === actor.userId;
              const messages =
                appointment.conversation?.messages.map((message) => ({
                  id: message.id,
                  senderName: userName.get(message.senderId) ?? "Thành viên ED4U",
                  body: message.body,
                  createdAt: formatDateTime(message.createdAt, tenant.timezone),
                  mine: message.senderId === actor.userId,
                })) ?? [];
              return (
                <Card key={appointment.id} className="p-5" data-testid="appointment-card">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-[var(--ink)]">{appointment.title}</h3>
                        <StatusBadge status={appointment.status} />
                      </div>
                      <p className="mt-2 text-sm text-[var(--body)]">
                        {formatDateTime(appointment.startAt, tenant.timezone)} →{" "}
                        {formatDateTime(appointment.endAt, tenant.timezone)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Học sinh: {userName.get(appointment.studentId) ?? "—"} · Giáo viên:{" "}
                        {userName.get(appointment.teacherId) ?? "—"}
                      </p>
                      {appointment.responseNote ? (
                        <p className="mt-3 rounded-lg bg-[var(--surface-soft)] p-3 text-xs text-[var(--body)]">
                          {appointment.responseNote}
                        </p>
                      ) : null}
                      {appointment.status === "RESCHEDULE_PROPOSED" &&
                      appointment.proposedStartAt &&
                      appointment.proposedEndAt ? (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                          <p className="font-semibold">Khung giờ được đề xuất</p>
                          <p className="mt-1">
                            {formatDateTime(appointment.proposedStartAt, tenant.timezone)} →{" "}
                            {formatDateTime(appointment.proposedEndAt, tenant.timezone)}
                          </p>
                          {isStudent ? (
                            <StudentRescheduleActions appointmentId={appointment.id} />
                          ) : null}
                        </div>
                      ) : null}

                      {isTeacher && appointment.status === "REQUESTED" ? (
                        <div className="mt-3 flex flex-col gap-2">
                          <AcceptAppointmentButton appointmentId={appointment.id} />
                          <TeacherAppointmentActions appointmentId={appointment.id} />
                        </div>
                      ) : null}

                      {chatAllowed(appointment.status) && appointment.conversation ? (
                        <AppointmentConversation
                          appointmentId={appointment.id}
                          messages={messages}
                        />
                      ) : (
                        <p className="mt-3 text-[11px] text-[var(--muted)]">
                          Chat chưa mở. Hội thoại được tạo khi lịch hẹn được chấp nhận.
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
