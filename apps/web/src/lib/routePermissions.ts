import type { Permission } from "@ed4u/domain";

/**
 * Single source of truth for route-level authorization.
 *
 * Both the navigation (what a role is shown) and the server-side guard (what a
 * role may actually load) read this map, so the two can never drift apart. A
 * route that is hidden from the sidebar but reachable by typing its URL is the
 * exact defect this map exists to prevent.
 *
 * Permissions are deliberately specific: ADMIN_IT and SCHOOL_ADMIN are not
 * interchangeable. ADMIN_IT provisions accounts and configures the system;
 * SCHOOL_ADMIN runs school operations. Only `audit.read` is held by both.
 */
export const ROUTE_PERMISSIONS = {
  "/admin/members": "members.manage",
  "/admin/timetable": "timetable.edit",
  "/admin/rooms": "rooms.manage",
  "/admin/approvals": "approvals.resolve",
  "/admin/moderation": "forum.moderate",
  "/admin/audit": "audit.read",
  "/admin/settings": "system.settings",
} as const satisfies Record<string, Permission>;

export type GuardedRoute = keyof typeof ROUTE_PERMISSIONS;

export const GUARDED_ROUTES = Object.keys(ROUTE_PERMISSIONS) as GuardedRoute[];

export function permissionForRoute(route: GuardedRoute): Permission {
  return ROUTE_PERMISSIONS[route];
}
