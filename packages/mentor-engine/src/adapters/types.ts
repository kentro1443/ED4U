/**
 * Adapter contracts: the seam between ED4U's database and this engine.
 *
 * The engine knows nothing about Prisma, Next.js, Supabase, tenants, sessions or
 * RBAC — and must keep knowing nothing, or "reusable package" stops being true.
 * An adapter is the one place that knows both sides, and it lives in the
 * *server*, not here. These interfaces exist so that adapter has a contract to
 * satisfy.
 *
 * The hard part of writing one is not the field names. It is the three-valued
 * credential rule: a column that is `NULL` in the database usually means "we
 * never asked", which is **UNKNOWN** (omit the key), not **ABSENT** (`null`).
 * Getting that backwards makes the engine assert that a mentor holds no IELTS
 * certificate when the truth is that nobody ever recorded one — see
 * {@link credentialKnowledge}.
 */

import type { Mentor } from "../schemas/mentor.js";
import type { StudentRequest } from "../schemas/request.js";

/**
 * Converts one server-side mentor record into the canonical shape.
 *
 * @typeParam T - Whatever the host application's mentor row looks like.
 */
export interface MentorDataAdapter<T> {
  /**
   * @param source - One row/record from the host system.
   * @returns A canonical mentor. Implementations should return the object and
   *   let `validateMentor` decide whether it is acceptable, rather than
   *   pre-emptively "fixing" data — a silent fix is invented data.
   */
  toCanonicalMentor(source: T): Mentor;
}

/**
 * Converts one server-side request record into the canonical shape.
 *
 * @typeParam T - Whatever the host application's request/form payload is.
 */
export interface RequestDataAdapter<T> {
  /**
   * @param source - One request record from the host system.
   * @returns A canonical student request, to be validated before use.
   */
  toCanonicalRequest(source: T): StudentRequest;
}

/**
 * Both directions, for adapters that handle a whole match run.
 *
 * @typeParam TMentor - Host mentor record type.
 * @typeParam TRequest - Host request record type.
 */
export interface EngineDataAdapter<TMentor, TRequest>
  extends MentorDataAdapter<TMentor>,
    RequestDataAdapter<TRequest> {}
