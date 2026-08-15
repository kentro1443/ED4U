/**
 * The trusted gateway: the one door natural language may enter through.
 *
 * A parser is untrusted code — quite possibly a language model behind an HTTP
 * call. This module is where that distrust is enforced, so no individual parser
 * implementation has to be relied on to police itself:
 *
 * - **Identity is the caller's.** `requestId` is overwritten from the input, and
 *   parser name/version come from the configured {@link SemanticParser} object.
 *   A parser cannot re-target its output at another request or claim to be a
 *   different parser, because it never gets to state either.
 * - **Output is validated.** The returned shape is checked at runtime; anything
 *   malformed becomes a normal `FAILED` result rather than leaking `undefined`
 *   into the pipeline.
 * - **PII is redacted here.** Before *any* parser sees the text, not inside the
 *   parsers, so a future remote parser cannot receive an email address because
 *   someone forgot to redact in its implementation.
 * - **Failure is bounded.** A parser that throws, rejects, or never settles
 *   produces a `FAILED` result within a timeout; the deterministic engine is
 *   untouched either way.
 *
 * Everything that survives all of that is still only a *candidate*: it goes
 * through the unchanged Phase 2 resolver and Phase 1 schemas, exactly like a web
 * form's output.
 */

import { resolveStudentRequest } from "../normalization/resolver.js";
import type { RawStudentRequest, ResolvedRequest } from "../normalization/resolver.js";
import { ParseResultSchema, redactPii } from "./types.js";
import type { ParseInput, ParseStatus, SemanticParser } from "./types.js";

/** Default ceiling on how long a parser may take. */
export const DEFAULT_PARSER_TIMEOUT_MS = 5_000;

/** Thrown when the synchronous API is handed an asynchronous parser. */
export class AsyncParserError extends TypeError {}

/** How a parse was carried out, as recorded by the gateway. */
export interface ParserTrace {
  /** Taken from the configured parser object, never from its return value. */
  name: string;
  version: string;
  status: ParseStatus;
  notes: string[];
  /** Fragments the parser recognised but could not express. */
  unhandled: string[];
  /** Whether the gateway redacted contact details before the parser ran. */
  piiRedacted: boolean;
  /** Set when the parser threw, rejected, timed out, or returned nonsense. */
  error?: string;
}

/** What the caller gets back. */
export interface ParsedRequestResult extends ResolvedRequest {
  parser: ParserTrace;
  /** Exactly what the parser proposed, before the engine judged any of it. */
  candidate: RawStudentRequest;
}

/** Options for the gateway. */
export interface ParseOptions {
  /**
   * Redact recognised contact details before the parser sees the text.
   *
   * Defaults to `true` and should stay that way for anything remote. The opt-out
   * exists only for a trusted in-process parser where the caller has a concrete
   * reason to keep the original text.
   */
  redactPii?: boolean;
  /** Milliseconds a parser may take before it is treated as failed. */
  timeoutMs?: number;
  /** Cancellation hook passed through to parsers that support it. */
  signal?: AbortSignal;
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                  */
/* -------------------------------------------------------------------------- */

/** A normalised, validated parser outcome plus any gateway-level error. */
interface Outcome {
  status: ParseStatus;
  candidate: RawStudentRequest;
  unhandled: string[];
  notes: string[];
  error?: string;
}

/** The outcome used whenever a parser cannot be trusted or did not deliver. */
function failure(input: ParseInput, error: string): Outcome {
  return {
    status: "FAILED",
    // The student's text is preserved so nothing they wrote is lost to a
    // provider outage, and identity stays the caller's even on the failure path.
    candidate: { requestId: input.requestId, additionalPreferences: [input.text] },
    unhandled: [input.text],
    notes: ["PARSER_FAILED"],
    error,
  };
}

/**
 * Validates a parser's return value and strips anything it must not control.
 *
 * @returns A trustworthy outcome, or a failure describing what was wrong.
 */
function normalise(raw: unknown, input: ParseInput): Outcome {
  const parsed = ParseResultSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return failure(input, `Parser returned a malformed result — ${detail}`);
  }

  // Identity is not the parser's to assign. Whatever it put in `requestId` is
  // discarded and replaced with the caller's, so a hostile parser cannot
  // re-target its output at somebody else's request.
  const candidate: RawStudentRequest = {
    ...(parsed.data.candidate as RawStudentRequest),
    requestId: input.requestId,
  };

