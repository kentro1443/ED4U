import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireRoute } from "@/lib/authz";
import { isSoftHoldActive } from "@ed4u/domain";
import { displayUser, loadUserDirectory } from "@/lib/userDirectory";
import { ageTone, formatAge, formatSlot } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { Icons } from "@/components/ui/icons";
import { RoomApprovalActions } from "./RoomApprovalActions";

export const metadata: Metadata = { title: "Trung tâm phê duyệt" };

/** Resolved history is context, not work: bounded so the queue stays a queue. */
const RESOLVED_LIMIT = 10;

export default async function ApprovalsPage() {
  const actor = await requireRoute("/admin/approvals");
  const now = new Date();

  const [tenant, pendingApprovals, resolvedApprovals, rooms] = await Promise.all([
    db.tenant.findUniqueOrThrow({ where: { id: actor.tenantId }, select: { timezone: true } }),
    db.approval.findMany({
      where: { tenantId: actor.tenantId, status: "PENDING" },
      orderBy: { requestedAt: "asc" },
    }),
    db.approval.findMany({
      where: { tenantId: actor.tenantId, status: { not: "PENDING" } },
      orderBy: { resolvedAt: "desc" },
      take: RESOLVED_LIMIT,
    }),
    db.roomRequest.findMany({
      where: { tenantId: actor.tenantId, status: "PENDING_APPROVAL" },
      include: { room: true },
      // Oldest first: a queue is worked from the front, and the request that has
      // waited longest is the one at risk of missing its own event.
      orderBy: { holdCreatedAt: "asc" },
    }),
  ]);

  const directory = await loadUserDirectory(actor.tenantId, [
    ...rooms.map((request) => request.requestedBy),
    ...pendingApprovals.map((approval) => approval.requestedBy),
    ...resolvedApprovals.map((approval) => approval.requestedBy),
    ...resolvedApprovals.map((approval) => approval.resolvedBy),
  ]);

  const pendingTotal = rooms.length + pendingApprovals.length;
  const overdue = rooms.filter(
    (request) => now.getTime() - request.holdCreatedAt.getTime() >= 24 * 3_600_000,
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trung tâm phê duyệt"
        description="AI đề xuất → phần mềm tái kiểm tra trạng thái trực tiếp → người có thẩm quyền quyết định → giao dịch khóa tài nguyên."
        badge={<Badge tone="brand">approvals.resolve</Badge>}
        actions={
          <Link
            href="/rooms/schedule"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--hairline)] px-4 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            <Icons.calendar className="h-4 w-4" aria-hidden="true" />
            Đối chiếu lịch phòng
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <QueueStat label="Đang chờ xử lý" value={pendingTotal} />
        <QueueStat
          label="Quá 24 giờ"
          value={overdue}
          tone={overdue > 0 ? "warning" : "neutral"}
          hint={overdue > 0 ? "Cần ưu tiên xử lý" : "Không có phiếu tồn đọng"}
        />
        <QueueStat
          label="Đã xử lý gần đây"
          value={resolvedApprovals.length}
          hint={`Hiển thị tối đa ${RESOLVED_LIMIT} phiếu`}
        />
      </div>

      {pendingTotal === 0 ? (
        <EmptyState
          title="Hàng đợi trống"
          description="Các yêu cầu đặt phòng, duyệt sự kiện và đề xuất thành lập CLB sẽ xuất hiện tại đây khi người dùng gửi yêu cầu."
        />
      ) : (
        <div className="space-y-4">
          {rooms.map((request) => {
            const holdActive = isSoftHoldActive(
              {
                requestId: request.id,
                roomId: request.roomId,
                startAt: request.eventStart,
                endAt: request.eventEnd,
                createdAt: request.holdCreatedAt,
              },
              now,
            );
            const recommendation = request.recommendation as {
              selectedPlan?: { score?: number; pendingConflictRisk?: number };
              engineVersion?: string;
            } | null;
            const requester = displayUser(directory, request.requestedBy);
            const slot = formatSlot(request.eventStart, request.eventEnd, tenant.timezone);
            const waited = formatAge(request.holdCreatedAt, now);
            const waitTone = ageTone(request.holdCreatedAt, now);

            return (
              <Card key={request.id} className="p-5" data-testid="room-approval-card">
                <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-[var(--ink)]">
                        {request.room.code} · {request.room.name}
                      </h2>
                      <StatusBadge status={request.status} />
                      <Badge tone={holdActive ? "warning" : "neutral"} size="sm">
                        {holdActive ? "Soft hold đang hoạt động" : "Soft hold đã hết hạn"}
                      </Badge>
                      <Badge
                        tone={
                          waitTone === "danger"
                            ? "danger"
                            : waitTone === "warning"
                              ? "warning"
                              : "outline"
                        }
                        size="sm"
                      >
                        Chờ {waited}
                      </Badge>
                    </div>

                    <dl className="grid gap-x-6 gap-y-2 text-xs text-[var(--body)] sm:grid-cols-2">
                      <Detail label="Thời gian" value={slot} />
                      <Detail
                        label="Setup / cleanup"
                        value={`${request.setupMinutes} / ${request.cleanupMinutes} phút`}
                      />
                      <Detail label="Người gửi" value={requester} />
                      <Detail
                        label="Sức chứa phòng"
                        value={`${request.room.capacity} chỗ · ${request.room.building}, tầng ${request.room.floor}`}
                      />
                    </dl>

                    {/* Rendered unconditionally: sibling cards that omit sections
                        shift their own action buttons, which is how an approver
                        misclicks a queue. */}
                    <p className="rounded-md bg-[var(--surface-soft)] p-3 text-xs leading-relaxed text-[var(--body)]">
                      {request.purpose ? (
                        `“${request.purpose}”`
                      ) : (
                        <span className="text-[var(--muted)]">
                          Người gửi không ghi mục đích sử dụng.
                        </span>
                      )}
                    </p>

                    <p className="text-[11px] text-[var(--muted)]">
                      {recommendation?.selectedPlan ? (
                        <>
                          Facility Engine {recommendation.engineVersion ?? ""} · điểm đề xuất{" "}
                          {recommendation.selectedPlan.score?.toFixed?.(1) ?? "—"} · rủi ro soft
                          hold{" "}
                          {Math.round((recommendation.selectedPlan.pendingConflictRisk ?? 0) * 100)}
                          %
                        </>
                      ) : (
                        "Yêu cầu thủ công — không có đề xuất từ Facility Engine."
                      )}
                    </p>
                  </div>

                  <RoomApprovalActions
                    requestId={request.id}
                    summary={{
                      room: `${request.room.code} · ${request.room.name}`,
                      slot,
                      requester,
                      purpose: request.purpose ?? "Không ghi mục đích",
                    }}
                  />
                </div>
              </Card>
            );
          })}

          {pendingApprovals.map((item) => (
            <Card key={item.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[var(--ink)]">
                  Phiếu duyệt · {item.subjectType}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {displayUser(directory, item.requestedBy)} · gửi{" "}
                  {formatAge(item.requestedAt, now)}
                </p>
              </div>
              <StatusBadge status={item.status} />
            </Card>
          ))}
        </div>
      )}

      {resolvedApprovals.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
            Đã xử lý gần đây
          </h2>
          <div className="overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--canvas)]">
            <ul className="divide-y divide-[var(--hairline-soft)]">
              {resolvedApprovals.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--ink)]">{item.subjectType}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {displayUser(directory, item.requestedBy)} → xử lý bởi{" "}
                      {displayUser(directory, item.resolvedBy)}
                      {item.resolvedAt ? ` · ${formatAge(item.resolvedAt, now)}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="truncate text-[var(--body)]">{value}</dd>
    </div>
  );
}

function QueueStat({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warning";
  hint?: string;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        tone === "warning"
          ? "border-amber-200 bg-amber-50/60"
          : "border-[var(--hairline)] bg-[var(--canvas)]"
      }`}
    >
      <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          tone === "warning" ? "text-amber-800" : "text-[var(--ink)]"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-[var(--muted)]">{hint}</p>}
    </div>
  );
}
