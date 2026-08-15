import type { Actor, Permission } from "@ed4u/domain";
import { can } from "@ed4u/domain";

export interface NavItem {
  href: string;
  label: string;
  permission?: Permission;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: "TỔNG QUAN",
    items: [{ href: "/dashboard", label: "Dashboard" }],
  },
  {
    id: "learn",
    label: "HỌC TẬP & HỖ TRỢ",
    items: [
      { href: "/mentor", label: "Mentor", permission: "mentor.match" },
      { href: "/mentor/match-space", label: "Match Space", permission: "mentor.match" },
    ],
  },
  {
    id: "ops",
    label: "VẬN HÀNH",
    items: [
      { href: "/calendar", label: "Calendar" },
      { href: "/applications", label: "Applications" },
      { href: "/appointments", label: "Appointments" },
      { href: "/rooms", label: "Rooms" },
      { href: "/events", label: "School Events" },
      { href: "/clubs", label: "Clubs" },
    ],
  },
  {
    id: "community",
    label: "CỘNG ĐỒNG",
    items: [{ href: "/discussion", label: "Discussion Hub" }],
  },
  {
    id: "tools",
    label: "CÔNG CỤ",
    items: [
      { href: "/notifications", label: "Notifications" },
      { href: "/search", label: "Search" },
    ],
  },
  {
    id: "account",
    label: "TÀI KHOẢN",
    items: [
      { href: "/profile", label: "Profile" },
      { href: "/security", label: "Security" },
    ],
  },
  {
    id: "admin",
    label: "QUẢN TRỊ",
    items: [
      { href: "/admin/members", label: "Members", permission: "members.manage" },
      { href: "/admin/timetable", label: "Timetable", permission: "timetable.edit" },
      { href: "/admin/rooms", label: "Rooms & Features", permission: "rooms.manage" },
      { href: "/admin/approvals", label: "Approvals", permission: "approvals.resolve" },
      { href: "/admin/moderation", label: "Forum Moderation", permission: "forum.moderate" },
      { href: "/admin/audit", label: "Audit", permission: "audit.read" },
      { href: "/admin/settings", label: "System Settings", permission: "system.settings" },
    ],
  },
];

export function visibleNav(actor: Actor): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => !item.permission || can(actor, item.permission)),
  })).filter((g) => g.items.length > 0);
}
