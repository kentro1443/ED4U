"use client";

import { useState } from "react";
import Link from "next/link";
import { Drawer } from "@/components/ui/Overlays";
import { IconButton } from "@/components/ui/Button";
import { Icons } from "@/components/ui/icons";
import { NavLinks } from "./NavLinks";
import { UserProfileCard, type UserSummary } from "./UserMenu";
import type { NavGroup } from "@/lib/nav";

export function MobileHeader({ groups, user }: { groups: NavGroup[]; user: UserSummary }) {
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

        <div className="flex items-center gap-2">
          <IconButton
            label="Mở menu điều hướng"
            variant="ghost"
            size="sm"
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
