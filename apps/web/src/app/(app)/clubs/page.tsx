import Link from "next/link";
import { can } from "@ed4u/domain";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { ClubProposalDecision, ProposeClubForm } from "@/features/clubs/ClubControls";

export default async function ClubsPage() {
  const actor = await requireActor();
  const clubs = await db.club.findMany({
    where: { tenantId: actor.tenantId },
    include: {
      members: { where: { status: "ACTIVE" } },
      finance: true,
      advisors: true,
      events: true,
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  const canPropose =
    can(actor, "club.propose") &&
    actor.memberType === "STUDENT" &&
    actor.membershipStatus === "ACTIVE";
  const canManage = can(actor, "club.manage");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Câu lạc bộ"
        description="Đề xuất → School Admin phê duyệt → vận hành thành viên, advisor, tài liệu, sự kiện và sổ thu/chi. Tài chính chỉ là bookkeeping, không giữ tiền."
      />

      {canPropose ? <ProposeClubForm /> : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-[var(--ink)]">Không gian CLB</h2>
          <p className="text-xs text-[var(--muted)]">
            Vai trò CLB là vai trò miền riêng, không thay đổi system role của tài khoản.
          </p>
        </div>
        {clubs.length === 0 ? (
          <EmptyState
            title="Chưa có câu lạc bộ"
            description="Học sinh đang theo học có thể gửi đề xuất CLB đầu tiên."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {clubs.map((club) => {
              const approved = club.finance.filter((entry) => entry.status === "APPROVED");
              const balance = approved.reduce(
                (sum, entry) => sum + (entry.kind === "INCOME" ? entry.amount : -entry.amount),
                0,
              );
              return (
                <Card key={club.id} className="flex h-full flex-col p-5" data-testid="club-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/clubs/${club.id}`}
                        className="text-base font-bold text-[var(--ink)] hover:underline"
                      >
                        {club.name}
                      </Link>
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">
                        {club.description ?? "Chưa có mô tả."}
                      </p>
                    </div>
                    <StatusBadge status={club.status} />
                  </div>
                  <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-[var(--surface-soft)] p-2">
                      <dt className="text-[10px] text-[var(--muted)]">Thành viên</dt>
                      <dd className="mt-1 text-sm font-bold text-[var(--ink)]">
                        {club.members.length}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-[var(--surface-soft)] p-2">
                      <dt className="text-[10px] text-[var(--muted)]">Advisor</dt>
                      <dd className="mt-1 text-sm font-bold text-[var(--ink)]">
                        {club.advisors.length}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-[var(--surface-soft)] p-2">
                      <dt className="text-[10px] text-[var(--muted)]">Sự kiện</dt>
                      <dd className="mt-1 text-sm font-bold text-[var(--ink)]">
                        {club.events.length}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-4 text-xs text-[var(--muted)]">
                    Số dư sổ đã duyệt:{" "}
                    <span className="font-semibold text-[var(--ink)]">
                      {balance.toLocaleString("vi-VN")} đ
                    </span>
                  </p>
                  <Link
                    href={`/clubs/${club.id}`}
                    className="mt-4 text-xs font-semibold text-[var(--ink)] underline underline-offset-4"
                  >
                    Mở không gian CLB →
                  </Link>
                  {club.status === "PROPOSED" && canManage ? (
                    <ClubProposalDecision clubId={club.id} />
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