  return {
    status: parsed.data.status,
    candidate,
    unhandled: parsed.data.unhandled,
    notes: parsed.data.notes,
  };
}

/** Assembles the final result from a validated outcome. */
function assemble(
  outcome: Outcome,
  parser: SemanticParser,
  piiRedacted: boolean,
): ParsedRequestResult {
  return {
    ...resolveStudentRequest(outcome.candidate),
    candidate: outcome.candidate,
    parser: {
      // Read off the configured object, never off the returned payload.
      name: parser.name,
      version: parser.version,
      status: outcome.status,
      notes: outcome.notes,
      unhandled: outcome.unhandled,
      piiRedacted,
      ...(outcome.error === undefined ? {} : { error: outcome.error }),
    },
  };
}

/** Prepares the input the parser will actually receive. */
function prepare(input: ParseInput, options: ParseOptions): { input: ParseInput; redacted: boolean } {
  const shouldRedact = options.redactPii ?? true;
  if (!shouldRedact) return { input, redacted: false };

  const text = redactPii(input.text);
  return { input: { ...input, text }, redacted: text !== input.text };
}

/** Races a promise against a timeout, without leaving a dangling timer. */
async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          onTimeout?.();
          reject(new Error(`Parser exceeded ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Parses natural language into a canonical request, via the normal pipeline.
 *
 * @param input - The student's text and the caller-supplied request id.
 * @param parser - Any {@link SemanticParser}; swapping it changes nothing else.
 * @param options - Redaction, timeout and cancellation.
 * @returns The resolution report, the canonical request (or `null`), and a trace
 *   of what the parser contributed. Never rejects because of a parser.
 */
export async function parseStudentRequest(
  input: ParseInput,
  parser: SemanticParser,
  options: ParseOptions = {},
): Promise<ParsedRequestResult> {
  const prepared = prepare(input, options);
  const timeoutMs = options.timeoutMs ?? DEFAULT_PARSER_TIMEOUT_MS;

  // Always give async parsers a gateway-owned signal. External cancellation is
  // forwarded into it, and a timeout aborts it before the gateway returns
  // FAILED, so a cooperative HTTP/provider implementation can stop real work.
  const controller = new AbortController();
  const forwardExternalAbort = (): void => controller.abort(options.signal?.reason);
  if (options.signal?.aborted === true) {
    forwardExternalAbort();
  } else {
    options.signal?.addEventListener("abort", forwardExternalAbort, { once: true });
  }

  let outcome: Outcome;
  try {
    const invocation = Promise.resolve(
      parser.parse({ ...prepared.input, signal: controller.signal }),
    );
    outcome = normalise(
      await withTimeout(invocation, timeoutMs, () =>
        controller.abort(new Error(`Parser exceeded ${timeoutMs}ms`)),
      ),
      prepared.input,
    );
  } catch (error) {
    // Throw, rejection, timeout: all the same to the engine.
    outcome = failure(prepared.input, error instanceof Error ? error.message : String(error));
  } finally {
    options.signal?.removeEventListener("abort", forwardExternalAbort);
  }

  return assemble(outcome, parser, prepared.redacted);
}

/**
 * Synchronous variant, for parsers that do no I/O.
 *
 * @param input - The student's text and request id.
 * @param parser - A parser whose `parse` returns synchronously.
 * @param options - Redaction options; `timeoutMs` does not apply.
 * @throws {AsyncParserError} When the parser is asynchronous. Only this
 *   gateway-owned error escapes — a parser that throws a `TypeError` of its own
 *   degrades to `FAILED` like any other parser fault.
 */
export function parseStudentRequestSync(
  input: ParseInput,
  parser: SemanticParser,
  options: ParseOptions = {},
): ParsedRequestResult {
  const prepared = prepare(input, options);

  let outcome: Outcome;
  try {
    const raw = parser.parse({
      ...prepared.input,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (raw instanceof Promise) {
      // Swallow the rejection so an async parser handed to the sync API cannot
      // surface later as an unhandled rejection.
      void raw.catch(() => undefined);
      throw new AsyncParserError(
        `Parser "${parser.name}" is asynchronous; use parseStudentRequest instead`,
      );
    }
    outcome = normalise(raw, prepared.input);
  } catch (error) {
    if (error instanceof AsyncParserError) throw error;
    outcome = failure(prepared.input, error instanceof Error ? error.message : String(error));
  }

  return assemble(outcome, parser, prepared.redacted);
}
