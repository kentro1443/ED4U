"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icons, type IconType } from "@/components/ui/icons";
import type { PermittedNavGroup } from "@/lib/nav";

export function NavLinks({
  groups,
  onNavigate,
  className,
}: {
  groups: PermittedNavGroup[];
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();

  // The persistent shell renders many routes in desktop and mobile navigation.
  // Load them on click so production HTTP/1.1 connections remain free for mutations.
  return (
    <nav className={cn("space-y-5 select-none", className)} aria-label="Chính">
      {groups.map((group) => (
        <div key={group.id} className="space-y-1">
          <p className="px-3 text-[10px] font-bold tracking-[0.1em] text-[var(--muted)] uppercase">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const isActive =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

              const IconComponent = item.icon ? Icons[item.icon as IconType] : null;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    onClick={onNavigate}
                    className={cn(
                      "group flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition-[color,background-color,box-shadow,transform] duration-200 md:text-[13px] active:scale-[0.985] motion-reduce:transform-none",
                      isActive
                        ? "bg-[var(--brand-50)] text-[var(--primary)] shadow-[inset_0_0_0_1px_var(--brand-100)]"
                        : "text-[var(--body)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]",
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {IconComponent && (
                      <IconComponent
                        className={cn(
                          "h-4 w-4 shrink-0",
                          isActive
                            ? "text-[var(--primary)]"
                            : "text-[var(--muted)] transition-colors group-hover:text-[var(--body)]",
                        )}
                        aria-hidden="true"
                      />
                    )}
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
