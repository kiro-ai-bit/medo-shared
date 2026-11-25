import { z } from 'zod';
import {
  emailSchema,
  ianaTimezoneSchema,
  isoDateTimeSchema,
  opaqueTokenSchema,
  passwordSchema,
  roleSchema,
  uuidSchema,
} from './primitives.js';

// POST /v1/auth/signup (201)
export const SignupRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  email: emailSchema,
  password: passwordSchema,
  role: roleSchema,
});
export const SignupResponseSchema = z.strictObject({
  userId: uuidSchema,
  email: emailSchema,
  role: roleSchema,
});
export type SignupRequest = z.infer<typeof SignupRequestSchema>;
export type SignupResponse = z.infer<typeof SignupResponseSchema>;

// POST /v1/auth/login (200) — refresh shares the same response shape
const sessionResponseShape = {
  userId: uuidSchema,
  accessToken: z.string().min(1),
  expiresAt: isoDateTimeSchema,
};
export const LoginRequestSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export const LoginResponseSchema = z.strictObject(sessionResponseShape);
export const RefreshResponseSchema = z.strictObject(sessionResponseShape);
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

// POST /v1/auth/forgot-password (202)
export const ForgotPasswordRequestSchema = z.strictObject({ email: emailSchema });
export const ForgotPasswordResponseSchema = z.strictObject({ accepted: z.literal(true) });
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;
export type ForgotPasswordResponse = z.infer<typeof ForgotPasswordResponseSchema>;

// POST /v1/auth/reset-password (204 — no response body)
export const ResetPasswordRequestSchema = z.strictObject({
  token: opaqueTokenSchema,
  password: passwordSchema,
});
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

// POST /v1/auth/verify-email (204 — no response body)
export const VerifyEmailRequestSchema = z.strictObject({ token: opaqueTokenSchema });
export type VerifyEmailRequest = z.infer<typeof VerifyEmailRequestSchema>;

// POST /v1/auth/resend-verification (202)
export const ResendVerificationRequestSchema = z.strictObject({ email: emailSchema });
export const ResendVerificationResponseSchema = z.strictObject({ accepted: z.literal(true) });
export type ResendVerificationRequest = z.infer<typeof ResendVerificationRequestSchema>;
export type ResendVerificationResponse = z.infer<typeof ResendVerificationResponseSchema>;

// GET /v1/me + PATCH /v1/me (200)
export const MeDtoSchema = z.strictObject({
  displayName: z.string(),
  timezone: ianaTimezoneSchema,
  role: roleSchema,
  email: emailSchema,
  emailVerified: z.boolean(),
});
export const PatchMeRequestSchema = z
  .strictObject({
    displayName: z.string().trim().min(1).max(80).optional(),
    timezone: ianaTimezoneSchema.optional(),
  })
  .refine((v) => v.displayName !== undefined || v.timezone !== undefined, {
    message: 'at least one mutable field required',
  });
export const PatchMeResponseSchema = MeDtoSchema;
export type MeDto = z.infer<typeof MeDtoSchema>;
export type PatchMeRequest = z.infer<typeof PatchMeRequestSchema>;
export type PatchMeResponse = MeDto;

// POST /v1/auth/logout · logout-all · DELETE /v1/me — 204, no body schemas
