import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { currentSessionId } from "@/lib/auth";
import { formatAge, formatDateTime } from "@/lib/format";
import { PageHeader, SectionHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Alert, EmptyState } from "@/components/ui/Feedback";
import { Icons } from "@/components/ui/icons";
import { RevokeAllButton, RevokeSessionButton } from "./SessionControls";

export const metadata: Metadata = { title: "Bảo mật" };

/** Security-relevant actions a user can see about their own account. */
const SELF_AUDIT_ACTIONS = [
  "SESSION_REVOKE",
  "MEMBER_PASSWORD_RESET",
  "PASSWORD_CHANGE",
  "MEMBER_STATUS_CHANGE",
];

export default async function SecurityPage() {
  const actor = await requireActor();
  const now = new Date();

  const [tenant, user, sessions, activeSessionId, recentEvents] = await Promise.all([
    db.tenant.findUniqueOrThrow({
      where: { id: actor.tenantId },
      select: { timezone: true },
    }),
    db.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { mustChangePassword: true, createdAt: true },
    }),
    db.session.findMany({
      where: { userId: actor.userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    }),
    currentSessionId(),
    db.auditEvent.findMany({
      where: {
        tenantId: actor.tenantId,
        entityId: actor.userId,
        action: { in: SELF_AUDIT_ACTIONS },
      },
      orderBy: { timestamp: "desc" },
      take: 10,
    }),
  ]);

  const otherCount = sessions.filter((session) => session.id !== activeSessionId).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bảo mật"
        description="Phiên đăng nhập, mật khẩu và các thay đổi bảo mật gần đây của tài khoản bạn."
        badge={<Badge tone="neutral">{actor.schoolMemberCode}</Badge>}
      />

      {user.mustChangePassword && (
        <Alert tone="warning" title="Tài khoản đang dùng mật khẩu tạm thời">
          Hãy đổi sang mật khẩu riêng của bạn. Mật khẩu tạm thời do quản trị viên cấp và có thể đã
          được người khác nhìn thấy trong quá trình bàn giao.
        </Alert>
      )}

      <Card>
        <SectionHeader
          title="Mật khẩu"
          description="ED4U không dùng email ở V1, nên không có luồng khôi phục mật khẩu tự động."
          actions={
            <LinkButton href="/change-password" variant="secondary" size="sm">
              <Icons.key className="h-4 w-4" aria-hidden="true" />
              Đổi mật khẩu
            </LinkButton>
          }
        />
        <dl className="divide-y divide-[var(--hairline-soft)] text-sm">
          <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-[var(--body)]">Trạng thái mật khẩu</dt>
            <dd>
              {user.mustChangePassword ? (
                <Badge tone="warning" size="sm">
                  Cần đổi
                </Badge>
              ) : (
                <Badge tone="success" size="sm">
                  Đã do bạn đặt
                </Badge>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-[var(--body)]">Quên mật khẩu</dt>
            <dd className="text-right text-xs text-[var(--muted)]">
              Liên hệ ADMIN_IT để được cấp lại mật khẩu tạm thời.
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-[var(--body)]">Tài khoản tạo lúc</dt>
            <dd className="text-sm text-[var(--ink)]">
              {formatDateTime(user.createdAt, tenant.timezone)}
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <SectionHeader
          title="Phiên đăng nhập đang hoạt động"
          description="Mỗi lần đăng nhập tạo một phiên riêng. Thu hồi phiên sẽ đăng xuất thiết bị đó ngay lập tức."
          actions={<RevokeAllButton otherCount={otherCount} />}
        />

        {sessions.length === 0 ? (
          <EmptyState
            title="Không có phiên nào đang hoạt động"
            description="Điều này chỉ xảy ra nếu phiên hiện tại vừa bị thu hồi."
          />
        ) : (
          <ul className="divide-y divide-[var(--hairline-soft)]">
            {sessions.map((session) => {
              const isCurrent = session.id === activeSessionId;
              return (
                <li
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-[var(--ink)]">
                      Phiên bắt đầu {formatAge(session.createdAt, now)}
                      {isCurrent && (
                        <Badge tone="success" size="sm">
                          Phiên hiện tại
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {formatDateTime(session.createdAt, tenant.timezone)} · hết hạn{" "}
                      {formatDateTime(session.expiresAt, tenant.timezone)}
                    </p>
                  </div>
                  {isCurrent ? (
                    <span className="text-xs text-[var(--muted)]">
                      Dùng nút Đăng xuất để kết thúc
                    </span>
                  ) : (
                    <RevokeSessionButton
                      sessionId={session.id}
                      startedLabel={formatDateTime(session.createdAt, tenant.timezone)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Stated rather than invented: the session record carries no device or
            network metadata, and showing a plausible-looking "Chrome on macOS"
            would be a fabricated runtime value. */}
        <p className="mt-4 border-t border-[var(--hairline-soft)] pt-3 text-xs leading-relaxed text-[var(--muted)]">
          ED4U chưa ghi lại thiết bị hay địa chỉ IP cho mỗi phiên, nên danh sách này chỉ hiển thị
          thời điểm bắt đầu và hạn dùng. Nếu bạn thấy một phiên không phải của mình, hãy thu hồi nó
          và đổi mật khẩu.
        </p>
      </Card>

      <Card>
        <SectionHeader
          title="Hoạt động bảo mật gần đây"
          description="Trích từ nhật ký hệ thống, giới hạn trong các sự kiện liên quan tới tài khoản của bạn."
        />
        {recentEvents.length === 0 ? (
          <EmptyState
            title="Chưa có sự kiện bảo mật nào"
            description="Thay đổi mật khẩu, thu hồi phiên và thay đổi trạng thái tài khoản sẽ xuất hiện tại đây."
          />
        ) : (
          <ul className="divide-y divide-[var(--hairline-soft)]">
            {recentEvents.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-4 py-2.5">
                <span className="font-mono text-xs text-[var(--ink)]">{event.action}</span>
                <time
                  dateTime={event.timestamp.toISOString()}
                  title={`UTC: ${event.timestamp.toISOString()}`}
                  className="text-xs text-[var(--muted)]"
                >
                  {formatDateTime(event.timestamp, tenant.timezone)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
