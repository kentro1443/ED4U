/**
 * A rule-based parser that needs no model, no network and no API key.
 *
 * It exists for three reasons:
 *
 * 1. **The test suite stays offline and reproducible.** Every parser fixture in
 *    this repository runs against this implementation, so the boundary is
 *    verified without anyone's API credentials.
 * 2. **The engine degrades gracefully.** If an LLM parser is unavailable, this
 *    one still turns common phrasings into criteria.
 * 3. **It documents the contract by example.** An LLM-backed parser must behave
 *    like this one at the boundary: propose, never decide.
 *
 * It is deliberately literal. It extracts what it can name with certainty and
 * hands everything else to `additionalPreferences`, where the resolver reports
 * it as unresolved. Guessing would defeat the purpose: the whole architecture
 * exists so that unsupported input is *visible* rather than absorbed.
 *
 * It reuses the Phase 2 alias tables, so "kiên nhẫn" and "patient" resolve the
 * same way here as anywhere else, and adding an alias improves both at once.
 */

import {
  aliasIndex,
  canonicalizeAvailabilitySlot,
  canonicalizePrice,
  canonicalizeSimple,
  lookupAlias,
} from "../normalization/canonicalizer.js";
import type { RawStudentRequest } from "../normalization/resolver.js";
import type { ParseInput, ParseResult, SemanticParser } from "./types.js";

/** Version of this parser's extraction rules. */
export const DETERMINISTIC_PARSER_VERSION = "deterministic-parser.v1";

/* -------------------------------------------------------------------------- */
/* Extraction helpers                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Folds text for parsing **without changing its length**.
 *
 * Every character maps to exactly one folded character, so an index into the
 * folded string is an index into the original. That 1:1 alignment is what makes
 * residual tracking exact: the parser can say precisely which characters it
 * consumed, and everything else survives verbatim.
 *
 * `foldKey` cannot be used here — it collapses runs and drops characters, so
 * indices drift and "6.0" becomes "6 0".
 */
function alignedFold(text: string): string {
  let folded = "";

  for (const char of text) {
    // Decompose one character at a time and keep only its base letter, so the
    // output stays the same length as the input.
    const base = char.normalize("NFD")[0] ?? char;
    const lower = base.toLowerCase();
    const mapped = lower === "\u0111" ? "d" : lower;
    folded += /[a-z0-9.:/-]/.test(mapped) ? mapped : " ";
  }

  // Astral characters would break the 1:1 mapping; pad back to the original
  // length so every index still lines up.
  return folded.length === text.length
    ? folded
    : folded.padEnd(text.length, " ").slice(0, text.length);
}

/**
 * Marker standing in for a consumed span.
 *
 * U+FFFC (object replacement character) rather than a control character: it is
 * a printable placeholder that student text will not contain, and it keeps two
 * unrelated residuals either side of a match from fusing into one phrase.
 */
const SPAN_SEPARATOR = "\uFFFC";

/** A half-open range of the original text that a parser rule consumed. */
type Span = readonly [start: number, end: number];

/** Collects consumed spans while extraction runs. */
class SpanRecorder {
  readonly spans: Span[] = [];

  /** Records a consumed range. */
  add(start: number, end: number): void {
    if (end > start) this.spans.push([start, end]);
  }

  /** Merges overlapping spans into a sorted, non-overlapping list. */
  merged(): Span[] {
    const sorted = [...this.spans].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged: [number, number][] = [];

    for (const [start, end] of sorted) {
      const last = merged[merged.length - 1];
      if (last !== undefined && start <= last[1]) last[1] = Math.max(last[1], end);
      else merged.push([start, end]);
    }

    return merged;
  }
}

/**
 * Returns the text left over once consumed spans are removed.
 *
 * This is the mechanism that stops unsupported content vanishing when it shares
 * a clause with something recognised. "IELTS writing with a funny mentor"
 * consumes only "IELTS" and "writing"; "with a funny mentor" comes back here and
 * is carried into `additionalPreferences`, where the resolver reports it.
 *
 * @param text - The original text.
 * @param consumed - Spans the parser confidently used.
 * @returns Residual fragments, in order, with surrounding whitespace trimmed.
 */
function residualFragments(text: string, consumed: readonly Span[]): string[] {
  // Replace consumed ranges with a separator rather than deleting them, so two
  // unrelated residuals either side of a match do not fuse into one phrase.
  let masked = "";
  let cursor = 0;

  for (const [start, end] of consumed) {
    masked += text.slice(cursor, start);
    masked += SPAN_SEPARATOR;
    cursor = end;
  }
  masked += text.slice(cursor);

  return masked
    .split(/[\uFFFC,;\n!?]+|(?<!\d)\.(?!\d)|\bvà\b|\bthì\b/gi)
    .map((fragment) => fragment.trim())
    .filter((fragment) => /[\p{L}\p{N}]/u.test(fragment));
}

