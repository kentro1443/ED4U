export interface AuditEventDraft {
  tenantId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  requestId: string;
  timestamp: Date;
}

export function audit(
  input: Omit<AuditEventDraft, "timestamp"> & { timestamp?: Date },
): AuditEventDraft {
  return { ...input, timestamp: input.timestamp ?? new Date() };
}
