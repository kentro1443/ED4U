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
  const map: Record<string, { tone: BadgeTone; label: string }> = {
    ACTIVE: { tone: "success", label: "Hoạt động" },
    ACCEPTED: { tone: "success", label: "Đã chấp nhận" },
    APPROVED: { tone: "success", label: "Đã duyệt" },
    VERIFIED: { tone: "success", label: "Đã xác minh" },
    SUCCESS: { tone: "success", label: "Thành công" },
    CONFIRMED: { tone: "success", label: "Đã xác nhận" },
    COMPLETED: { tone: "success", label: "Hoàn thành" },
    PENDING: { tone: "warning", label: "Đang chờ" },
    PENDING_APPROVAL: { tone: "warning", label: "Chờ duyệt" },
    REQUESTED: { tone: "warning", label: "Chờ phản hồi" },
    SUBMITTED: { tone: "brand", label: "Đã nộp" },
    IN_REVIEW: { tone: "warning", label: "Đang review" },
    NEEDS_MORE_INFO: { tone: "warning", label: "Cần bổ sung" },
    RESCHEDULE_PROPOSED: { tone: "warning", label: "Đề xuất đổi giờ" },
    CHANGES_REQUESTED: { tone: "warning", label: "Cần chỉnh sửa" },
    PROPOSED: { tone: "warning", label: "Đang đề xuất" },
    WARNING: { tone: "warning", label: "Cảnh báo" },
    WAITING: { tone: "warning", label: "Đang chờ" },
    REJECTED: { tone: "danger", label: "Từ chối" },
    DECLINED: { tone: "danger", label: "Đã từ chối" },
    CANCELLED: { tone: "danger", label: "Đã hủy" },
    ERROR: { tone: "danger", label: "Lỗi" },
    BLOCKED: { tone: "danger", label: "Bị chặn" },
    INACTIVE: { tone: "danger", label: "Không hoạt động" },
    SUSPENDED: { tone: "danger", label: "Tạm ngưng" },
    DRAFT: { tone: "neutral", label: "Bản nháp" },
    VOIDED: { tone: "neutral", label: "Đã vô hiệu" },
    ARCHIVED: { tone: "neutral", label: "Lưu trữ" },
    STUDENT: { tone: "neutral", label: "Học sinh" },
    TEACHER: { tone: "neutral", label: "Giáo viên" },
    MENTOR: { tone: "brand", label: "Cố vấn" },
    SCHOOL_ADMIN: { tone: "brand", label: "Quản trị trường" },
    ADMIN_IT: { tone: "dark", label: "Quản trị hệ thống" },
  };
  const item = map[s] ?? { tone: "neutral" as BadgeTone, label: status };
  return (
    <Badge tone={item.tone} dot className={className}>
      {item.label}
    </Badge>
  );
}
