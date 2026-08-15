export class DomainError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    httpStatus = 400,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export class ForbiddenError extends DomainError {
  constructor(
    message = "Không có quyền thực hiện thao tác này.",
    details: Record<string, unknown> = {},
  ) {
    super("FORBIDDEN", message, 403, details);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "Không tìm thấy dữ liệu.", details: Record<string, unknown> = {}) {
    super("NOT_FOUND", message, 404, details);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends DomainError {
  constructor(message = "Xung đột dữ liệu.", details: Record<string, unknown> = {}) {
    super("CONFLICT", message, 409, details);
    this.name = "ConflictError";
  }
}

export class ValidationError extends DomainError {
  constructor(message = "Dữ liệu không hợp lệ.", details: Record<string, unknown> = {}) {
    super("VALIDATION", message, 422, details);
    this.name = "ValidationError";
  }
}

export class StateTransitionError extends DomainError {
  constructor(message = "Không thể chuyển trạng thái.", details: Record<string, unknown> = {}) {
    super("STATE_TRANSITION", message, 409, details);
    this.name = "StateTransitionError";
  }
}

export type Result<T, E = DomainError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E extends DomainError>(error: E): Result<never, E> {
  return { ok: false, error };
}
