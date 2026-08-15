import "server-only";
import { redirect } from "next/navigation";
import type { Actor, Permission } from "@ed4u/domain";
import { ForbiddenError, can } from "@ed4u/domain";
import { currentActor } from "@/lib/auth";
import { permissionForRoute, type GuardedRoute } from "@/lib/routePermissions";

/**
 * Server-side authorization. Never rely on navigation visibility: every guarded
 * page and every server action re-derives the actor from the session cookie and
 * re-checks the specific permission it needs.
 *
 * There is deliberately no `requireAdmin()`. "Admin" is not a capability —
 * ADMIN_IT may provision accounts but must not resolve room approvals, and
 * SCHOOL_ADMIN may approve rooms but must not change system settings. Callers
 * name the permission they need so the difference is enforced, not assumed.
 */

/** Resolves the session actor, or redirects to login. */
export async function requireActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  return actor;
}

/**
 * Resolves the actor and asserts a specific permission.
 *
 * Denial redirects to `/403`. Next 16's `forbidden()` would give a truer status
 * code, but its `authInterrupts` boundary does not paint: the denial UI is
 * emitted into the RSC payload and never committed to the DOM, leaving the user
 * on a blank page. The redirect is plain, supported behaviour that works in dev
 * and production alike.
 *
 * The security property is identical either way — the guarded page never runs,
 * so no protected data is rendered or sent — and that is what the tests assert.
 */
export async function requirePermission(permission: Permission): Promise<Actor> {
  const actor = await requireActor();
  if (!can(actor, permission)) redirect("/403");
  return actor;
}

/** Guards a page listed in ROUTE_PERMISSIONS using that route's permission. */
export async function requireRoute(route: GuardedRoute): Promise<Actor> {
  return requirePermission(permissionForRoute(route));
}

/**
 * Tenant boundary. A resource from another tenant is treated as forbidden even
 * when the actor holds the permission, and the tenant id is never taken from
 * the client.
 */
export function assertTenant(actor: Actor, resourceTenantId: string): void {
  if (actor.tenantId !== resourceTenantId) {
    throw new ForbiddenError("Tài nguyên không thuộc trường của bạn.", {
      reason: "CROSS_TENANT",
    });
  }
}

/**
 * Resource relationship. Holding `appointment.accept` does not entitle a
 * teacher to accept *another* teacher's appointment, so actions assert the
 * relationship in addition to the permission.
 */
export function assertRelated(
  actor: Actor,
  relatedUserIds: readonly (string | null | undefined)[],
  message = "Bạn không phải là người phụ trách hồ sơ này.",
): void {
  if (!relatedUserIds.some((id) => id != null && id === actor.userId)) {
    throw new ForbiddenError(message, { reason: "NOT_RELATED" });
  }
}

/** True when the actor may see every record in the tenant for this permission. */
export function hasTenantWideRead(actor: Actor, permission: Permission): boolean {
  return can(actor, permission);
}
