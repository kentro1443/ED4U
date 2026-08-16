import { type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icons } from "./icons";

export type FeedbackTone = "info" | "success" | "warning" | "danger";

const alertStyles: Record<FeedbackTone, { box: string; icon: string }> = {
  info: {
    box: "border-blue-200 bg-blue-50/70 text-blue-900",
    icon: "text-blue-600",
  },
  success: {
    box: "border-emerald-200 bg-emerald-50/70 text-emerald-900",
    icon: "text-emerald-600",
  },
  warning: {
    box: "border-amber-200 bg-amber-50/70 text-amber-900",
    icon: "text-amber-600",
  },
  danger: {
    box: "border-red-200 bg-red-50/70 text-red-900",
    icon: "text-red-600",
  },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: FeedbackTone;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  const IconComponent =
    tone === "danger"
      ? Icons.alertCircle
      : tone === "warning"
        ? Icons.alertTriangle
        : tone === "success"
          ? Icons.check
          : Icons.info;

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-2xl border p-4 text-sm leading-relaxed shadow-[var(--shadow-sm)]",
        alertStyles[tone].box,
        className,
      )}
    >
      <IconComponent
        className={cn("h-5 w-5 shrink-0 mt-0.5", alertStyles[tone].icon)}
        aria-hidden="true"
      />
      <div className="flex-1 space-y-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="text-xs md:text-sm opacity-90">{children}</div>}
      </div>
    </div>
  );
}

export function InlineFeedback({
  tone = "info",
  children,
  className,
}: {
  tone?: FeedbackTone;
  children: ReactNode;
  className?: string;
}) {
  const colorMap = {
    info: "text-blue-700",
    success: "text-emerald-700",
    warning: "text-amber-700",
    danger: "text-red-700",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        colorMap[tone],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center rounded-[24px] border border-dashed border-[var(--hairline)] bg-[var(--surface-soft)]/50 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-50)] text-[var(--primary)] ring-1 ring-inset ring-[var(--brand-100)]">
        {icon ?? <Icons.info className="h-6 w-6" />}
      </div>
      <h3 className="mt-3 text-sm font-semibold text-[var(--ink)]">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-xs text-[var(--muted)] leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Đã xảy ra lỗi",
  description = "Không thể tải dữ liệu. Vui lòng thử lại sau.",
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <EmptyState
      title={title}
      description={description}
      action={action}
      icon={<Icons.alertTriangle className="h-6 w-6 text-red-500" />}
      className={cn("border-red-200 bg-red-50/30", className)}
    />
  );
}

export function ForbiddenState({
  title = "Không đủ quyền truy cập",
  description = "Tài khoản của bạn không được phân quyền xem nội dung này.",
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <EmptyState
      title={title}
      description={description}
      action={action}
      icon={<Icons.security className="h-6 w-6 text-[var(--ink)]" />}
      className={className}
    />
  );
}

export function Skeleton({
  className,
  label = "Đang tải dữ liệu",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "block animate-pulse rounded-xl bg-slate-200/80 motion-reduce:animate-none",
        className,
      )}
    />
  );
}
