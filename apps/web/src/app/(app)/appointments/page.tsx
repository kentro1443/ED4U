import { chatAllowed } from "@ed4u/domain";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { AcceptAppointmentButton } from "./AcceptAppointmentButton";

export default async function AppointmentsPage() {
  const actor = await requireActor();
  // An appointment is private to its two participants. Tenant scope alone would
  // show every student's meetings to every user.
  const list = await db.appointment.findMany({
    where: {
      tenantId: actor.tenantId,
      OR: [{ studentId: actor.userId }, { teacherId: actor.userId }],
    },
    include: { conversation: { include: { messages: true } } },
    orderBy: { startAt: "asc" },
    take: 20,
  });
  return (
    <div>
      <PageHeader title="Lịch hẹn" description="Chat chỉ mở sau khi giáo viên chấp nhận." />
      {list.length === 0 ? (
        <EmptyState
          title="Chưa có lịch hẹn"
          action="Lịch hẹn bạn tạo hoặc được mời sẽ xuất hiện ở đây."
        />
      ) : null}
      <ul className="space-y-3">
        {list.map((a) => (
          <li key={a.id} className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4">
            <p className="font-medium">{a.title}</p>
            <p className="text-sm">{a.status}</p>
            {a.status === "REQUESTED" && a.teacherId === actor.userId ? (
              <AcceptAppointmentButton appointmentId={a.id} />
            ) : null}
            {chatAllowed(a.status) && a.conversation ? (
              <p className="mt-2 text-sm">Hội thoại · {a.conversation.messages.length} tin</p>
            ) : (
              <p className="mt-2 text-xs text-[var(--muted)]">Chưa có chat.</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
