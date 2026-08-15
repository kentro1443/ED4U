import { acceptAppointmentEffects, chatAllowed } from "@ed4u/domain";
import { currentActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { acceptAppointmentAction } from "./actions";

export default async function AppointmentsPage() {
  const actor = await currentActor();
  if (!actor) return null;
  const list = await db.appointment.findMany({
    where: { tenantId: actor.tenantId },
    include: { conversation: { include: { messages: true } } },
    take: 20,
  });
  return (
    <div>
      <PageHeader title="Lịch hẹn" description="Chat chỉ mở sau khi giáo viên chấp nhận." />
      <ul className="space-y-3">
        {list.map((a) => (
          <li key={a.id} className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4">
            <p className="font-medium">{a.title}</p>
            <p className="text-sm">{a.status}</p>
            {a.status === "REQUESTED" && actor.roles.includes("TEACHER") ? (
              <form action={acceptAppointmentAction}>
                <input type="hidden" name="id" value={a.id} />
                <button className="mt-2 rounded-full bg-[var(--pine)] px-3 py-1 text-sm text-white">
                  Chấp nhận
                </button>
              </form>
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

void acceptAppointmentEffects;
