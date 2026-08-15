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
    items: [{ href: "/dashboard", label: "Dashboard", icon: "dashboard" }],
  },
  {
    id: "learn",
    label: "HỌC TẬP & HỖ TRỢ",
    items: [
      { href: "/mentor", label: "Mentor", icon: "mentor", permission: "mentor.match" },
      {
        href: "/mentor/match-space",
        label: "Match Space",
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
        label: "Calendar",
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
        label: "Applications",
        icon: "applications",
        anyPermissions: ["application.create", "application.review"],
      },
      {
        href: "/appointments",
        label: "Appointments",
        icon: "appointments",
        anyPermissions: ["appointment.create", "appointment.accept"],
      },
      {
        href: "/rooms",
        label: "Rooms",
        icon: "rooms",
        anyPermissions: ["room.request", "rooms.manage", "room.approve"],
      },
      {
        href: "/events",
        label: "School Events",
        icon: "events",
        anyPermissions: ["discussion.read", "timetable.edit", "members.manage"],
      },
      {
        href: "/clubs",
        label: "Clubs",
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
        label: "Discussion Hub",
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
      { href: "/notifications", label: "Notifications", icon: "notifications" },
      { href: "/search", label: "Search", icon: "search" },
    ],
  },
  {
    id: "account",
    label: "TÀI KHOẢN",
    items: [
      { href: "/profile", label: "Profile", icon: "profile" },
      { href: "/security", label: "Security", icon: "security" },
    ],
  },
  {
    id: "admin",
    label: "QUẢN TRỊ",
    items: [
      {
        href: "/admin/members",
        label: "Members",
        icon: "adminMembers",
        permission: ROUTE_PERMISSIONS["/admin/members"],
      },
      {
        href: "/admin/timetable",
        label: "Timetable",
        icon: "adminTimetable",
        permission: ROUTE_PERMISSIONS["/admin/timetable"],
      },
      {
        href: "/admin/rooms",
        label: "Rooms & Features",
        icon: "adminRooms",
        permission: ROUTE_PERMISSIONS["/admin/rooms"],
      },
      {
        href: "/admin/approvals",
        label: "Approvals",
        icon: "adminApprovals",
        permission: ROUTE_PERMISSIONS["/admin/approvals"],
      },
      {
        href: "/admin/moderation",
        label: "Forum Moderation",
        icon: "adminModeration",
        permission: ROUTE_PERMISSIONS["/admin/moderation"],
      },
      {
        href: "/admin/audit",
        label: "Audit",
        icon: "adminAudit",
        permission: ROUTE_PERMISSIONS["/admin/audit"],
      },
      {
        href: "/admin/settings",
        label: "System Settings",
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
