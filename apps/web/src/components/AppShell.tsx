import Link from "next/link";
import type { Actor } from "@ed4u/domain";
import { visibleNav } from "@/lib/nav";
import { db } from "@/lib/db";
import { NavLinks } from "./navigation/NavLinks";
import { UserProfileCard, type UserSummary } from "./navigation/UserMenu";
import { MobileHeader } from "./navigation/MobileHeader";

export async function AppShell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const [groups, user] = await Promise.all([
    Promise.resolve(visibleNav(actor)),
    db.user.findUnique({
      where: { id: actor.userId },
      select: { fullName: true },
    }),
  ]);

  const userSummary: UserSummary = {
    schoolMemberCode: actor.schoolMemberCode,
    fullName: user?.fullName,
    roles: actor.roles,
    membershipStatus: actor.membershipStatus,
  };

  return (
    <div className="flex min-h-dvh bg-[var(--canvas)] text-[var(--ink)]">
      {/* Desktop Sidebar (>= 768px) */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-[var(--hairline)] bg-[var(--canvas)] px-4 py-5 md:flex">
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)] text-sm font-bold text-[var(--on-primary)] shadow-xs">
              E
            </span>
            <div>
              <Link
                href="/dashboard"
                className="text-base font-bold tracking-tight text-[var(--ink)] hover:opacity-80 transition-opacity"
              >
                ED4U
              </Link>
              <p className="text-[11px] text-[var(--muted)] font-medium">Demo High School</p>
            </div>
          </div>

          <div className="overflow-y-auto max-h-[calc(100vh-14rem)] pr-1">
            <NavLinks groups={groups} />
          </div>
        </div>

        <div className="mt-4 pt-2">
          <UserProfileCard user={userSummary} />
        </div>
      </aside>

      {/* Main Content Viewport */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Header (< 768px) */}
        <MobileHeader groups={groups} user={userSummary} />

        {/* Page Content Container */}
        <main id="main-content" className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-6xl w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
