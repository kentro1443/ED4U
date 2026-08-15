import { can, type Actor } from "@ed4u/domain";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { ApplicationSubmissionPanel } from "@/features/applications/ApplicationSubmissionPanel";
import {
  ApplicationReviewActions,
  ApplicationTransferResponse,
  ApplicationVersionUpload,
} from "@/features/applications/ApplicationWorkflowActions";
import { TEACHER_RESPONSIBILITY_LABELS } from "@/lib/teacher/routing";

export function applicationScope(actor: Actor): Prisma.ApplicationWhereInput {
  const base = { tenantId: actor.tenantId };
  if (actor.roles.includes("SCHOOL_ADMIN") && can(actor, "application.review")) return base;
  return {
    ...base,
    OR: [
      { studentId: actor.userId },
      { currentTeacherId: actor.userId },
      { pendingTransferTo: actor.userId },
    ],
  };
}

export default async function ApplicationsPage() {
  const actor = await requireActor();
  const apps = await db.application.findMany({
    where: applicationScope(actor),
    include: { versions: { orderBy: { versionNumber: "desc" } } },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
  const userIds = new Set<string>();
  for (const app of apps) {
    userIds.add(app.studentId);
    userIds.add(app.currentTeacherId);
    if (app.pendingTransferTo) userIds.add(app.pendingTransferTo);
  }
  const [users, storedFiles, teachers] = await Promise.all([
    db.user.findMany({
      where: { tenantId: actor.tenantId, id: { in: [...userIds] } },
      select: { id: true, fullName: true },
    }),
    db.storedFile.findMany({
      where: {
        tenantId: actor.tenantId,
        id: { in: apps.flatMap((app) => app.versions.map((version) => version.fileId)) },
      },
      select: { id: true, filename: true, size: true },
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
  const fileById = new Map(storedFiles.map((file) => [file.id, file]));
  const teacherOptions = teachers.map((teacher) => ({
    id: teacher.userId,
    name: teacher.user.fullName,
  }));
  const canCreate =
    can(actor, "application.create") &&
    actor.memberType === "STUDENT" &&
    actor.membershipStatus === "ACTIVE";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Đơn & yêu cầu hỗ trợ"
        description="Mẫu PDF có sẵn → học sinh điền và nộp → giáo viên phụ trách review. Mỗi lần nộp tạo phiên bản mới; tệp cũ không bị ghi đè."
      />

      {canCreate ? <ApplicationSubmissionPanel /> : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-[var(--ink)]">
            {actor.memberType === "STUDENT" ? "Đơn của bạn" : "Hàng chờ xử lý"}
          </h2>
          <p className="text-xs text-[var(--muted)]">
            Teacher routing chỉ là phân loại trách nhiệm + eligibility + tải công việc; học sinh vẫn
            xác nhận người nhận cuối cùng.
          </p>
        </div>

        {apps.length === 0 ? (
          <EmptyState
            title="Chưa có đơn"
            description={
              canCreate
                ? "Tải mẫu PDF, điền và nộp đơn đầu tiên ở phía trên."
                : "Không có đơn nào đang thuộc phạm vi xử lý của bạn."
            }
          />
        ) : (
          <div className="space-y-4">
            {apps.map((application) => {
              const isStudentOwner = application.studentId === actor.userId;
              const isAssignee = application.currentTeacherId === actor.userId;
              const canReview =
                can(actor, "application.review") &&
                (isAssignee || actor.roles.includes("SCHOOL_ADMIN"));
              const pendingForActor = application.pendingTransferTo === actor.userId;
              return (
                <Card key={application.id} className="p-5" data-testid="application-card">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={application.status} />
                        {application.classifiedCategory ? (
                          <Badge tone="neutral">
                            {TEACHER_RESPONSIBILITY_LABELS[application.classifiedCategory] ??
                              application.classifiedCategory}
                          </Badge>
                        ) : null}
                        <span className="text-[11px] text-[var(--muted)]">
                          {application.latestSubmissionVersion ?? 0} phiên bản
                        </span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-[var(--ink)]">
                          {application.rawRequestText}
                        </h3>
                        {application.description ? (
                          <p className="mt-1 text-xs text-[var(--body)]">
                            {application.description}
                          </p>
                        ) : null}
                      </div>
                      <div className="grid gap-2 text-xs text-[var(--muted)] sm:grid-cols-2">
                        <p>
                          Học sinh:{" "}
                          <span className="font-medium text-[var(--ink)]">
                            {userName.get(application.studentId) ?? application.studentId}
                          </span>
                        </p>
                        <p>
                          Giáo viên phụ trách:{" "}
                          <span className="font-medium text-[var(--ink)]">
                            {userName.get(application.currentTeacherId) ??
                              application.currentTeacherId}
                          </span>
                        </p>
                      </div>
                      {application.reviewNote ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                          <span className="font-semibold">Phản hồi gần nhất:</span>{" "}
                          {application.reviewNote}
                        </div>
                      ) : null}

                      {application.versions.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                            Tệp đã nộp
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {application.versions.map((version) => {
                              const file = fileById.get(version.fileId);
                              return (
                                <a
                                  key={version.id}
                                  href={`/files/${version.fileId}`}
                                  className="rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-2 text-xs text-[var(--body)] hover:border-[var(--muted)]"
                                >
                                  v{version.versionNumber} · {file?.filename ?? "PDF"}
                                  {file ? ` · ${(file.size / 1024).toFixed(0)} KB` : ""}
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      {isStudentOwner && application.status === "NEEDS_MORE_INFO" ? (
                        <ApplicationVersionUpload applicationId={application.id} />
                      ) : null}
                      {pendingForActor ? (
                        <ApplicationTransferResponse
                          applicationId={application.id}
                          reason={application.transferReason}
                        />
                      ) : null}
                    </div>

                    <div className="text-right text-[11px] text-[var(--muted)]">
                      <p>Cập nhật</p>
                      <p className="mt-1 font-medium text-[var(--ink)]">
                        {application.updatedAt.toLocaleString("vi-VN", {
                          timeZone: "Asia/Ho_Chi_Minh",
                        })}
                      </p>
                    </div>
                  </div>

                  {canReview ? (
                    <ApplicationReviewActions
                      applicationId={application.id}
                      status={application.status}
                      teachers={teacherOptions.filter(
                        (teacher) => teacher.id !== application.currentTeacherId,
                      )}
                    />
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
