"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useState, useTransition, type FormEvent } from "react";
import { Avatar } from "@/components/ui/DataDisplay";
import { Badge } from "@/components/ui/Badge";
import { Icons } from "@/components/ui/icons";
import { breadcrumbsFor } from "@/lib/routeMeta";
import { logoutAction } from "./actions";
import type { UserSummary } from "./UserMenu";

/**
 * The desktop application bar.
 *
 * An operations product is recognised by this strip: where am I, what needs my
 * attention, who am I signed in as, and how do I find a record. Without it the
 * app reads as a stack of documents rather than a tool, which was the single
 * loudest signal that ED4U was still a prototype.
 */

export function AppHeader({
  user,
  unreadCount,
  schoolName,
}: {
  user: UserSummary;
  unreadCount: number;
  schoolName: string;
}) {
  const pathname = usePathname();
  const crumbs = breadcrumbsFor(pathname);

  return (
    <header className="sticky top-0 z-30 hidden h-14 shrink-0 items-center gap-4 border-b border-[var(--hairline)] bg-[var(--canvas)]/90 px-6 backdrop-blur-md md:flex">
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1.5 text-sm">
          {crumbs.length === 0 ? (
            <li className="font-semibold text-[var(--ink)]">{schoolName}</li>
          ) : (
            crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1;
              return (
                <Fragment key={`${crumb.label}-${index}`}>
                  {index > 0 && (
                    <li aria-hidden="true">
                      <Icons.chevronRight className="h-3.5 w-3.5 text-[var(--muted)]" />
                    </li>
                  )}
                  <li className="min-w-0">
                    {crumb.href && !isLast ? (
                      <Link
                        href={crumb.href}
                        className="truncate rounded text-[var(--muted)] transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span
                        className={
                          isLast
                            ? "truncate font-semibold text-[var(--ink)]"
                            : "truncate text-[var(--muted)]"
                        }
                        aria-current={isLast ? "page" : undefined}
                      >
                        {crumb.label}
                      </span>
                    )}
                  </li>
                </Fragment>
              );
            })
          )}
        </ol>
      </nav>

      <HeaderSearch />

      <Link
        href="/notifications"
        aria-label={
          unreadCount > 0 ? `Thông báo, ${unreadCount} chưa đọc` : "Thông báo, không có mục mới"
        }
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-[var(--body)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        <Icons.notifications className="h-[18px] w-[18px]" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--error)] px-1 text-[10px] font-semibold tabular-nums text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Link>

      <HeaderUserMenu user={user} />
    </header>
  );
}

function HeaderSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    const q = value.trim();
    if (!q) return;
    startTransition(() => router.push(`/search?q=${encodeURIComponent(q)}`));
  }

  return (
    <form onSubmit={submit} role="search" className="relative hidden w-64 lg:block">
      <label htmlFor="global-search" className="sr-only">
        Tìm kiếm trong toàn trường
      </label>
      <Icons.search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
        aria-hidden="true"
      />
      <input
        id="global-search"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Tìm phòng, lớp, CLB, chủ đề…"
        className="h-9 w-full rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] pl-9 pr-3 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] transition-colors focus:bg-[var(--canvas)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      />
      {pending && (
        <Icons.spinner
          className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--muted)] motion-reduce:animate-none"
          aria-hidden="true"
        />
      )}
    </form>
  );
}

function HeaderUserMenu({ user }: { user: UserSummary }) {
  const [open, setOpen] = useState(false);
  const displayName = user.fullName || user.schoolMemberCode;
  const primaryRole = user.roles[0] || "MEMBER";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-9 items-center gap-2 rounded-md pl-1 pr-2 transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        <Avatar name={displayName} size="sm" />
        <span className="hidden max-w-32 truncate text-sm font-medium text-[var(--ink)] xl:block">
          {displayName}
        </span>
        <Icons.chevronDown className="h-3.5 w-3.5 text-[var(--muted)]" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] shadow-[var(--shadow-lg)]"
        >
          <div className="flex items-center gap-3 border-b border-[var(--hairline-soft)] p-3">
            <Avatar name={displayName} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--ink)]">{displayName}</p>
              <p className="truncate font-mono text-[11px] text-[var(--muted)]">
                {user.schoolMemberCode}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1 border-b border-[var(--hairline-soft)] px-3 py-2.5">
            <Badge tone={primaryRole.includes("ADMIN") ? "dark" : "neutral"} size="sm">
              {primaryRole}
            </Badge>
            {user.roles.slice(1).map((role) => (
              <Badge key={role} tone="outline" size="sm">
                {role}
              </Badge>
            ))}
            {user.membershipStatus !== "ACTIVE" && (
              <Badge tone="warning" size="sm">
                {user.membershipStatus}
              </Badge>
            )}
          </div>

          <div className="p-1">
            <Link
              href="/profile"
              role="menuitem"
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-[var(--body)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"
            >
              <Icons.profile className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
              Hồ sơ của tôi
            </Link>
            <Link
              href="/security"
              role="menuitem"
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-[var(--body)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"
            >
              <Icons.security className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
              Bảo mật & phiên đăng nhập
            </Link>
          </div>

          <form action={logoutAction} className="border-t border-[var(--hairline-soft)] p-1">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm text-[var(--body)] transition-colors hover:bg-red-50 hover:text-red-700"
            >
              <Icons.logout className="h-4 w-4" aria-hidden="true" />
              Đăng xuất
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
