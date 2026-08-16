import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { type ReactNode, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// ==========================================
// AVATAR
// ==========================================
export function getInitials(name: string): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClass = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
  }[size];

  return (
    <AvatarPrimitive.Root
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-full border border-[var(--hairline)] bg-[var(--surface-soft)] font-medium text-[var(--ink)] select-none",
        sizeClass,
        className,
      )}
    >
      {src && (
        <AvatarPrimitive.Image
          src={src}
          alt={name}
          className="aspect-square h-full w-full object-cover"
        />
      )}
      <AvatarPrimitive.Fallback
        delayMs={600}
        className="flex h-full w-full items-center justify-center bg-gray-100 font-semibold text-gray-800"
      >
        {getInitials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

// ==========================================
// STAT / METRIC CARD
// ==========================================
export function StatCard({
  title,
  value,
  description,
  icon,
  trend,
  className,
}: {
  title: string;
  value: ReactNode;
  description?: string;
  icon?: ReactNode;
  trend?: { label: string; positive?: boolean };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] hover:border-[var(--brand-100)] hover:shadow-[var(--shadow-md)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold tracking-[-0.01em] text-[var(--muted)]">{title}</p>
        {icon && <div className="text-[var(--muted)]">{icon}</div>}
      </div>
      <p className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--ink)]">{value}</p>
      {(description || trend) && (
        <div className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
          {trend && (
            <span
              className={cn(
                "font-semibold",
                trend.positive ? "text-emerald-700" : "text-amber-700",
              )}
            >
              {trend.label}
            </span>
          )}
          {description && <span>{description}</span>}
        </div>
      )}
    </div>
  );
}

// ==========================================
// DIVIDER / SEPARATOR
// ==========================================
export function Divider({
  className,
  orientation = "horizontal",
}: {
  className?: string;
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <hr
      className={cn(
        "shrink-0 border-0 bg-[var(--hairline)]",
        orientation === "horizontal" ? "h-[1px] w-full my-4" : "h-full w-[1px] mx-2 inline-block",
        className,
      )}
    />
  );
}
