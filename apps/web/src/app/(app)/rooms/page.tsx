import { planRooms, parseFacilityRequest } from "@ed4u/facility-engine";
import { db } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { requireActor } from "@/lib/authz";

export default async function RoomsPage() {
  const actor = await requireActor();
  const rooms = await db.room.findMany({
    where: { tenantId: actor.tenantId },
    include: { roomType: true, features: { include: { feature: true } } },
  });
  const parsed = parseFacilityRequest(
    "Tìm phòng cho CLB Robotics, 80 người, chiều thứ Sáu, cần máy chiếu, ưu tiên phòng máy.",
  );
  const result = planRooms(
    {
      dateForDay: "2026-08-21",
      hours: { startMinutes: 420, endMinutes: 1200, weekdaysOnly: true },
      rooms: rooms.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        roomType: r.roomType.code,
        building: r.building,
        floor: r.floor,
        capacity: r.capacity,
        status: r.status,
        features: Object.fromEntries(r.features.map((f) => [f.feature.code, f.value === "true"])),
      })),
      occupancy: [],
      pendingHolds: [],
    },
    parsed,
  );

  return (
    <div>
      <PageHeader
        title="Phòng"
        description="Đặt thủ công luôn hoạt động. Engine chỉ đề xuất — người duyệt mới khóa phòng."
      />
      {result.kind === "PLANS" ? (
        <ol className="space-y-3">
          {result.plans.map((p) => (
            <li
              key={p.roomId}
              className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4"
            >
              <p className="font-medium">
                {p.roomCode} · {p.score}
              </p>
              <p className="text-sm text-[var(--muted)]">{p.reasons.join(" ")}</p>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          title="Không có phương án khả thi"
          action={result.alternatives[0]?.description ?? "Chọn phòng thủ công."}
        />
      )}
      <form className="mt-8 grid max-w-md gap-3">
        <h2 className="font-medium">Đặt thủ công</h2>
        <label className="text-sm">
          Phòng
          <select name="room" className="mt-1 w-full rounded border border-[var(--line)] px-2 py-2">
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} · {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Ngày
          <input
            type="date"
            name="date"
            className="mt-1 w-full rounded border border-[var(--line)] px-2 py-2"
          />
        </label>
        <label className="text-sm">
          Giờ
          <input
            type="time"
            name="time"
            className="mt-1 w-full rounded border border-[var(--line)] px-2 py-2"
          />
        </label>
        <button type="submit" className="rounded-full bg-[var(--pine)] px-4 py-2 text-white">
          Gửi yêu cầu
        </button>
      </form>
    </div>
  );
}
