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

  return (
    <nav className={cn("space-y-6 select-none", className)} aria-label="Chính">
      {groups.map((group) => (
        <div key={group.id} className="space-y-1">
          <p className="px-3 text-[11px] font-semibold tracking-wider text-[var(--muted)] uppercase">
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
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-xs md:text-sm font-medium transition-colors duration-150",
                      isActive
                        ? "bg-[var(--primary)] text-[var(--on-primary)] font-semibold shadow-xs"
                        : "text-[var(--body)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]",
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {IconComponent && (
                      <IconComponent
                        className={cn(
                          "h-4 w-4 shrink-0",
                          isActive ? "text-[var(--on-primary)]" : "text-[var(--muted)]",
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
