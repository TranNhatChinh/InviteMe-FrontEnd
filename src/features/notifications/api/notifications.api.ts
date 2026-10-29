import { z } from "zod";
import type { ApiClient } from "@/core/api/api-client";

// Kinds written by the backend (NotificationTypes). Unknown kinds are still listed with a generic text.
export const notificationTypes = [
  "RSVP_SUBMITTED",
  "RSVP_UPDATED",
  "RSVP_OVER_LIMIT",
  "RSVP_CHANGE_REQUESTED",
  "GIFT_CLAIMED",
  "GIFT_DESK_PENDING",
] as const;

// Data of RSVP kinds: guestId, guestName, decision, people, maxPeople. Gift kinds: giftId, giverName, method, amount.
export const notificationSchema = z.object({
  id: z.string(),
  weddingId: z.string(),
  weddingTitle: z.string(),
  type: z.string(),
  data: z.record(z.string(), z.unknown()).catch({}),
  createdAt: z.string(),
  readAt: z.string().nullable(),
});
export const notificationPageSchema = z.object({
  items: z.array(notificationSchema),
  unreadCount: z.number().int().nonnegative(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalCount: z.number().int().nonnegative(),
});
const readResultSchema = z.object({
  updated: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
});

export type AppNotification = z.infer<typeof notificationSchema>;
export type NotificationPage = z.infer<typeof notificationPageSchema>;

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (pageSize: number) => ["notifications", "list", pageSize] as const,
  unread: () => ["notifications", "unread"] as const,
};

export function listNotifications(api: ApiClient, pageSize = 20, signal?: AbortSignal) {
  return api.request(`/notifications?page=1&pageSize=${pageSize}`, {
    signal,
    schema: notificationPageSchema,
  });
}

export function countUnreadNotifications(api: ApiClient, signal?: AbortSignal) {
  return api.request("/notifications/unread-count", {
    signal,
    schema: z.object({ count: z.number().int().nonnegative() }),
  });
}

export function markNotificationRead(api: ApiClient, id: string) {
  return api.request(`/notifications/${encodeURIComponent(id)}/read`, {
    method: "POST",
    schema: readResultSchema,
  });
}

export function markAllNotificationsRead(api: ApiClient) {
  return api.request("/notifications/read-all", { method: "POST", schema: readResultSchema });
}
