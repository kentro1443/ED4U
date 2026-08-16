import { type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icons } from "./icons";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function PageHeader({
  title,
  description,
  badge,
  actions,
  breadcrumbs,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  className?: string;
}) {
  return (
    <header className={cn("mb-7 pb-1", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className="mb-2 flex items-center gap-1.5 text-xs text-[var(--muted)]"
        >
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <span key={idx} className="flex items-center gap-1.5">
                {idx > 0 && (
                  <Icons.chevronRight className="h-3 w-3 text-gray-400" aria-hidden="true" />
                )}
                {crumb.href && !isLast ? (
                  <Link href={crumb.href} className="hover:text-[var(--ink)] transition-colors">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={isLast ? "font-medium text-[var(--ink)]" : ""}>
                    {crumb.label}
                  </span>
                )}
              </span>
            );
          })}
        </nav>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-extrabold tracking-[-0.04em] text-[var(--ink)] sm:text-3xl">
              {title}
            </h1>
            {badge}
          </div>
          {description && (
            <p className="max-w-3xl text-sm leading-6 text-[var(--muted)]">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2.5 shrink-0">{actions}</div>}
      </div>
    </header>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4",
        className,
      )}
    >
      <div>
        <h2 className="text-base font-extrabold tracking-[-0.02em] text-[var(--ink)]">{title}</h2>
        {description && <p className="text-xs text-[var(--muted)] mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
