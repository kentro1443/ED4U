/**
 * Entry points for validating untrusted input against the canonical contract.
 *
 * These wrappers never throw: callers get a discriminated
 * {@link ValidationResult} so an adapter can decide whether a bad record aborts
 * the request or is reported and skipped.
 */

import { MentorListSchema, MentorSchema } from "./mentor.js";
import type { Mentor } from "./mentor.js";
import { StudentRequestSchema } from "./request.js";
import type { StudentRequest } from "./request.js";
import { validateWith } from "./validation.js";
import type { ValidationIssue, ValidationResult } from "./validation.js";

/**
 * Validates a single mentor record.
 *
 * @param input - Unknown input, typically produced by an adapter.
 * @returns The canonical {@link Mentor}, or ordered validation issues.
 */
export function validateMentor(input: unknown): ValidationResult<Mentor> {
  return validateWith(MentorSchema, input);
}

/**
 * Validates a mentor list and additionally rejects duplicate mentor IDs.
 *
 * Duplicate IDs are a dataset-level defect that per-record validation cannot
 * see, and they would produce duplicate recommendations downstream.
 *
 * @param input - Unknown input, expected to be an array of mentor records.
 * @returns The canonical mentor list, or ordered validation issues.
 */
export function validateMentors(input: unknown): ValidationResult<Mentor[]> {
  const parsed = validateWith(MentorListSchema, input);
  if (!parsed.ok) return parsed;

  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  parsed.value.forEach((mentor, index) => {
    if (seen.has(mentor.id)) {
      issues.push({
        path: `${index}.id`,
        code: "custom",
        message: `Duplicate mentor id "${mentor.id}"`,
      });
    }
    seen.add(mentor.id);
  });

  return issues.length > 0 ? { ok: false, issues } : parsed;
}

/**
 * Validates a canonical student request, applying schema defaults for omitted
 * optional sections (`hardConstraints`, `softPreferences`, `availability`,
 * `additionalPreferences`).
 *
 * @param input - Unknown input, typically produced by an adapter or parser.
 * @returns The canonical {@link StudentRequest}, or ordered validation issues.
 */
export function validateStudentRequest(input: unknown): ValidationResult<StudentRequest> {
  return validateWith(StudentRequestSchema, input);
}
