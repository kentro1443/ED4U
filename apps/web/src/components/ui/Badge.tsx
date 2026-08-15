import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "brand" | "neutral" | "success" | "warning" | "danger" | "outline" | "dark";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: boolean;
  size?: "sm" | "md";
}

const toneStyles: Record<BadgeTone, string> = {
  brand: "bg-blue-50 text-blue-700 border-blue-200",
  neutral: "bg-gray-100 text-gray-700 border-gray-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  danger: "bg-red-50 text-red-700 border-red-200",
  outline: "bg-transparent text-gray-700 border-gray-300",
  dark: "bg-gray-900 text-white border-gray-900",
};

const dotStyles: Record<BadgeTone, string> = {
  brand: "bg-blue-600",
  neutral: "bg-gray-500",
  success: "bg-emerald-600",
  warning: "bg-amber-600",
  danger: "bg-red-600",
  outline: "bg-gray-400",
  dark: "bg-white",
};

export function Badge({
  tone = "neutral",
  dot = false,
  size = "md",
  className,
  children,
  ...props
}: BadgeProps) {
  const sizeClass = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium tracking-tight whitespace-nowrap",
        toneStyles[tone],
        sizeClass,
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotStyles[tone])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = status.toUpperCase();
  let tone: BadgeTone = "neutral";
  let label = status;

  if (["ACTIVE", "ACCEPTED", "APPROVED", "VERIFIED", "SUCCESS", "CONFIRMED"].includes(s)) {
    tone = "success";
    label =
      s === "ACTIVE"
        ? "Hoạt động"
        : s === "APPROVED"
          ? "Đã duyệt"
          : s === "ACCEPTED"
            ? "Đã chấp nhận"
            : status;
  } else if (["PENDING", "PENDING_APPROVAL", "WARNING", "WAITING"].includes(s)) {
    tone = "warning";
    label = s.includes("PENDING") ? "Chờ duyệt" : status;
  } else if (["REJECTED", "CANCELLED", "ERROR", "BLOCKED", "INACTIVE"].includes(s)) {
    tone = "danger";
    label = s === "REJECTED" ? "Từ chối" : s === "CANCELLED" ? "Đã hủy" : status;
  } else if (["STUDENT", "TEACHER", "SCHOOL_ADMIN", "ADMIN_IT"].includes(s)) {
    tone = s === "ADMIN_IT" ? "dark" : s === "SCHOOL_ADMIN" ? "brand" : "neutral";
    label = status;
  }

  return (
    <Badge tone={tone} dot className={className}>
      {label}
    </Badge>
  );
}
