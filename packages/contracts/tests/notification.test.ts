import { describe, expect, it } from 'vitest';
import {
  DeletePushSubscriptionResponseSchema,
  FeedItemDtoSchema,
  FeedListQuerySchema,
  FeedListResponseSchema,
  isPushEndpointHostAllowed,
  MarkAllReadResponseSchema,
  NotificationIdParamsSchema,
  NotificationPrefsDtoSchema,
  PUSH_ENDPOINT_BASE_HOST_PATTERNS,
  PushSubscriptionDtoSchema,
  PushSubscriptionIdParamsSchema,
  PutNotificationPrefsRequestSchema,
  RegisterPushSubscriptionRequestSchema,
  UnreadCountResponseSchema,
  VapidKeyResponseSchema,
} from '../src/index.js';

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID2 = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-11-26T10:00:00.000Z';

const feedItem = {
  id: UUID,
  type: 'care_link',
  title: 'Caregiver linked',
  body: 'A caregiver joined your care circle',
  createdAt: NOW,
  readAt: null,
};

const validEndpoint = 'https://fcm.googleapis.com/fcm/send/abc123';

describe('notification — feed routes', () => {
  it('FeedItemDto — closed type enum + strict shape', () => {
    expect(FeedItemDtoSchema.parse(feedItem)).toEqual(feedItem);
    for (const t of ['care_link', 'refill', 'system']) {
      expect(FeedItemDtoSchema.safeParse({ ...feedItem, type: t }).success).toBe(true);
    }
    for (const bad of ['Care_Link', 'reminder', '']) {
      expect(FeedItemDtoSchema.safeParse({ ...feedItem, type: bad }).success).toBe(false);
    }
    expect(FeedItemDtoSchema.safeParse({ ...feedItem, readAt: NOW }).success).toBe(true);
    expect(FeedItemDtoSchema.safeParse({ ...feedItem, extra: 1 }).success).toBe(false);
    expect(FeedItemDtoSchema.safeParse({ ...feedItem, id: 'x' }).success).toBe(false);
  });

  it('FeedListQuery — cursor ≤512, limit coerce int 1–50', () => {
    expect(FeedListQuerySchema.parse({})).toEqual({});
    expect(FeedListQuerySchema.parse({ cursor: 'abc', limit: '20' })).toEqual({
      cursor: 'abc',
      limit: 20,
    });
    expect(FeedListQuerySchema.safeParse({ cursor: 'x'.repeat(513) }).success).toBe(false);
    expect(FeedListQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(FeedListQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(FeedListQuerySchema.safeParse({ limit: 'abc' }).success).toBe(false);
    expect(FeedListQuerySchema.safeParse({ extra: 1 }).success).toBe(false);
  });

  it('FeedListResponse + UnreadCountResponse', () => {
    expect(FeedListResponseSchema.parse({ items: [feedItem], nextCursor: null })).toEqual({
      items: [feedItem],
      nextCursor: null,
    });
    expect(FeedListResponseSchema.parse({ items: [], nextCursor: 'cursor-token' }).nextCursor).toBe(
      'cursor-token',
    );
    expect(FeedListResponseSchema.safeParse({ items: [feedItem] }).success).toBe(false);
    expect(UnreadCountResponseSchema.parse({ unread: 3 })).toEqual({ unread: 3 });
    expect(UnreadCountResponseSchema.safeParse({ unread: -1 }).success).toBe(false);
    expect(UnreadCountResponseSchema.safeParse({ unread: 1.5 }).success).toBe(false);
  });

  it('mark-read params + mark-all response', () => {
    expect(NotificationIdParamsSchema.parse({ id: UUID })).toEqual({ id: UUID });
    expect(NotificationIdParamsSchema.safeParse({ id: 'x' }).success).toBe(false);
    expect(MarkAllReadResponseSchema.parse({ marked: 7 })).toEqual({ marked: 7 });
    expect(MarkAllReadResponseSchema.safeParse({ marked: -1 }).success).toBe(false);
  });
});

describe('notification — preferences + push routes', () => {
  it('NotificationPrefsDto + strict PUT (≥1 toggle, no extra keys)', () => {
    const prefs = { refillAlerts: true, careLinkNotifications: false };
    expect(NotificationPrefsDtoSchema.parse(prefs)).toEqual(prefs);
    expect(PutNotificationPrefsRequestSchema.parse({ refillAlerts: false })).toEqual({
      refillAlerts: false,
    });
    expect(PutNotificationPrefsRequestSchema.safeParse({}).success).toBe(false);
    expect(PutNotificationPrefsRequestSchema.safeParse({ quietHours: true }).success).toBe(false);
    expect(PutNotificationPrefsRequestSchema.safeParse({ refillAlerts: 'yes' }).success).toBe(
      false,
    );
    expect(NotificationPrefsDtoSchema.safeParse({ refillAlerts: true }).success).toBe(false);
  });

  it('VapidKeyResponse', () => {
    expect(VapidKeyResponseSchema.parse({ publicKey: 'BKx…' })).toEqual({ publicKey: 'BKx…' });
    expect(VapidKeyResponseSchema.safeParse({ publicKey: '' }).success).toBe(false);
    expect(VapidKeyResponseSchema.safeParse({}).success).toBe(false);
  });

  it('RegisterPushSubscriptionRequest — HTTPS/443/no-userinfo endpoint + keys', () => {
    const req = {
      endpoint: validEndpoint,
      keys: { p256dh: 'k'.repeat(100), auth: 'a'.repeat(50) },
    };
    expect(RegisterPushSubscriptionRequestSchema.parse(req)).toEqual(req);
    for (const bad of [
      'http://fcm.googleapis.com/x',
      'https://fcm.googleapis.com:444/x',
      'https://user:pw@fcm.googleapis.com/x',
      'not-a-url',
      `https://fcm.googleapis.com/${'x'.repeat(2050)}`,
    ]) {
      expect(
        RegisterPushSubscriptionRequestSchema.safeParse({ ...req, endpoint: bad }).success,
      ).toBe(false);
    }
    expect(
      RegisterPushSubscriptionRequestSchema.safeParse({ ...req, keys: { p256dh: 'k' } }).success,
    ).toBe(false);
    expect(
      RegisterPushSubscriptionRequestSchema.safeParse({
        ...req,
        keys: { p256dh: 'k'.repeat(513), auth: 'a' },
      }).success,
    ).toBe(false);
    expect(RegisterPushSubscriptionRequestSchema.safeParse({ ...req, extra: 1 }).success).toBe(
      false,
    );
  });

  it('push endpoint host allowlist — base patterns + env extension (LD-NOT-08)', () => {
    expect(PUSH_ENDPOINT_BASE_HOST_PATTERNS).toEqual([
      'fcm.googleapis.com',
      '*.push.apple.com',
      'updates.push.services.mozilla.com',
      '*.notify.windows.com',
    ]);
    expect(isPushEndpointHostAllowed('fcm.googleapis.com')).toBe(true);
    expect(isPushEndpointHostAllowed('web.push.apple.com')).toBe(true);
    expect(isPushEndpointHostAllowed('updates.push.services.mozilla.com')).toBe(true);
    expect(isPushEndpointHostAllowed('db5.notify.windows.com')).toBe(true);
    expect(isPushEndpointHostAllowed('evil.com')).toBe(false);
    expect(isPushEndpointHostAllowed('push.apple.com.evil.com')).toBe(false);
    expect(isPushEndpointHostAllowed('custom.push.example.com', ['*.push.example.com'])).toBe(true);
    expect(isPushEndpointHostAllowed('exact.example.com', ['exact.example.com'])).toBe(true);
  });

  it('PushSubscriptionDto + params + delete response', () => {
    const dto = { id: UUID, endpoint: validEndpoint, createdAt: NOW };
    expect(PushSubscriptionDtoSchema.parse(dto)).toEqual(dto);
    expect(PushSubscriptionIdParamsSchema.parse({ id: UUID2 })).toEqual({ id: UUID2 });
    expect(DeletePushSubscriptionResponseSchema.parse({ deleted: true })).toEqual({
      deleted: true,
    });
    expect(DeletePushSubscriptionResponseSchema.safeParse({ deleted: false }).success).toBe(false);
  });
});