/** Finds the exam the student is preparing for, if they named one. */
function extractDomain(aligned: string, spans: SpanRecorder): string | undefined {
  for (const token of ["ielts", "sat", "hsk"]) {
    const match = new RegExp(`\\b${token}\\b`).exec(aligned);
    if (match === null) continue;

    const outcome = canonicalizeSimple("domain", token);
    if (outcome.kind !== "MATCH") continue;

    // Consume every mention, not only the first.
    for (const each of aligned.matchAll(new RegExp(`\\b${token}\\b`, "g"))) {
      spans.add(each.index, each.index + each[0].length);
    }
    return outcome.canonical;
  }
  return undefined;
}

/**
 * Finds "from X to Y" score statements.
 *
 * Only patterns that state the relationship explicitly are read as a
 * current/target pair. A bare number is left alone — "IELTS 7" could be either,
 * and choosing one would invent a fact. The bare number is therefore *not*
 * consumed, so it survives as residual text and is reported as unresolved.
 */
function extractScores(
  aligned: string,
  spans: SpanRecorder,
): { current?: number; target?: number } {
  const scores: { current?: number; target?: number } = {};

  const range =
    /(\d+(?:\.\d+)?)\s*(?:[a-z]+\s+){0,2}(?:len|to|up to|->|=>|den)\s*(\d+(?:\.\d+)?)/.exec(aligned);
  if (range !== null) {
    scores.current = Number(range[1]);
    scores.target = Number(range[2]);
    spans.add(range.index, range.index + range[0].length);
    return scores;
  }

  const target = /(?:target|muc tieu|can|want|need|dat)\s*(?:duoc\s*)?(\d+(?:\.\d+)?)/.exec(aligned);
  if (target !== null) {
    scores.target = Number(target[1]);
    spans.add(target.index, target.index + target[0].length);
  }

  const current = /(?:currently|hien tai|dang o|now at|dang duoc)\s*(\d+(?:\.\d+)?)/.exec(aligned);
  if (current !== null) {
    scores.current = Number(current[1]);
    spans.add(current.index, current.index + current[0].length);
  }

  return scores;
}

/** Skill words the parser recognises, checked against the shared alias tables. */
const SKILL_TOKENS = [
  "writing", "reading", "listening", "speaking", "math", "maths",
  "viet", "doc", "nghe", "noi", "toan",
] as const;

/** Finds the skills the student singled out. */
function extractFocusSkills(aligned: string, spans: SpanRecorder): string[] {
  const found: string[] = [];

  for (const token of SKILL_TOKENS) {
    if (lookupAlias("skillSuffix", token).length === 0) continue;

    let seen = false;
    for (const match of aligned.matchAll(new RegExp(`\\b${token}\\b`, "g"))) {
      spans.add(match.index, match.index + match[0].length);
      seen = true;
    }
    // Hand the raw token to the resolver rather than resolving it here: the
    // resolver knows the domain and reports ambiguity honestly.
    if (seen && !found.includes(token)) found.push(token);
  }

  return found;
}

/** Finds budget mentions. Several distinct ones are a contradiction, not a range. */
function extractBudgets(aligned: string, spans: SpanRecorder): string[] {
  const budgets: string[] = [];

  const withUnit = /(\d[\d.]*\s*k?)\s*(?:\/|per|mot|một)?\s*(?:buoi|gio|hour|session|h)\b/g;
  for (const match of aligned.matchAll(withUnit)) {
    const raw = (match[1] ?? "").replace(/\s/g, "");
    if (canonicalizePrice(raw) === undefined) continue;
    budgets.push(raw);
    spans.add(match.index, match.index + match[0].length);
  }

  if (budgets.length === 0) {
    const labelled = /(?:budget|gia|khoang|duoi|toi da|max)\s*(\d[\d.]*k?)/g;
    for (const match of aligned.matchAll(labelled)) {
      const raw = match[1] ?? "";
      if (canonicalizePrice(raw) === undefined) continue;
      budgets.push(raw);
      spans.add(match.index, match.index + match[0].length);
    }
  }

  return [...new Set(budgets)];
}

/**
 * Weekday aliases, longest first.
 *
 * Order matters: "thu 5" (Thursday in Vietnamese) must win over the bare "thu",
 * or "thứ 5 19:00" is read as Thursday at 5 o'clock and the parser invents a
 * 5am commitment nobody made.
 */
const WEEKDAY_ALIASES = [
  "chu nhat", "thu hai", "thu ba", "thu tu", "thu nam", "thu sau", "thu bay",
  "thu 2", "thu 3", "thu 4", "thu 5", "thu 6", "thu 7",
  "wednesday", "thursday", "saturday", "tuesday", "monday", "sunday", "friday",
  "wed", "thurs", "tue", "mon", "fri", "sun", "sat", "thu",
  "t2", "t3", "t4", "t5", "t6", "t7", "cn",
].sort((a, b) => b.length - a.length);

/**
 * Weekday tokens that collide with something else in this domain.
 *
 * "sat" is also the exam; "thu" is also a Vietnamese ordinal marker. They are
 * only trusted when a real time is attached, never as a bare mention.
 */
