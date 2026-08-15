export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export interface ApprovalRecord {
  id: string;
  tenantId: string;
  subjectType: string;
  subjectId: string;
  status: ApprovalStatus;
  requestedBy: string;
  requestedAt: Date;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  reason: string | null;
}

export function createApproval(input: {
  id: string;
  tenantId: string;
  subjectType: string;
  subjectId: string;
  requestedBy: string;
  requestedAt?: Date;
}): ApprovalRecord {
  return {
    ...input,
    status: "PENDING",
    requestedAt: input.requestedAt ?? new Date(),
    resolvedBy: null,
    resolvedAt: null,
    reason: null,
  };
}

export function resolveApproval(
  approval: ApprovalRecord,
  decision: "APPROVED" | "REJECTED",
  resolvedBy: string,
  reason: string | null,
  resolvedAt: Date = new Date(),
): ApprovalRecord {
  return {
    ...approval,
    status: decision,
    resolvedBy,
    resolvedAt,
    reason,
  };
}
