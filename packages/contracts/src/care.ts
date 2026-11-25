import { z } from 'zod';
import { emailSchema, isoDateTimeSchema, opaqueTokenSchema, uuidSchema } from './primitives.js';

const inviteDirection = z.enum(['sent', 'received']);
const linkDirection = z.enum(['as-patient', 'as-caregiver']);

// POST /v1/care/links/invites (201)
export const CreateInviteRequestSchema = z.strictObject({ caregiverEmail: emailSchema });
export const CreateInviteResponseSchema = z.strictObject({
  inviteId: uuidSchema,
  caregiverEmail: emailSchema,
  expiresAt: isoDateTimeSchema,
  status: z.literal('pending'),
});
export type CreateInviteRequest = z.infer<typeof CreateInviteRequestSchema>;
export type CreateInviteResponse = z.infer<typeof CreateInviteResponseSchema>;

// GET /v1/care/invites/{token} — public locator route
export const InviteTokenParamsSchema = z.strictObject({ token: opaqueTokenSchema });
export const InvitePreviewDtoSchema = z.strictObject({
  patientDisplayName: z.string(),
  expiresAt: isoDateTimeSchema,
});
export type InviteTokenParams = z.infer<typeof InviteTokenParamsSchema>;
export type InvitePreviewDto = z.infer<typeof InvitePreviewDtoSchema>;

// POST /v1/care/invites/{token}/accept (201) · decline (200) — token in path
export const AcceptInviteResponseSchema = z.strictObject({
  linkId: uuidSchema,
  patientId: uuidSchema,
  caregiverId: uuidSchema,
  createdAt: isoDateTimeSchema,
});
export const DeclineInviteResponseSchema = z.strictObject({
  inviteId: uuidSchema,
  status: z.literal('declined'),
});
export type AcceptInviteResponse = z.infer<typeof AcceptInviteResponseSchema>;
export type DeclineInviteResponse = z.infer<typeof DeclineInviteResponseSchema>;

// POST /v1/care/invites/{id}/resend (200) · cancel (200)
export const InviteIdParamsSchema = z.strictObject({ id: uuidSchema });
export const ResendInviteResponseSchema = z.strictObject({
  inviteId: uuidSchema,
  expiresAt: isoDateTimeSchema,
});
export const CancelInviteResponseSchema = z.strictObject({
  inviteId: uuidSchema,
  status: z.literal('cancelled'),
});
export type InviteIdParams = z.infer<typeof InviteIdParamsSchema>;
export type ResendInviteResponse = z.infer<typeof ResendInviteResponseSchema>;
export type CancelInviteResponse = z.infer<typeof CancelInviteResponseSchema>;

// GET /v1/care/invites (200) — pending invites, caller-scoped
export const InviteListItemSchema = z.strictObject({
  inviteId: uuidSchema,
  direction: inviteDirection,
  counterpartyEmail: emailSchema.optional(),
  counterpartyDisplayName: z.string().optional(),
  expiresAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
});
export const InviteListResponseSchema = z.strictObject({ invites: z.array(InviteListItemSchema) });
export type InviteListItem = z.infer<typeof InviteListItemSchema>;
export type InviteListResponse = z.infer<typeof InviteListResponseSchema>;

// GET /v1/care/links (200) · POST /v1/care/links/{id}/end (200)
export const LinkListItemSchema = z.strictObject({
  linkId: uuidSchema,
  direction: linkDirection,
  counterpart: z.strictObject({ userId: uuidSchema, displayName: z.string() }),
  createdAt: isoDateTimeSchema,
});
export const LinkListResponseSchema = z.strictObject({ links: z.array(LinkListItemSchema) });
export const LinkIdParamsSchema = z.strictObject({ id: uuidSchema });
export const EndLinkResponseSchema = z.strictObject({
  linkId: uuidSchema,
  status: z.literal('ended'),
  endedAt: isoDateTimeSchema,
});
export type LinkListItem = z.infer<typeof LinkListItemSchema>;
export type LinkListResponse = z.infer<typeof LinkListResponseSchema>;
export type LinkIdParams = z.infer<typeof LinkIdParamsSchema>;
export type EndLinkResponse = z.infer<typeof EndLinkResponseSchema>;
