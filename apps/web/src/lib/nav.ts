import type { Actor, Permission } from "@ed4u/domain";
import { can } from "@ed4u/domain";
import { ROUTE_PERMISSIONS } from "@/lib/routePermissions";

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
    // Permissions come from ROUTE_PERMISSIONS — the same map the server-side
    // guard uses — so a link can never be shown to a role the page would reject,
    // nor hidden from a role the page would admit.
    items: [
      { href: "/admin/members", label: "Members", permission: ROUTE_PERMISSIONS["/admin/members"] },
      {
        href: "/admin/timetable",
        label: "Timetable",
        permission: ROUTE_PERMISSIONS["/admin/timetable"],
      },
      {
        href: "/admin/rooms",
        label: "Rooms & Features",
        permission: ROUTE_PERMISSIONS["/admin/rooms"],
      },
      {
        href: "/admin/approvals",
        label: "Approvals",
        permission: ROUTE_PERMISSIONS["/admin/approvals"],
      },
      {
        href: "/admin/moderation",
        label: "Forum Moderation",
        permission: ROUTE_PERMISSIONS["/admin/moderation"],
      },
      { href: "/admin/audit", label: "Audit", permission: ROUTE_PERMISSIONS["/admin/audit"] },
      {
        href: "/admin/settings",
        label: "System Settings",
        permission: ROUTE_PERMISSIONS["/admin/settings"],
      },
    ],
  },
];

export function visibleNav(actor: Actor): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => !item.permission || can(actor, item.permission)),
  })).filter((g) => g.items.length > 0);
}
