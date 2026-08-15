/**
 * Deterministic canonicalizer: raw text in, canonical ontology value out.
 *
 * V1 is **exact-alias only**. There is no fuzzy matching, no edit distance and
 * no LLM. The only flexibility is a documented text folding step, so that
 * `"Kiên Nhẫn"`, `"kien nhan"` and `"KIEN  NHAN"` are the *same key* rather
 * than three entries. That keeps the mapping a table lookup: auditable,
 * reproducible, and reviewable by a human who does not read code.
 *
 * Because a folded key can legitimately be claimed by two canonical values
 * (`"writing"` is both `IELTS.WRITING` and `HSK.WRITING`), lookups return a
 * *set* of candidates. Callers decide whether context resolves the ambiguity.
 */

import aliasesJson from "../../config/aliases.v1.json" with { type: "json" };
import ontologyJson from "../../config/ontology.v1.json" with { type: "json" };
import { AVAILABILITY_SLOT_PATTERN } from "../schemas/validation.js";
import type { Domain } from "../schemas/validation.js";

/** The loaded, versioned ontology. */
export const ontology = ontologyJson;

/** The loaded, versioned alias tables. */
export const aliases = aliasesJson;

/** Version string of the ontology in force, e.g. `"ontology.v1"`. */
export const ONTOLOGY_VERSION: string = ontologyJson.version;

/** Version string of the alias tables in force, e.g. `"aliases.v1"`. */
export const ALIASES_VERSION: string = aliasesJson.version;

/** Alias categories that can be looked up directly. */
export const ALIAS_CATEGORIES = [
  "domain",
  "skill",
  "skillSuffix",
  "teachingStyle",
  "language",
  "gender",
  "weekday",
  "credentialField",
] as const;

/** A category of the alias tables. */
export type AliasCategory = (typeof ALIAS_CATEGORIES)[number];

/* -------------------------------------------------------------------------- */
/* Text folding                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Folds raw text into a lookup key.
 *
 * The steps, in order and all locale-independent:
 * 1. Unicode NFD decomposition, then removal of combining marks — so `"ê"`
 *    becomes `"e"`. Vietnamese `đ`/`Đ` has no combining form and is mapped
 *    explicitly.
 * 2. Lowercase.
 * 3. Separators (`_`, `-`, `/`, `,`, `.`, and whitespace) collapse to a single
 *    space; `:` is preserved because time strings need it.
 * 4. Any other punctuation is dropped.
 * 5. Trim.
 *
 * @param raw - Arbitrary user or adapter text.
 * @returns The folded lookup key; `""` for blank input.
 */
