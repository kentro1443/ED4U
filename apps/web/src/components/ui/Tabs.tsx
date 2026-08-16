import Link from "next/link";
import { cn } from "@/lib/cn";

export interface TabItem {
  label: string;
  href?: string;
  value?: string;
  active?: boolean;
  count?: number;
}

export function NavPillTabs({
  items,
  activeValue,
  onChange,
  className,
}: {
  items: TabItem[];
  activeValue?: string;
  onChange?: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] p-1.5 shadow-[var(--shadow-sm)]",
        className,
      )}
    >
      {items.map((item) => {
        const isActive = activeValue ? item.value === activeValue : item.active;
        const baseClass = cn(
          "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold tracking-tight transition-[background-color,color,box-shadow] duration-150 select-none",
          isActive
            ? "bg-[var(--brand-50)] text-[var(--primary)] shadow-[var(--shadow-sm)]"
            : "text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]",
        );

        if (item.href) {
          return (
            <Link
              key={item.href}
              href={item.href}
              role="tab"
              aria-selected={isActive}
              className={baseClass}
            >
              {item.label}
              {typeof item.count === "number" && (
                <span
                  className={cn(
                    "rounded-lg px-1.5 py-0.5 text-[10px]",
                    isActive
                      ? "bg-white text-[var(--primary)]"
                      : "bg-[var(--surface-strong)]/70 text-[var(--muted)]",
                  )}
                >
                  {item.count}
                </span>
              )}
            </Link>
          );
        }

        return (
          <button
            key={item.value ?? item.label}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => item.value && onChange?.(item.value)}
            className={baseClass}
          >
            {item.label}
            {typeof item.count === "number" && (
              <span
                className={cn(
                  "rounded-lg px-1.5 py-0.5 text-[10px]",
                  isActive
                    ? "bg-white text-[var(--primary)]"
                    : "bg-[var(--surface-strong)]/70 text-[var(--muted)]",
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function UnderlineTabs({
  label,
  items,
  className,
}: {
  label: string;
  items: TabItem[];
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn("overflow-x-auto border-b border-[var(--hairline)]", className)}
    >
      <div role="tablist" className="flex min-w-max gap-6">
        {items.map((item) => (
          <Link
            key={item.href ?? item.label}
            href={item.href ?? "#"}
            role="tab"
            aria-selected={item.active}
            className={cn(
              "inline-flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors",
              item.active
                ? "border-[var(--primary)] text-[var(--ink)] font-semibold"
                : "border-transparent text-[var(--muted)] hover:border-gray-300 hover:text-[var(--ink)]",
            )}
          >
            <span>{item.label}</span>
            {typeof item.count === "number" && (
              <span className="rounded-lg bg-[var(--surface-soft)] px-2 py-0.5 text-xs text-[var(--muted)]">
                {item.count}
              </span>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}