const AMBIGUOUS_WEEKDAYS = new Set(["sat", "thu", "mon", "sun", "cn"]);

/**
 * Finds availability expressions.
 *
 * Only weekday-plus-time forms become slots and are consumed. A day with no
 * usable time is left in the residual text so the resolver rejects it
 * explicitly — turning "tối thứ 3" into 19:00 would fabricate a commitment.
 */
function extractAvailability(aligned: string, spans: SpanRecorder): string[] {
  const slots: string[] = [];

  const dayPattern = WEEKDAY_ALIASES.map((alias) => alias.replace(/ /g, "\\s+")).join("|");
  const scanner = new RegExp(
    `\\b(${dayPattern})\\b\\s*(?:luc|at|@)?\\s*(\\d{1,2}(?::\\d{2}|h\\d{2}|h)?)?`,
    "g",
  );

  for (const match of aligned.matchAll(scanner)) {
    const day = (match[1] ?? "").replace(/\s+/g, " ");
    const time = match[2];

    if (time !== undefined && canonicalizeAvailabilitySlot(`${day} ${time}`).kind === "MATCH") {
      slots.push(`${day} ${time}`);
      spans.add(match.index, match.index + match[0].length);
      continue;
    }

    // No usable time. Ambiguous bare tokens are neither consumed nor trusted:
    // "SAT math" must never become Saturday, and the text stays as residual.
    void AMBIGUOUS_WEEKDAYS;
  }

  return [...new Set(slots)];
}

/**
 * Finds teaching styles by scanning for the alias tables' own keys.
 *
 * Using the shared table rather than a private word list means an alias added
 * for the resolver improves the parser at the same time, and gives an exact span
 * to consume.
 */
function extractTeachingStyles(aligned: string, spans: SpanRecorder): string[] {
  const styles: string[] = [];
  const keys = [...aliasIndex.teachingStyle.keys()].sort((a, b) => b.length - a.length);

  for (const key of keys) {
    if (key.length < 3) continue;
    const pattern = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")}\\b`, "g");

    for (const match of aligned.matchAll(pattern)) {
      if (!styles.includes(key)) styles.push(key);
      spans.add(match.index, match.index + match[0].length);
    }
  }

  return styles;
}

/* -------------------------------------------------------------------------- */
/* Parser                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Builds the offline rule-based parser.
 *
 * Redaction is the gateway's job now, so this parser makes no attempt at it: it
 * receives whatever text the caller was given, already redacted by
 * `parseStudentRequest`.
 */
export function createDeterministicParser(): SemanticParser {
  return {
    name: "deterministic",
    version: DETERMINISTIC_PARSER_VERSION,

    parse(input: ParseInput): ParseResult {
      const notes: string[] = [];
      const text = input.text;
      const aligned = alignedFold(text);
      const spans = new SpanRecorder();

      if (aligned.trim() === "") {
        return { status: "EMPTY", candidate: {}, unhandled: [], notes: ["NO_TEXT"] };
      }

      const domain = extractDomain(aligned, spans);
      const scores = extractScores(aligned, spans);
      const focusSkills = extractFocusSkills(aligned, spans);
      const budgets = extractBudgets(aligned, spans);
      const availabilitySlots = extractAvailability(aligned, spans);
      const teachingStyles = extractTeachingStyles(aligned, spans);

      // Everything the parser did NOT confidently consume survives verbatim.
      // This is the whole safety property: unsupported, ambiguous or hostile
      // text sharing a clause with something recognised cannot disappear.
      const unhandled = residualFragments(text, spans.merged());

      if (domain === undefined) notes.push("NO_DOMAIN_FOUND");
      if (budgets.length > 1) notes.push("MULTIPLE_BUDGETS_FOUND");
      if (unhandled.length > 0) notes.push("RESIDUAL_TEXT_PRESERVED");

      const candidate: RawStudentRequest = {
        goal: {
          ...(domain === undefined ? {} : { domain }),
          ...(scores.current === undefined ? {} : { currentScore: scores.current }),
          ...(scores.target === undefined ? {} : { targetScore: scores.target }),
          focusSkills,
        },
        // Budget is proposed exactly as written; several distinct mentions are
        // handed over as several, so the resolver can call the contradiction.
        ...(budgets.length === 0 ? {} : { hardConstraints: { maxPricePerHour: budgets } }),
        availability: availabilitySlots,
        ...(teachingStyles.length === 0 ? {} : { softPreferences: { teachingStyles } }),
        additionalPreferences: unhandled,
      };

      const foundSomething =
        domain !== undefined ||
        focusSkills.length > 0 ||
        budgets.length > 0 ||
        availabilitySlots.length > 0 ||
        teachingStyles.length > 0;

      return {
        status: foundSomething ? "PARSED" : "EMPTY",
        candidate,
        unhandled,
        notes,
      };
    },
  };
}

/** The default offline parser instance. */
export const deterministicParser: SemanticParser = createDeterministicParser();
