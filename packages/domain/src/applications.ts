import { StateTransitionError, ValidationError, err, ok, type Result } from "./errors";

export const APPLICATION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "NEEDS_MORE_INFO",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "COMPLETED",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

const TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["IN_REVIEW", "CANCELLED"],
  IN_REVIEW: ["NEEDS_MORE_INFO", "APPROVED", "REJECTED"],
  NEEDS_MORE_INFO: ["SUBMITTED", "CANCELLED"],
  APPROVED: ["COMPLETED", "CANCELLED"],
  REJECTED: [],
  CANCELLED: [],
  COMPLETED: [],
};

export function canTransitionApplication(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transitionApplication(
  from: ApplicationStatus,
  to: ApplicationStatus,
): Result<ApplicationStatus, StateTransitionError> {
  if (!canTransitionApplication(from, to)) {
    return err(
      new StateTransitionError(`Không thể chuyển đơn từ ${from} sang ${to}.`, { from, to }),
    );
  }
  return ok(to);
}

export interface SubmissionVersion {
  versionNumber: number;
  fileId: string;
  submittedBy: string;
  submittedAt: Date;
}

/**
 * Reviewed files are never overwritten. A resubmit always appends a new version.
 */
export function nextSubmissionVersion(
  existing: readonly SubmissionVersion[],
  fileId: string,
  submittedBy: string,
  submittedAt: Date = new Date(),
): Result<SubmissionVersion, ValidationError> {
  if (!fileId) {
    return err(new ValidationError("Thiếu tệp PDF nộp đơn."));
  }
  const max = existing.reduce((m, v) => Math.max(m, v.versionNumber), 0);
  return ok({
    versionNumber: max + 1,
    fileId,
    submittedBy,
    submittedAt,
  });
}

export interface TransferState {
  currentTeacherId: string;
  pendingTransferTo: string | null;
}

/**
 * Teacher A remains assignee until B accepts.
 */
export function requestTransfer(
  state: TransferState,
  fromTeacherId: string,
  toTeacherId: string,
): Result<TransferState, ValidationError> {
  if (state.currentTeacherId !== fromTeacherId) {
    return err(new ValidationError("Chỉ giáo viên đang phụ trách mới được chuyển đơn."));
  }
  if (fromTeacherId === toTeacherId) {
    return err(new ValidationError("Không thể chuyển đơn cho chính mình."));
  }
  return ok({ ...state, pendingTransferTo: toTeacherId });
}

export function acceptTransfer(
  state: TransferState,
  acceptingTeacherId: string,
): Result<TransferState, ValidationError> {
  if (state.pendingTransferTo !== acceptingTeacherId) {
    return err(new ValidationError("Bạn không phải người nhận chuyển đơn."));
  }
  return ok({ currentTeacherId: acceptingTeacherId, pendingTransferTo: null });
}

export function declineTransfer(
  state: TransferState,
  decliningTeacherId: string,
): Result<TransferState, ValidationError> {
  if (state.pendingTransferTo !== decliningTeacherId) {
    return err(new ValidationError("Bạn không phải người nhận chuyển đơn."));
  }
  return ok({ ...state, pendingTransferTo: null });
}