export function foldKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0111\u0110]/g, "d")
    .toLowerCase()
    .replace(/[_\-/,.\s]+/g, " ")
    .replace(/[^a-z0-9: ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Alias index                                                                */
/* -------------------------------------------------------------------------- */

/** Folded-key → sorted canonical candidates, per alias category. */
export type AliasIndex = Readonly<Record<AliasCategory, ReadonlyMap<string, readonly string[]>>>;

/**
 * Builds the folded lookup index from the alias tables.
 *
 * Two alias entries that fold to the same key are *not* an error: they become
 * multiple candidates for that key, which surfaces downstream as `AMBIGUOUS`
 * rather than as a silent first-wins choice. Candidates are sorted so the
 * output is stable across JSON key ordering.
 */
function buildAliasIndex(): AliasIndex {
  const index = {} as Record<AliasCategory, Map<string, string[]>>;

  for (const category of ALIAS_CATEGORIES) {
    const table = aliasesJson[category] as Record<string, string>;
    const map = new Map<string, string[]>();

    for (const [alias, canonical] of Object.entries(table)) {
      const key = foldKey(alias);
      if (key === "") continue;
      const existing = map.get(key);
      if (existing === undefined) map.set(key, [canonical]);
      else if (!existing.includes(canonical)) existing.push(canonical);
    }

    for (const candidates of map.values()) candidates.sort();
    index[category] = map;
  }

  // Every canonical skill must be reachable by its own name, so callers can
  // pass already-canonical values through the same path as raw text.
  for (const skills of Object.values(ontologyJson.skills)) {
    for (const skill of skills) {
      const key = foldKey(skill);
      if (!index.skill.has(key)) index.skill.set(key, [skill]);
    }
  }

  return index;
}

/** The alias index built once at module load; no I/O happens at match time. */
export const aliasIndex: AliasIndex = buildAliasIndex();

/**
 * Looks up canonical candidates for a raw value in one alias category.
 *
 * @param category - Alias category to search.
 * @param raw - Raw text as the student or adapter wrote it.
 * @returns Sorted canonical candidates; empty when the value is unknown.
 */
export function lookupAlias(category: AliasCategory, raw: string): readonly string[] {
  return aliasIndex[category].get(foldKey(raw)) ?? [];
}

/* -------------------------------------------------------------------------- */
/* Ontology queries                                                           */
/* -------------------------------------------------------------------------- */

/** Canonical skills grouped by domain, as declared by the ontology. */
const SKILLS_BY_DOMAIN = ontologyJson.skills as Record<Domain, readonly string[]>;

/**
 * Reports whether a canonical skill exists in the ontology for a domain.
 *
 * @param domain - Domain to check.
 * @param skill - Fully qualified canonical skill.
 */
export function ontologyHasSkill(domain: Domain, skill: string): boolean {
  return SKILLS_BY_DOMAIN[domain].includes(skill);
}

/**
 * Finds every domain in which a bare skill suffix exists.
 *
 * @param suffix - Domain-relative suffix such as `"WRITING"`.
 * @returns Fully qualified canonical skills, sorted.
 */
export function skillsForSuffix(suffix: string): string[] {
  return (Object.keys(SKILLS_BY_DOMAIN) as Domain[])
    .filter((domain) => ontologyHasSkill(domain, `${domain}.${suffix}`))
    .map((domain) => `${domain}.${suffix}`)
    .sort();
}

/* -------------------------------------------------------------------------- */
/* Skill canonicalization                                                     */
/* -------------------------------------------------------------------------- */

/** Outcome of canonicalizing a single value. */
export type CanonicalizeOutcome =
  /** Exactly one canonical value applies. */
  | { kind: "MATCH"; canonical: string }
  /** Several canonical values apply and nothing disambiguates them. */
  | { kind: "AMBIGUOUS"; candidates: string[] }
  /** The value is not in the alias tables. */
  | { kind: "UNKNOWN" }
  /** The value is known but not valid in the supplied domain. */
  | { kind: "NOT_IN_DOMAIN"; candidates: string[] };

/**
 * Canonicalizes a skill, optionally using the request's domain as context.
 *
 * Resolution order:
 * 1. Fully qualified aliases (`"ielts writing"`, `"IELTS.WRITING"`).
 * 2. Bare suffixes (`"writing"`, `"viết"`), qualified by `domain` when known.
 *
 * With a known domain, `"writing"` resolves to that domain's writing skill.
 * Without one it stays `AMBIGUOUS` whenever more than one domain offers the
 * skill — the engine must never guess which exam the student meant.
 *
 * @param raw - Raw skill text.
 * @param domain - Goal domain, when it has itself been resolved.
 */
export function canonicalizeSkill(raw: string, domain?: Domain): CanonicalizeOutcome {
  const qualified = lookupAlias("skill", raw);
  if (qualified.length === 1) {
    const canonical = qualified[0] as string;
    if (domain !== undefined && !ontologyHasSkill(domain, canonical)) {
      return { kind: "NOT_IN_DOMAIN", candidates: [canonical] };
    }
    return { kind: "MATCH", canonical };
  }
  if (qualified.length > 1) return { kind: "AMBIGUOUS", candidates: [...qualified] };

  const suffixes = lookupAlias("skillSuffix", raw);
  if (suffixes.length === 0) return { kind: "UNKNOWN" };

  const candidates = suffixes.flatMap((suffix) => skillsForSuffix(suffix)).sort();
  if (candidates.length === 0) return { kind: "UNKNOWN" };

  if (domain !== undefined) {
    const inDomain = candidates.filter((skill) => ontologyHasSkill(domain, skill));
    if (inDomain.length === 1) return { kind: "MATCH", canonical: inDomain[0] as string };
    if (inDomain.length === 0) return { kind: "NOT_IN_DOMAIN", candidates };
    return { kind: "AMBIGUOUS", candidates: inDomain };
  }

  return candidates.length === 1
    ? { kind: "MATCH", canonical: candidates[0] as string }
    : { kind: "AMBIGUOUS", candidates };
}

/**
 * Canonicalizes a value against a simple closed vocabulary.
 *
 * @param category - Alias category (`teachingStyle`, `language`, `gender`, `domain`).
 * @param raw - Raw text.
 */
export function canonicalizeSimple(
  category: Extract<AliasCategory, "domain" | "teachingStyle" | "language" | "gender">,
  raw: string,
): CanonicalizeOutcome {
  const candidates = lookupAlias(category, raw);
  if (candidates.length === 0) return { kind: "UNKNOWN" };
  if (candidates.length === 1) return { kind: "MATCH", canonical: candidates[0] as string };
  return { kind: "AMBIGUOUS", candidates: [...candidates] };
}

/* -------------------------------------------------------------------------- */
/* Availability canonicalization                                              */
/* -------------------------------------------------------------------------- */

/** Why an availability string could not become a canonical slot. */
export type SlotOutcome =
  | { kind: "MATCH"; canonical: string }
  | { kind: "UNKNOWN" }
  /** Parsed as a real time, but not on the hour or half hour. */
  | { kind: "BAD_GRANULARITY" };

/** Time formats accepted by {@link canonicalizeAvailabilitySlot}. */
const TIME_PATTERNS: readonly RegExp[] = [
  /^(\d{1,2}):(\d{2})$/, // 19:00
  /^(\d{1,2})h(\d{2})$/, // 19h30
  /^(\d{1,2})h$/, // 19h
  /^(\d{1,2})(\d{2})$/, // 1930, and the folded canonical form "tue 19 00"
  /^(\d{1,2})$/, // 19
];

/**
 * Parses a time token into `[hour, minute]`.
 *
 * @param token - Folded time token.
 * @returns The parsed pair, or `undefined` when the token is not a time.
 */
function parseTime(token: string): [number, number] | undefined {
  for (const pattern of TIME_PATTERNS) {
    const match = pattern.exec(token);
    if (match === null) continue;
    const hour = Number(match[1]);
    const minute = match[2] === undefined ? 0 : Number(match[2]);
    if (hour > 23 || minute > 59) return undefined;
    return [hour, minute];
  }
  return undefined;
}

/**
 * Canonicalizes a weekly availability expression into a `WEEKDAY_HH_MM` slot.
 *
 * Accepts the canonical form itself plus `"<weekday alias> <time>"` in a small
 * set of written time formats (`19:00`, `19h30`, `19h`, `19`). Deliberately
 * **not** accepted: vague expressions such as `"tối"` / `"evening"`. Mapping
 * those to a concrete hour would be the engine inventing a preference the
 * student never stated; the Phase 8 parser may propose a slot, but it will be
 * validated through this same function.
 *
 * @param raw - Raw availability text.
 */
export function canonicalizeAvailabilitySlot(raw: string): SlotOutcome {
  const trimmed = raw.trim();
  if (AVAILABILITY_SLOT_PATTERN.test(trimmed)) return { kind: "MATCH", canonical: trimmed };

  const folded = foldKey(raw);
  if (folded === "") return { kind: "UNKNOWN" };

  const tokens = folded.split(" ");
  // The time is the last token; everything before it names the weekday.
  for (let split = tokens.length - 1; split >= 1; split--) {
    const time = parseTime(tokens.slice(split).join(""));
    if (time === undefined) continue;

    const weekdays = aliasIndex.weekday.get(tokens.slice(0, split).join(" "));
    if (weekdays === undefined || weekdays.length !== 1) continue;

    const [hour, minute] = time;
    if (minute !== 0 && minute !== 30) return { kind: "BAD_GRANULARITY" };

    const hh = String(hour).padStart(2, "0");
    const mm = String(minute).padStart(2, "0");
    return { kind: "MATCH", canonical: `${weekdays[0] as string}_${hh}_${mm}` };
  }

  return { kind: "UNKNOWN" };
}

/* -------------------------------------------------------------------------- */
/* Price canonicalization                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Canonicalizes a price into a non-negative integer number of VND.
 *
 * Accepts a number, or a digit string with grouping separators and an optional
 * `k` suffix (`"200k"` → `200000`). Anything richer — ranges, `"khoảng 200k"`,
 * currency words — is rejected rather than guessed at; extracting a number from
 * a sentence is the Phase 8 parser's job, and its output comes back through
 * here for validation.
 *
 * @param raw - Raw price value.
 * @returns The VND amount, or `undefined` when it cannot be canonicalized.
 */
export function canonicalizePrice(raw: unknown): number | undefined {
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw >= 0 ? raw : undefined;
  }
  if (typeof raw !== "string") return undefined;

  const folded = foldKey(raw).replace(/ /g, "");
  const match = /^(\d+)(k?)$/.exec(folded);
  if (match === null) return undefined;

  const digits = Number(match[1]);
  if (!Number.isSafeInteger(digits)) return undefined;
  return match[2] === "k" ? digits * 1000 : digits;
}
