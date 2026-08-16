"use client";

import { useState } from "react";
import Link from "next/link";
import { Drawer } from "@/components/ui/Overlays";
import { IconButton } from "@/components/ui/Button";
import { Icons } from "@/components/ui/icons";
import { NavLinks } from "./NavLinks";
import { UserProfileCard, type UserSummary } from "./UserMenu";
import type { PermittedNavGroup } from "@/lib/nav";

export function MobileHeader({
  groups,
  user,
  unreadCount,
}: {
  groups: PermittedNavGroup[];
  user: UserSummary;
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-[var(--hairline)] bg-[var(--canvas)]/95 px-4 backdrop-blur-md md:hidden">
        <div className="flex items-center gap-2.5">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--primary)] text-xs font-bold text-[var(--on-primary)] shadow-xs">
              E
            </span>
            <span className="text-base font-bold tracking-tight text-[var(--ink)]">ED4U</span>
          </Link>
        </div>

        <div className="flex items-center gap-1">
          <Link
            href="/notifications"
            aria-label={
              unreadCount > 0 ? `Thông báo, ${unreadCount} chưa đọc` : "Thông báo, không có mục mới"
            }
            className="relative flex h-11 w-11 items-center justify-center rounded-md text-[var(--body)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            <Icons.notifications className="h-5 w-5" aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--error)] px-1 text-[10px] font-semibold tabular-nums text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
          <IconButton
            label="Mở menu điều hướng"
            variant="ghost"
            size="md"
            className="h-11 w-11"
            onClick={() => setOpen(true)}
            aria-expanded={open}
          >
            <Icons.menu className="h-5 w-5 text-[var(--ink)]" />
          </IconButton>
        </div>
      </header>

      <Drawer
        open={open}
        onOpenChange={setOpen}
        side="left"
        title="ED4U"
        description="Nền tảng vận hành trường học"
      >
        <div className="flex h-full flex-col justify-between space-y-6 pt-2">
          <div className="flex-1 overflow-y-auto pr-1">
            <NavLinks groups={groups} onNavigate={() => setOpen(false)} />
          </div>
          <div className="border-t border-[var(--hairline-soft)] pt-4">
            <UserProfileCard user={user} />
          </div>
        </div>
      </Drawer>
    </>
  );
}
