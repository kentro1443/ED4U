import { can } from "@ed4u/domain";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { PageHeader } from "@/components/ui/PageHeader";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { FacilityPlanner } from "@/features/facility/FacilityPlanner";
import { RoomRequestActions } from "@/features/facility/RoomRequestActions";

function formatSchoolTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string; clubEvent?: string }>;
}) {
  const actor = await requireActor();
  const params = await searchParams;
  const [tenant, roomTypes, features, recentRequests] = await Promise.all([
    db.tenant.findUniqueOrThrow({ where: { id: actor.tenantId }, select: { timezone: true } }),
    db.roomType.findMany({
      where: { tenantId: actor.tenantId },
      select: { code: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.roomFeatureDefinition.findMany({
      where: { tenantId: actor.tenantId },
      select: { code: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.roomRequest.findMany({
      where: can(actor, "room.request")
        ? { tenantId: actor.tenantId, requestedBy: actor.userId }
        : { tenantId: actor.tenantId },
      include: { room: true, booking: true },
      orderBy: { holdCreatedAt: "desc" },
      take: 8,
    }),
  ]);

  const canRequest =
    can(actor, "room.request") &&
    actor.memberType === "STUDENT" &&
    actor.membershipStatus === "ACTIVE";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Phòng & Cơ sở vật chất"
        description="Tìm phương án trên trạng thái phòng trực tiếp. Đề xuất không giữ chỗ; chỉ School Admin có thể xác nhận booking sau khi tái kiểm tra ràng buộc cứng."
        actions={
          <LinkButton href="/rooms/schedule" variant="secondary">
            Xem lịch phòng
          </LinkButton>
        }
      />

      <FacilityPlanner
        roomTypes={roomTypes}
        features={features}
        canRequest={canRequest}
        initialPrompt={params.prompt ?? ""}
        clubEventId={params.clubEvent ?? null}
      />

      <section className="space-y-3 border-t border-[var(--hairline)] pt-6">
        <div>
          <h2 className="text-base font-bold text-[var(--ink)]">
            {canRequest ? "Yêu cầu phòng gần đây của bạn" : "Yêu cầu phòng gần đây"}
          </h2>
          <p className="text-xs text-[var(--muted)]">
            Soft hold tồn tại tối đa 24 giờ khi yêu cầu đang chờ duyệt; chỉ booking đã duyệt mới là
            khóa cứng.
          </p>
        </div>
        {recentRequests.length === 0 ? (
          <EmptyState
            title="Chưa có yêu cầu phòng"
            description="Dùng bộ lập kế hoạch phía trên để tìm phương án khả thi."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {recentRequests.map((request) => (
              <Card key={request.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--ink)]">
                      {request.room.code} · {request.room.name}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {formatSchoolTime(request.eventStart, tenant.timezone)} →{" "}
                      {formatSchoolTime(request.eventEnd, tenant.timezone)}
                    </p>
                  </div>
                  <StatusBadge status={request.status} />
                </div>
                {request.purpose ? (
                  <p className="mt-3 line-clamp-2 text-xs text-[var(--body)]">{request.purpose}</p>
                ) : null}
                {request.decisionReason ? (
                  <p className="mt-2 text-xs text-[var(--danger)]">
                    Lý do: {request.decisionReason}
                  </p>
                ) : null}
                <p className="mt-3 text-[11px] text-[var(--muted)]">
                  {request.booking && !request.booking.cancelledAt
                    ? "Đã có booking được xác nhận."
                    : request.status === "PENDING_APPROVAL"
                      ? "Đang chờ School Admin; chưa phải booking được xác nhận."
                      : "Chưa có booking đang hoạt động."}
                </p>
                {canRequest ? (
                  <RoomRequestActions requestId={request.id} status={request.status} />
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
