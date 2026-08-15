/**
 * The semantic parser boundary.
 *
 * Phase 8 adds natural language *in front of* the verified engine, never inside
 * it. The boundary is defined by what a parser is structurally able to do:
 *
 * | May | May not |
 * | --- | --- |
 * | Read the student's text | See a single mentor record |
 * | Propose candidate criteria | Decide which criteria are executed |
 * | Say "I am unsure" | Choose or rank a mentor |
 * | Leave things unresolved | Invent an attribute nobody stated |
 *
 * A `SemanticParser` receives text and returns a {@link RawStudentRequest} — the
 * same untrusted shape a web form produces. It has no access to mentors, no
 * access to the ranker, and no way to write a canonical request: everything it
 * proposes goes through {@link resolveStudentRequest} and the Phase 1 schemas,
 * exactly like any other input. A parser that hallucinates a budget produces an
 * unresolved or rejected criterion, not a silent constraint.
 *
 * The engine must remain fully usable with no parser at all. Nothing in
 * `src/normalization`, `src/filtering`, `src/features`, `src/ranking` or
 * `src/explanation` imports this module.
 */

import { z } from "zod";

import type { RawStudentRequest } from "../normalization/resolver.js";

/** What the caller hands a parser. */
export interface ParseInput {
  /** The student's own words. */
  text: string;
  /**
   * Identifier for the resulting request. Supplied by the caller, never by the
   * parser — a parser inventing ids would let it collide records.
   */
  requestId: string;
  /** Optional hint (`"vi"`, `"en"`); parsers must work without it. */
  locale?: string;
}

/** Input visible to a parser implementation at invocation time. */
export interface ParserInvocationInput extends ParseInput {
  /** Cancellation signal supplied by the trusted gateway for remote/I/O parsers. */
  signal?: AbortSignal;
}

/** How a parse attempt ended. */
export type ParseStatus =
  /** The parser produced candidate criteria. */
  | "PARSED"
  /** The parser ran but found nothing it could express. */
  | "EMPTY"
  /** The parser failed; the caller gets a usable, empty result instead of an error. */
  | "FAILED";

/**
 * What a parser returns.
 *
 * Note what is absent, in both directions:
 *
 * - No mentor, no score, no ranking. A parser reports only what it believes the
 *   student *asked for*.
 * - No identity. A parser does not state its own name, its own version, or the
 *   request id. Those are the gateway's to assign, from the configured parser
 *   and the caller's input — otherwise a compromised or buggy parser could
 *   attribute its output to something else, or re-target it at another request.
 */
export interface ParseResult {
  status: ParseStatus;
  /**
   * Candidate criteria, in the same untrusted shape a form would produce.
   * Nothing here is trusted until the resolver and schemas have seen it. Any
   * `requestId` here is ignored and overwritten by the gateway.
   */
  candidate: RawStudentRequest;
  /**
   * Fragments the parser recognised as *meaningful but not expressible*. These
   * are carried into `additionalPreferences` so the resolver reports them as
   * unresolved rather than the parser dropping them on the floor.
   */
  unhandled: string[];
  /** Machine-readable notes about what the parser did and did not do. */
  notes: string[];
}

/**
 * Runtime schema for parser output.
 *
 * A parser may be a remote model behind an HTTP call. Its response is as
 * untrusted as the student's text, so the shape is checked rather than assumed —
 * an undefined `notes` or a string where an array belongs must become a normal
 * FAILED parse, not an exception three modules downstream.
 */
export const ParseResultSchema = z.strictObject({
  status: z.enum(["PARSED", "EMPTY", "FAILED"]),
  candidate: z.record(z.string(), z.unknown()),
  unhandled: z.array(z.string()),
  notes: z.array(z.string()),
});

/**
 * A swappable natural-language parser.
 *
 * Implementations may be rule-based, LLM-backed, or remote. The engine cannot
 * tell the difference, which is the point: swapping one for another must not
 * require touching ranking code.
 */
export interface SemanticParser {
  readonly name: string;
  readonly version: string;
  /**
   * Converts free text into candidate criteria.
   *
   * Implementations should not throw — a failure should be reported as
   * `status: "FAILED"`. Callers defend against throwing parsers anyway.
   */
  parse(input: ParserInvocationInput): ParseResult | Promise<ParseResult>;
}

/* -------------------------------------------------------------------------- */
/* PII                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Patterns for the contact details a matching request never needs.
 *
 * Matching depends on goals, constraints and preferences. It needs no email, no
 * phone number, no address. Anything sent to a third-party model should carry as
 * little as possible, so this strips the obvious identifiers before the text
 * leaves the process.
 */
const PII_PATTERNS: readonly { pattern: RegExp; replacement: string }[] = [
  { pattern: /[\w.+-]+@[\w-]+\.[\w.]+/g, replacement: "[email]" },
  // Vietnamese mobile numbers, with or without country code and separators.
  { pattern: /(?:\+?84|0)\d[\d\s.-]{7,12}\d/g, replacement: "[phone]" },
  { pattern: /\bhttps?:\/\/\S+/g, replacement: "[url]" },
  { pattern: /\b(?:zalo|facebook|fb|telegram|instagram|ig)\s*[:@]\s*\S+/gi, replacement: "[handle]" },
];

/**
 * Removes obvious contact details from text before it is sent anywhere.
 *
 * Deliberately conservative: it strips what it recognises and makes no claim to
 * catch everything. It is a floor, not a guarantee, and the real protection is
 * that matching never requires identity data in the first place.
 *
 * @param text - Raw student text.
 * @returns The text with recognised identifiers replaced by placeholders.
 */
export function redactPii(text: string): string {
  return PII_PATTERNS.reduce(
    (redacted, { pattern, replacement }) => redacted.replace(pattern, replacement),
    text,
  );
}

/**
 * Reports whether text still contains a recognised identifier.
 *
 * @param text - Text to inspect.
 */
export function containsPii(text: string): boolean {
  return PII_PATTERNS.some(({ pattern }) => new RegExp(pattern.source, pattern.flags).test(text));
}
