import type { Actor, Permission } from "@ed4u/domain";
import { can, canReadDiscussion } from "@ed4u/domain";
import { ROUTE_PERMISSIONS } from "@/lib/routePermissions";
import type { IconType } from "@/components/ui/icons";

export interface NavItem {
  href: string;
  label: string;
  icon?: IconType;
  permission?: Permission;
  anyPermissions?: readonly Permission[];
  predicate?: (actor: Actor) => boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export interface PermittedNavItem {
  href: string;
  label: string;
  icon?: IconType;
}

export interface PermittedNavGroup {
  id: string;
  label: string;
  items: PermittedNavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: "TỔNG QUAN",
    items: [{ href: "/dashboard", label: "Tổng quan", icon: "dashboard" }],
  },
  {
    id: "learn",
    label: "HỌC TẬP & HỖ TRỢ",
    items: [
      { href: "/mentor", label: "Cố vấn", icon: "mentor", permission: "mentor.match" },
      {
        href: "/mentor/match-space",
        label: "Không gian ghép nối",
        icon: "matchSpace",
        permission: "mentor.match",
      },
    ],
  },
  {
    id: "ops",
    label: "VẬN HÀNH",
    items: [
      {
        href: "/calendar",
        label: "Lịch",
        icon: "calendar",
        anyPermissions: [
          "timetable.edit",
          "timetable.import",
          "application.create",
          "application.review",
          "members.manage",
        ],
      },
      {
        href: "/applications",
        label: "Đơn từ",
        icon: "applications",
        anyPermissions: ["application.create", "application.review"],
      },
      {
        href: "/appointments",
        label: "Lịch hẹn",
        icon: "appointments",
        anyPermissions: ["appointment.create", "appointment.accept"],
      },
      {
        href: "/rooms",
        label: "Phòng học",
        icon: "rooms",
        anyPermissions: ["room.request", "rooms.manage", "room.approve"],
      },
      {
        href: "/events",
        label: "Sự kiện trường",
        icon: "events",
        anyPermissions: ["discussion.read", "timetable.edit", "members.manage"],
      },
      {
        href: "/clubs",
        label: "Câu lạc bộ",
        icon: "clubs",
        anyPermissions: ["club.propose", "club.manage"],
      },
    ],
  },
  {
    id: "community",
    label: "CỘNG ĐỒNG",
    items: [
      {
        href: "/discussion",
        label: "Diễn đàn",
        icon: "discussion",
        permission: "discussion.read",
        predicate: canReadDiscussion,
      },
    ],
  },
  {
    id: "tools",
    label: "CÔNG CỤ",
    items: [
      { href: "/notifications", label: "Thông báo", icon: "notifications" },
      { href: "/search", label: "Tìm kiếm", icon: "search" },
      { href: "/manual", label: "Hướng dẫn sử dụng", icon: "help" },
    ],
  },
  {
    id: "account",
    label: "TÀI KHOẢN",
    items: [
      { href: "/profile", label: "Hồ sơ", icon: "profile" },
      { href: "/security", label: "Bảo mật", icon: "security" },
    ],
  },
  {
    id: "admin",
    label: "QUẢN TRỊ",
    items: [
      {
        href: "/admin/members",
        label: "Thành viên",
        icon: "adminMembers",
        permission: ROUTE_PERMISSIONS["/admin/members"],
      },
      {
        href: "/admin/timetable",
        label: "Thời khóa biểu",
        icon: "adminTimetable",
        permission: ROUTE_PERMISSIONS["/admin/timetable"],
      },
      {
        href: "/admin/timetable/import",
        label: "Nhập thời khóa biểu",
        icon: "adminTimetable",
        permission: ROUTE_PERMISSIONS["/admin/timetable/import"],
      },
      {
        href: "/admin/rooms",
        label: "Phòng & tiện ích",
        icon: "adminRooms",
        permission: ROUTE_PERMISSIONS["/admin/rooms"],
      },
      {
        href: "/admin/approvals",
        label: "Phê duyệt",
        icon: "adminApprovals",
        permission: ROUTE_PERMISSIONS["/admin/approvals"],
      },
      {
        href: "/admin/moderation",
        label: "Kiểm duyệt diễn đàn",
        icon: "adminModeration",
        permission: ROUTE_PERMISSIONS["/admin/moderation"],
      },
      {
        href: "/admin/audit",
        label: "Nhật ký hệ thống",
        icon: "adminAudit",
        permission: ROUTE_PERMISSIONS["/admin/audit"],
      },
      {
        href: "/admin/settings",
        label: "Cài đặt hệ thống",
        icon: "adminSettings",
        permission: ROUTE_PERMISSIONS["/admin/settings"],
      },
    ],
  },
];

export function visibleNav(actor: Actor): PermittedNavGroup[] {
  return NAV_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    items: g.items
      .filter((item) => {
        if (item.predicate && !item.predicate(actor)) return false;
        if (item.permission && !can(actor, item.permission)) return false;
        if (item.anyPermissions && !item.anyPermissions.some((p) => can(actor, p))) {
          return false;
        }
        return true;
      })
      .map((item) => ({
        href: item.href,
        label: item.label,
        icon: item.icon,
      })),
  })).filter((g) => g.items.length > 0);
}
