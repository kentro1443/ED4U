import Link from "next/link";
import { addCivilDays, civilDateKey, civilInZone } from "@ed4u/domain";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { buildFacilitySchoolState } from "@/lib/facility/state";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";

function minutes(iso: string) {
  const match = /T(\d{2}):(\d{2})/.exec(iso);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function position(start: number, end: number, dayStart = 420, dayEnd = 1200) {
  const span = dayEnd - dayStart;
  const left = Math.max(0, ((start - dayStart) / span) * 100);
  const width = Math.max(1.2, ((end - start) / span) * 100);
  return { left: `${left}%`, width: `${Math.min(width, 100 - left)}%` };
}

export default async function RoomSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const actor = await requireActor();
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: actor.tenantId },
    select: { timezone: true },
  });
  const nowLocal = civilInZone(new Date(), tenant.timezone);
  const params = await searchParams;
  const fallbackDate =
    nowLocal.weekday === 0
      ? addCivilDays(nowLocal, 1)
      : nowLocal.weekday === 6
        ? addCivilDays(nowLocal, 2)
        : nowLocal;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "")
    ? params.date!
    : civilDateKey(fallbackDate);

  let context: Awaited<ReturnType<typeof buildFacilitySchoolState>> | null = null;
  let error: string | null = null;
  try {
    context = await buildFacilitySchoolState(db, { tenantId: actor.tenantId, date });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Không thể dựng lịch phòng.";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lịch sử dụng phòng"
        description="Chiếu trực tiếp từ thời khóa biểu, booking đã xác nhận, bảo trì và soft hold đang hoạt động. Soft hold chỉ là rủi ro, không phải khóa cứng."
        breadcrumbs={[{ label: "Phòng", href: "/rooms" }, { label: "Lịch phòng" }]}
      />
      <form className="flex flex-wrap items-end gap-2" method="get">
        <label className="text-xs font-semibold text-[var(--ink)]">
          Ngày
          <input
            name="date"
            type="date"
            defaultValue={date}
            className="ml-2 h-9 rounded-lg border border-[var(--hairline)] px-2 text-xs"
          />
        </label>
        <button
          type="submit"
          className="h-9 rounded-lg bg-[var(--primary)] px-3 text-xs font-semibold text-[var(--on-primary)]"
        >
          Xem lịch
        </button>
        <Link
          href="/rooms"
          className="h-9 rounded-lg border border-[var(--hairline)] px-3 py-2 text-xs font-semibold"
        >
          Quay lại bộ lập kế hoạch
        </Link>
      </form>

      {error || !context ? (
        <EmptyState
          title="Không thể hiển thị lịch phòng"
          description={error ?? "Không có dữ liệu."}
        />
      ) : (
        <div className="space-y-3 overflow-x-auto rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-4">
          <div className="min-w-[880px]">
            <div className="mb-3 grid grid-cols-[140px_1fr] gap-3 text-[10px] text-[var(--muted)]">
              <div>Phòng</div>
              <div className="relative h-5">
                {[7, 9, 11, 13, 15, 17, 19].map((hour) => (
                  <span
                    key={hour}
                    className="absolute -translate-x-1/2"
                    style={{ left: `${((hour * 60 - 420) / 780) * 100}%` }}
                  >
                    {String(hour).padStart(2, "0")}:00
                  </span>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {context.state.rooms.map((room) => {
                const hard = context!.state.occupancy.filter((slot) => slot.roomId === room.id);
                const holds = context!.state.pendingHolds.filter(
                  (hold) => hold.roomId === room.id && hold.active,
                );
                return (
                  <div
                    key={room.id}
                    className="grid min-h-12 grid-cols-[140px_1fr] gap-3 border-t border-[var(--hairline-soft)] py-2"
                  >
                    <div>
                      <p className="text-xs font-semibold text-[var(--ink)]">{room.code}</p>
                      <p className="truncate text-[10px] text-[var(--muted)]">{room.name}</p>
                    </div>
                    <div className="relative min-h-10 rounded-lg bg-[var(--surface-soft)]">
                      {hard.map((slot, index) => {
                        const style = position(minutes(slot.startAt), minutes(slot.endAt));
                        const tone =
                          slot.kind === "MAINTENANCE_BLOCK"
                            ? "bg-red-100 border-red-300 text-red-950"
                            : slot.kind === "CONFIRMED_BOOKING"
                              ? "bg-emerald-100 border-emerald-300 text-emerald-950"
                              : "bg-slate-200 border-slate-300 text-slate-900";
                        return (
                          <div
                            key={`${slot.kind}-${index}`}
                            className={`absolute top-1 h-8 overflow-hidden rounded-md border px-2 py-1 text-[9px] ${tone}`}
                            style={style}
                            title={`${slot.kind}: ${slot.label ?? ""}`}
                          >
                            <span className="whitespace-nowrap">
                              {slot.kind === "TIMETABLE"
                                ? "TKB"
                                : slot.kind === "CONFIRMED_BOOKING"
                                  ? "Booking"
                                  : "Bảo trì"}
                            </span>
                          </div>
                        );
                      })}
                      {holds.map((hold) => {
                        const style = position(minutes(hold.startAt), minutes(hold.endAt));
                        return (
                          <div
                            key={hold.requestId}
                            className="absolute bottom-0 h-2 rounded-full border border-dashed border-amber-500 bg-amber-100"
                            style={style}
                            title="Soft hold 24h — không phải booking"
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Badge tone="neutral">TKB = hard</Badge>
            <Badge tone="success">Booking xác nhận = hard</Badge>
            <Badge tone="danger">Bảo trì = hard</Badge>
            <Badge tone="warning">Soft hold = risk only</Badge>
          </div>
        </div>
      )}
    </div>
  );
}
