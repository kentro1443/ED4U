export const NOTIFICATION_TYPES = [
  "APPLICATION_STATUS",
  "APPOINTMENT_RESPONSE",
  "APPOINTMENT_ACCEPTED",
  "CHAT_CREATED",
  "ROOM_REQUEST_STATUS",
  "ROOM_CONFLICT",
  "CLUB_MEMBERSHIP",
  "CLUB_EVENT",
  "FINANCE_APPROVAL",
  "FORUM_REPLY",
  "FORUM_MENTION",
  "FORUM_MODERATION",
  "MENTOR_MATCH",
  "MENTOR_BOOKING",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationDraft {
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
}

export function notificationFor(
  type: NotificationType,
  title: string,
  body: string,
): Pick<NotificationDraft, "type" | "title" | "body"> {
  return { type, title, body };
}
