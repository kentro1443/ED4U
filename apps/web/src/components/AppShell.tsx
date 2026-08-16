import type { Actor } from "@ed4u/domain";
import { visibleNav } from "@/lib/nav";
import { db } from "@/lib/db";
import { ToastProvider } from "@/components/ui/Toast";
import { NavLinks } from "./navigation/NavLinks";
import { UserProfileCard, type UserSummary } from "./navigation/UserMenu";
import { MobileHeader } from "./navigation/MobileHeader";
import { AppHeader } from "./navigation/AppHeader";
import { BrandLogo } from "./BrandLogo";

export async function AppShell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const [groups, user, tenant, unreadCount] = await Promise.all([
    Promise.resolve(visibleNav(actor)),
    db.user.findUnique({
      where: { id: actor.userId },
      select: { fullName: true },
    }),
    db.tenant.findUnique({
      where: { id: actor.tenantId },
      select: { name: true },
    }),
    db.notification.count({
      where: { userId: actor.userId, tenantId: actor.tenantId, readAt: null },
    }),
  ]);

  const userSummary: UserSummary = {
    schoolMemberCode: actor.schoolMemberCode,
    fullName: user?.fullName,
    roles: actor.roles,
    membershipStatus: actor.membershipStatus,
  };
  const schoolName = tenant?.name ?? "ED4U";

  return (
    <ToastProvider>
      {/* Keyboard users reach content without traversing ~18 navigation links. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-[var(--primary)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--on-primary)] focus:shadow-[var(--shadow-lg)]"
      >
        Bỏ qua điều hướng, tới nội dung chính
      </a>

      <div className="flex min-h-dvh bg-[var(--canvas)] text-[var(--ink)]">
        {/* Desktop sidebar (>= 768px). The nav scrolls inside a flex child with
            `min-h-0` rather than a hand-computed max-height, so admin routes can
            never fall below the fold on a short viewport. */}
        <aside className="sticky top-3 ml-3 hidden h-[calc(100dvh-1.5rem)] w-64 shrink-0 flex-col overflow-hidden rounded-[28px] border border-[var(--hairline)] bg-[var(--surface-card)] shadow-[var(--shadow-md)] md:flex">
          <div className="flex items-center gap-3 px-5 pb-4 pt-5">
            <BrandLogo href="/dashboard" className="w-[6.75rem]" priority />
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                Không gian trường học
              </p>
              <p className="mt-0.5 truncate text-[11px] font-medium text-[var(--body)]">
                {schoolName}
              </p>
            </div>
          </div>

          {/* The nav is taller than a 13" viewport once the admin group is
              visible, so the scroll needs an affordance: without one, four
              admin routes simply appear not to exist. The mask fades the last
              row into the footer, and `scrollbar-gutter` keeps the track from
              shifting the labels when it appears. */}
          <div
            className="ed4u-nav-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-6"
            style={{ scrollbarGutter: "stable" }}
          >
            <NavLinks groups={groups} />
          </div>

          <div className="m-3 mt-0 rounded-2xl bg-[var(--surface-soft)] p-2">
            <UserProfileCard user={userSummary} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <MobileHeader groups={groups} user={userSummary} unreadCount={unreadCount} />
          <AppHeader user={userSummary} unreadCount={unreadCount} schoolName={schoolName} />

          <main id="main-content" className="flex-1 px-4 py-6 md:px-8 md:py-8 lg:px-10">
            <div className="mx-auto w-full max-w-[84rem]">{children}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
