import Link from "next/link";
import {
  can,
  canApproveFinance,
  canApproveMembership,
  canCreateFinanceEntry,
  canProposeEvent,
  canViewDocument,
  isCorePlus,
  type ClubRole,
  type DocVisibility,
} from "@ed4u/domain";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Alert, EmptyState } from "@/components/ui/Feedback";
import {
  AdvisorAdd,
  ClubDocumentCreate,
  ClubDocumentVersionAdd,
  ClubEventCreate,
  ClubEventDecision,
  FinanceCreate,
  FinanceDecision,
  JoinClubButton,
  MembershipDecision,
  PresidencyTransfer,
} from "@/features/clubs/ClubControls";

function money(value: number) {
  return `${value.toLocaleString("vi-VN")} đ`;
}

function localDate(date: Date, timeZone: string) {
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

export default async function ClubDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const [tenant, club] = await Promise.all([
    db.tenant.findUniqueOrThrow({ where: { id: actor.tenantId }, select: { timezone: true } }),
    db.club.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: {
        members: { orderBy: [{ status: "asc" }, { role: "asc" }] },
        advisors: true,
        documents: {
          include: { versions: { orderBy: { version: "desc" } } },
          orderBy: { title: "asc" },
        },
        finance: { orderBy: { createdAt: "desc" } },
        events: {
          include: { roomRequest: { include: { booking: true, room: true } } },
          orderBy: { startAt: "asc" },
        },
      },
    }),
  ]);
  if (!club)
    return (
      <EmptyState
        title="Không tìm thấy CLB"
        description="CLB không tồn tại hoặc không thuộc trường hiện tại."
      />
    );

  const ids = [
    ...new Set([
      ...club.members.map((member) => member.userId),
      ...club.advisors.map((advisor) => advisor.teacherId),
      ...(club.proposedBy ? [club.proposedBy] : []),
    ]),
  ];
  const [users, teacherProfiles] = await Promise.all([
    db.user.findMany({
      where: { tenantId: actor.tenantId, id: { in: ids } },
      select: { id: true, fullName: true },
    }),
    db.teacherProfile.findMany({
      where: {
        tenantId: actor.tenantId,
        user: {
          roles: { some: { role: "TEACHER" } },
          memberships: {
            some: { tenantId: actor.tenantId, memberType: "TEACHER", membershipStatus: "ACTIVE" },
          },
        },
      },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { user: { fullName: "asc" } },
    }),
  ]);
  const userName = new Map(users.map((user) => [user.id, user.fullName]));
  const myMembership = club.members.find(
    (member) => member.userId === actor.userId && member.status === "ACTIVE",
  );
  const myRole = myMembership?.role as ClubRole | undefined;
  const isAdmin = actor.roles.includes("SCHOOL_ADMIN") && can(actor, "club.manage");
  const isAdvisor = club.advisors.some((advisor) => advisor.teacherId === actor.userId);
  const canJoin =
    actor.memberType === "STUDENT" &&
    actor.membershipStatus === "ACTIVE" &&
    club.status === "ACTIVE" &&
    !club.members.some(
      (member) => member.userId === actor.userId && ["ACTIVE", "PENDING"].includes(member.status),
    );
  const canManageMembers = isAdmin || (!!myRole && canApproveMembership(myRole, false));
  const canCreateFinance = isAdmin || (!!myRole && canCreateFinanceEntry(myRole, false));
  const canApproveFinanceEntry = isAdmin || (!!myRole && canApproveFinance(myRole, false));
  const canCreateEvent = isAdmin || (!!myRole && canProposeEvent(myRole, false));
  const canCreateDocs = isAdmin || (!!myRole && isCorePlus(myRole));
  const canAddAdvisor = isAdmin || isAdvisor;
  const canTransferPresident = isAdmin || myRole === "PRESIDENT";

  const approvedFinance = club.finance.filter((entry) => entry.status === "APPROVED");
  const balance = approvedFinance.reduce(
    (sum, entry) => sum + (entry.kind === "INCOME" ? entry.amount : -entry.amount),
    0,
  );
  const visibleDocuments = club.documents.filter((document) => {
    if (isAdmin) return true;
    if (!myRole) return false;
    return canViewDocument(myRole, document.visibility as DocVisibility, false);
  });
  const activeMembers = club.members.filter((member) => member.status === "ACTIVE");
  const pendingMembers = club.members.filter((member) => member.status === "PENDING");

  return (
    <div className="space-y-8">
      <PageHeader
        title={club.name}
        description={club.description ?? "Không gian vận hành câu lạc bộ ED4U."}
        breadcrumbs={[{ label: "Câu lạc bộ", href: "/clubs" }, { label: club.name }]}
        badge={<StatusBadge status={club.status} />}
        actions={canJoin ? <JoinClubButton clubId={club.id} /> : undefined}
      />

      {club.decisionReason ? (
        <Alert tone={club.status === "REJECTED" ? "danger" : "info"} title="Phản hồi từ nhà trường">
          {club.decisionReason}
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-[10px] uppercase text-[var(--muted)]">Thành viên hoạt động</p>
          <p className="mt-2 text-2xl font-bold text-[var(--ink)]">{activeMembers.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase text-[var(--muted)]">Advisor</p>
          <p className="mt-2 text-2xl font-bold text-[var(--ink)]">{club.advisors.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase text-[var(--muted)]">Số dư sổ đã duyệt</p>
          <p className="mt-2 text-2xl font-bold text-[var(--ink)]">{money(balance)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase text-[var(--muted)]">Sự kiện đã duyệt</p>
          <p className="mt-2 text-2xl font-bold text-[var(--ink)]">
            {club.events.filter((event) => event.status === "APPROVED").length}
          </p>
        </Card>
      </div>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-[var(--ink)]">Thành viên & Advisor</h2>
            <p className="text-xs text-[var(--muted)]">
              Hierarchy: President → Vice President → Core → Member.
            </p>
          </div>
          {canTransferPresident ? (
            <PresidencyTransfer
              clubId={club.id}
              members={activeMembers
                .filter((member) => member.role !== "PRESIDENT")
                .map((member) => ({
                  id: member.id,
                  label: `${userName.get(member.userId) ?? member.userId} · ${member.role}`,
                }))}
            />
          ) : null}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-[var(--ink)]">Danh sách thành viên</h3>
            <div className="mt-3 divide-y divide-[var(--hairline-soft)]">
              {activeMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between py-2 text-xs">
                  <span>{userName.get(member.userId) ?? member.userId}</span>
                  <Badge tone={member.role === "PRESIDENT" ? "brand" : "neutral"}>
                    {member.role}
                  </Badge>
                </div>
              ))}
            </div>
            {canManageMembers && pendingMembers.length ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold">Chờ duyệt</p>
                {pendingMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-soft)] p-2 text-xs"
                  >
                    <span>{userName.get(member.userId) ?? member.userId}</span>
                    <MembershipDecision membershipId={member.id} />
                  </div>
                ))}
              </div>
            ) : null}
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-[var(--ink)]">Teacher Advisor</h3>
            <div className="mt-3 space-y-2">
              {club.advisors.length ? (
                club.advisors.map((advisor) => (
                  <div
                    key={advisor.id}
                    className="flex items-center justify-between rounded-lg bg-[var(--surface-soft)] p-3 text-xs"
                  >
                    <span>{userName.get(advisor.teacherId) ?? advisor.teacherId}</span>
                    {advisor.isPrimary ? (
                      <Badge tone="brand">Primary</Badge>
                    ) : (
                      <Badge tone="neutral">Advisor</Badge>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-xs text-[var(--muted)]">Chưa có advisor.</p>
              )}
            </div>
            {canAddAdvisor ? (
              <div className="mt-4">
                <AdvisorAdd
                  clubId={club.id}
                  teachers={teacherProfiles
                    .filter(
                      (teacher) =>
                        !club.advisors.some((advisor) => advisor.teacherId === teacher.userId),
                    )
                    .map((teacher) => ({ id: teacher.userId, name: teacher.user.fullName }))}
                />
              </div>
            ) : null}
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-[var(--ink)]">Sổ thu / chi</h2>
          <p className="text-xs text-[var(--muted)]">
            Bookkeeping only — ED4U không giữ tiền. Bút toán APPROVED bất biến; sửa sai bằng VOID có
            lý do rồi tạo bút toán mới.
          </p>
        </div>
        {canCreateFinance ? <FinanceCreate clubId={club.id} /> : null}
        <div className="space-y-2">
          {club.finance.map((entry) => (
            <Card key={entry.id} className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-bold ${entry.kind === "INCOME" ? "text-emerald-700" : "text-[var(--ink)]"}`}
                    >
                      {entry.kind === "INCOME" ? "+" : "−"}
                      {money(entry.amount)}
                    </span>
                    <StatusBadge status={entry.status} />
                  </div>
                  <p className="mt-1 text-xs text-[var(--body)]">
                    {entry.category} · {entry.description}
                  </p>
                  {entry.voidReason ? (
                    <p className="mt-1 text-[11px] text-[var(--danger)]">
                      VOID: {entry.voidReason}
                    </p>
                  ) : null}
                </div>
                <FinanceDecision
                  entryId={entry.id}
                  status={entry.status}
                  canApprove={canApproveFinanceEntry}
                  canVoid={isAdmin || myRole === "PRESIDENT"}
                />
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-[var(--ink)]">Tài liệu CLB</h2>
          <p className="text-xs text-[var(--muted)]">
            PDF riêng tư, có visibility theo vai trò và versioning không ghi đè.
          </p>
        </div>
        {canCreateDocs ? <ClubDocumentCreate clubId={club.id} /> : null}
        <div className="grid gap-3 md:grid-cols-2">
          {visibleDocuments.map((document) => (
            <Card key={document.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--ink)]">{document.title}</h3>
                  <p className="text-[11px] text-[var(--muted)]">
                    {document.visibility} · {document.versions.length} phiên bản
                  </p>
                </div>
                {document.versions[0] ? (
                  <a
                    href={`/files/${document.versions[0].fileId}`}
                    className="text-xs font-semibold underline"
                  >
                    Tải v{document.versions[0].version}
                  </a>
                ) : null}
              </div>
              {canCreateDocs ? (
                <div className="mt-3">
                  <ClubDocumentVersionAdd documentId={document.id} />
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-[var(--ink)]">Sự kiện CLB</h2>
          <p className="text-xs text-[var(--muted)]">
            Sự kiện cần phòng phải giải quyết RoomRequest trước khi School Admin có thể duyệt thành
            sự kiện hiển thị trên Calendar.
          </p>
        </div>
        {canCreateEvent ? <ClubEventCreate clubId={club.id} /> : null}
        <div className="space-y-3">
          {club.events.length ? (
            club.events.map((event) => (
              <Card key={event.id} className="p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-[var(--ink)]">{event.title}</h3>
                      <StatusBadge status={event.status} />
                      {event.roomRequired ? (
                        <Badge tone={event.roomResolved ? "success" : "warning"}>
                          {event.roomResolved ? "Đã có phòng" : "Cần phòng"}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      {localDate(event.startAt, tenant.timezone)} →{" "}
                      {localDate(event.endAt, tenant.timezone)}
                    </p>
                    {event.roomRequest?.room ? (
                      <p className="mt-1 text-xs text-[var(--body)]">
                        Phòng: {event.roomRequest.room.code} ·{" "}
                        {event.roomRequest.booking && !event.roomRequest.booking.cancelledAt
                          ? "booking confirmed"
                          : event.roomRequest.status}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {event.roomRequired && !event.roomResolved && canCreateEvent ? (
                      <Link
                        href={`/rooms?clubEvent=${event.id}&prompt=${encodeURIComponent(`Tìm phòng cho sự kiện ${event.title}, ${Math.max(1, activeMembers.length)} người`)}`}
                        className="rounded-md border border-[var(--hairline)] px-3 py-2 text-xs font-semibold hover:bg-[var(--surface-soft)]"
                      >
                        Tìm phòng bằng Facility Engine
                      </Link>
                    ) : null}
                    {isAdmin && ["PENDING", "NEEDS_RESOURCE"].includes(event.status) ? (
                      <ClubEventDecision eventId={event.id} />
                    ) : null}
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <EmptyState
              title="Chưa có sự kiện"
              description="Core+ có thể tạo đề xuất sự kiện ở phía trên."
            />
          )}
        </div>
      </section>
    </div>
  );
}
