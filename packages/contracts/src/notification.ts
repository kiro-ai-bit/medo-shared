import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './primitives.js';

const feedItemTypeSchema = z.enum(['care_link', 'refill', 'system']);

// GET /v1/notifications?cursor=&limit= (200) — LD-NOT-04 keyset pagination
export const FeedListQuerySchema = z.strictObject({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
export const FeedItemDtoSchema = z.strictObject({
  id: uuidSchema,
  type: feedItemTypeSchema,
  title: z.string(),
  body: z.string(),
  createdAt: isoDateTimeSchema,
  readAt: isoDateTimeSchema.nullable(),
});
export const FeedListResponseSchema = z.strictObject({
  items: z.array(FeedItemDtoSchema),
  nextCursor: z.string().nullable(),
});
export type FeedListQuery = z.infer<typeof FeedListQuerySchema>;
export type FeedItemDto = z.infer<typeof FeedItemDtoSchema>;
export type FeedListResponse = z.infer<typeof FeedListResponseSchema>;

// GET /v1/notifications/unread-count (200)
export const UnreadCountResponseSchema = z.strictObject({
  unread: z.number().int().min(0),
});
export type UnreadCountResponse = z.infer<typeof UnreadCountResponseSchema>;

// POST /v1/notifications/{id}/read (200 → FeedItemDto) · POST /v1/notifications/read-all (200)
export const NotificationIdParamsSchema = z.strictObject({ id: uuidSchema });
export const MarkAllReadResponseSchema = z.strictObject({
  marked: z.number().int().min(0),
});
export type NotificationIdParams = z.infer<typeof NotificationIdParamsSchema>;
export type MarkAllReadResponse = z.infer<typeof MarkAllReadResponseSchema>;

// GET/PUT /v1/notification-preferences — LD-NOT-06 two toggles, default ON
export const NotificationPrefsDtoSchema = z.strictObject({
  refillAlerts: z.boolean(),
  careLinkNotifications: z.boolean(),
});
export const PutNotificationPrefsRequestSchema = z
  .strictObject({
    refillAlerts: z.boolean().optional(),
    careLinkNotifications: z.boolean().optional(),
  })
  .refine((v) => v.refillAlerts !== undefined || v.careLinkNotifications !== undefined, {
    message: 'at least one toggle required',
  });
export type NotificationPrefsDto = z.infer<typeof NotificationPrefsDtoSchema>;
export type PutNotificationPrefsRequest = z.infer<typeof PutNotificationPrefsRequestSchema>;

// GET /v1/push/vapid-key (200) — public route
export const VapidKeyResponseSchema = z.strictObject({
  publicKey: z.string().min(1),
});
export type VapidKeyResponse = z.infer<typeof VapidKeyResponseSchema>;

// LD-NOT-08: base push host patterns; service extends via PUSH_ENDPOINT_ALLOWLIST env.
// Host membership is enforced in Core (registerSubscription/sendPush) via
// isPushEndpointHostAllowed — env extension cannot live in a static schema.
export const PUSH_ENDPOINT_BASE_HOST_PATTERNS = [
  'fcm.googleapis.com',
  '*.push.apple.com',
  'updates.push.services.mozilla.com',
  '*.notify.windows.com',
] as const;

export function isPushEndpointHostAllowed(
  host: string,
  extraAllowlist: readonly string[] = [],
): boolean {
  return [...PUSH_ENDPOINT_BASE_HOST_PATTERNS, ...extraAllowlist].some((p) =>
    p.startsWith('*.') ? host.endsWith(p.slice(1)) : host === p,
  );
}

// POST /v1/push-subscriptions (201 → PushSubscriptionDto) · DELETE /v1/push-subscriptions/{id} (200)
const pushEndpointSchema = z
  .string()
  .max(2048)
  .refine(
    (v) => {
      try {
        const u = new URL(v);
        return (
          u.protocol === 'https:' &&
          u.port === '' &&
          u.username === '' &&
          u.password === '' &&
          u.hostname.length > 0
        );
      } catch {
        return false;
      }
    },
    { message: 'endpoint must be an HTTPS URL on port 443 without userinfo' },
  );

export const RegisterPushSubscriptionRequestSchema = z.strictObject({
  endpoint: pushEndpointSchema,
  keys: z.strictObject({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});
export const PushSubscriptionDtoSchema = z.strictObject({
  id: uuidSchema,
  endpoint: pushEndpointSchema,
  createdAt: isoDateTimeSchema,
});
export const PushSubscriptionIdParamsSchema = z.strictObject({ id: uuidSchema });
export const DeletePushSubscriptionResponseSchema = z.strictObject({
  deleted: z.literal(true),
});
export type RegisterPushSubscriptionRequest = z.infer<typeof RegisterPushSubscriptionRequestSchema>;
export type PushSubscriptionDto = z.infer<typeof PushSubscriptionDtoSchema>;
export type PushSubscriptionIdParams = z.infer<typeof PushSubscriptionIdParamsSchema>;
export type DeletePushSubscriptionResponse = z.infer<typeof DeletePushSubscriptionResponseSchema>;
