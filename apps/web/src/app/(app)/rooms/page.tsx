import { planRooms, parseFacilityRequest } from "@ed4u/facility-engine";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field, Select, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";
import { requireActor } from "@/lib/authz";

export default async function RoomsPage() {
  const actor = await requireActor();
  const rooms = await db.room.findMany({
    where: { tenantId: actor.tenantId },
    include: { roomType: true, features: { include: { feature: true } } },
    orderBy: { code: "asc" },
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
    <div className="space-y-6">
      <PageHeader
        title="Phòng & Cơ sở vật chất"
        description="Đề xuất thông minh từ Facility Intelligence Engine. Quy trình duyệt phòng và khóa chỗ thuộc thẩm quyền School Admin."
      />

      <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] p-3.5 text-xs text-[var(--muted)] leading-relaxed">
        <span className="font-semibold text-[var(--ink)]">Yêu cầu demo mẫu:</span> &ldquo;Tìm phòng
        cho CLB Robotics, 80 người, chiều thứ Sáu, cần máy chiếu, ưu tiên phòng máy.&rdquo; — Luồng
        nhập câu lệnh tự nhiên, kiểm tra xung đột TKB/bảo trì thực tế và quy trình duyệt phòng sẽ
        được hoàn thiện ở phân đoạn Facility E2E.
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Facility Engine Proposals */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
            Đề xuất từ Facility Engine
          </h2>

          {result.kind === "PLANS" ? (
            <div className="space-y-3">
              {result.plans.map((p, idx) => (
                <Card key={p.roomId} className="p-4 flex flex-col justify-between gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-[var(--ink)]">
                      Phương án {idx + 1} · {p.roomCode}
                    </span>
                    <Badge tone="brand" size="sm">
                      Điểm: {p.score}
                    </Badge>
                  </div>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">
                    {p.reasons.join(" ")}
                  </p>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Không có phương án khả thi"
              description={
                result.alternatives[0]?.description ?? "Vui lòng chọn phòng thủ công bên cạnh."
              }
            />
          )}
        </div>

        {/* Manual Request Form Preview */}
        <div>
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle>Đặt phòng thủ công</CardTitle>
              <Badge tone="neutral" size="sm">
                Xem trước (Preview)
              </Badge>
            </CardHeader>
            <CardContent>
              <form className="space-y-4">
                <Field id="room" label="Chọn phòng" description="Phòng cần mượn sử dụng" required>
                  <Select name="room" disabled>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} · {r.name} ({r.roomType.name}, sức chứa {r.capacity})
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field id="date" label="Ngày sử dụng" required>
                  <Input type="date" name="date" disabled defaultValue="2026-08-21" />
                </Field>

                <Field id="time" label="Khung giờ" required>
                  <Input type="time" name="time" disabled defaultValue="14:00" />
                </Field>

                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  disabled
                  className="w-full mt-2 cursor-not-allowed opacity-75"
                >
                  Gửi yêu cầu (Sẽ được bật ở Facility E2E)
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
