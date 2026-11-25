import { describe, expect, it } from 'vitest';
import {
  AcceptInviteResponseSchema,
  CancelInviteResponseSchema,
  CreateInviteRequestSchema,
  CreateInviteResponseSchema,
  DeclineInviteResponseSchema,
  EndLinkResponseSchema,
  errorEnvelopeSchema,
  ForgotPasswordRequestSchema,
  ForgotPasswordResponseSchema,
  InviteIdParamsSchema,
  InviteListResponseSchema,
  InvitePreviewDtoSchema,
  InviteTokenParamsSchema,
  LinkIdParamsSchema,
  LinkListResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  MeDtoSchema,
  PatchMeRequestSchema,
  RefreshResponseSchema,
  ResendInviteResponseSchema,
  ResendVerificationRequestSchema,
  ResendVerificationResponseSchema,
  ResetPasswordRequestSchema,
  SignupRequestSchema,
  SignupResponseSchema,
  VerifyEmailRequestSchema,
} from '../src/index.js';

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID2 = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-11-26T10:00:00.000Z';
const LATER = '2026-12-03T10:00:00.000Z';

describe('error envelope', () => {
  it('parses minimal and extended envelopes', () => {
    expect(
      errorEnvelopeSchema.parse({
        error: { code: 'NOT_FOUND', message: 'nope', requestId: 'req-1' },
      }),
    ).toEqual({ error: { code: 'NOT_FOUND', message: 'nope', requestId: 'req-1' } });
    expect(
      errorEnvelopeSchema.parse({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'bad',
          requestId: 'req-2',
          details: { field: 'email' },
        },
      }).error.details,
    ).toEqual({ field: 'email' });
  });

  it('rejects malformed envelopes and unknown keys', () => {
    expect(errorEnvelopeSchema.safeParse({ error: { code: 'X' } }).success).toBe(false);
    expect(
      errorEnvelopeSchema.safeParse({
        error: { code: 'X', message: 'm', requestId: 'r', extra: 1 },
      }).success,
    ).toBe(false);
    expect(
      errorEnvelopeSchema.safeParse({ error: { code: 'X', message: 'm', requestId: 'r' }, top: 1 })
        .success,
    ).toBe(false);
  });
});

describe('identity — signup', () => {
  it('accepts valid signup and rejects bad role/password/email', () => {
    const ok = { name: '  Asim  ', email: 'a@b.com', password: 'password1', role: 'Patient' };
    expect(SignupRequestSchema.parse(ok)).toEqual({ ...ok, name: 'Asim' });
    expect(SignupRequestSchema.safeParse({ ...ok, role: 'Admin' }).success).toBe(false);
    expect(SignupRequestSchema.safeParse({ ...ok, password: 'short' }).success).toBe(false);
    expect(SignupRequestSchema.safeParse({ ...ok, email: 'nope' }).success).toBe(false);
    expect(SignupRequestSchema.safeParse({ ...ok, extra: true }).success).toBe(false);
  });

  it('signup response shape', () => {
    expect(
      SignupResponseSchema.parse({ userId: UUID, email: 'a@b.com', role: 'Caregiver' }),
    ).toEqual({ userId: UUID, email: 'a@b.com', role: 'Caregiver' });
  });
});

describe('identity — login/refresh', () => {
  it('login request + shared session response', () => {
    expect(LoginRequestSchema.parse({ email: 'a@b.com', password: 'x' })).toEqual({
      email: 'a@b.com',
      password: 'x',
    });
    const res = { userId: UUID, accessToken: 'jwt', expiresAt: NOW };
    expect(LoginResponseSchema.parse(res)).toEqual(res);
    expect(RefreshResponseSchema.parse(res)).toEqual(res);
    expect(LoginResponseSchema.safeParse({ userId: UUID, accessToken: 'j' }).success).toBe(false);
  });
});

describe('identity — password/verify flows', () => {
  it('forgot/resend return accepted literal', () => {
    expect(ForgotPasswordRequestSchema.parse({ email: 'a@b.com' })).toEqual({ email: 'a@b.com' });
    expect(ForgotPasswordResponseSchema.parse({ accepted: true })).toEqual({ accepted: true });
    expect(ForgotPasswordResponseSchema.safeParse({ accepted: false }).success).toBe(false);
    expect(ResendVerificationRequestSchema.parse({ email: 'a@b.com' })).toEqual({
      email: 'a@b.com',
    });
    expect(ResendVerificationResponseSchema.parse({ accepted: true })).toEqual({ accepted: true });
  });

  it('reset/verify token requests', () => {
    expect(ResetPasswordRequestSchema.parse({ token: 'raw', password: 'password1' })).toEqual({
      token: 'raw',
      password: 'password1',
    });
    expect(ResetPasswordRequestSchema.safeParse({ token: 'raw', password: 'short' }).success).toBe(
      false,
    );
    expect(VerifyEmailRequestSchema.parse({ token: 'raw' })).toEqual({ token: 'raw' });
    expect(VerifyEmailRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('identity — /v1/me', () => {
  const me = {
    displayName: 'Asim',
    timezone: 'Asia/Karachi',
    role: 'Patient',
    email: 'a@b.com',
    emailVerified: true,
  };

  it('MeDto round-trips', () => {
    expect(MeDtoSchema.parse(me)).toEqual(me);
    expect(MeDtoSchema.safeParse({ ...me, emailVerified: 'yes' }).success).toBe(false);
    expect(MeDtoSchema.safeParse({ ...me, role: 'Admin' }).success).toBe(false);
  });

  it('PatchMeRequest requires ≥1 mutable field, rejects immutable keys', () => {
    expect(PatchMeRequestSchema.parse({ displayName: 'New' })).toEqual({ displayName: 'New' });
    expect(PatchMeRequestSchema.parse({ timezone: 'UTC' })).toEqual({ timezone: 'UTC' });
    expect(PatchMeRequestSchema.safeParse({}).success).toBe(false);
    expect(PatchMeRequestSchema.safeParse({ role: 'Caregiver' }).success).toBe(false);
    expect(PatchMeRequestSchema.safeParse({ email: 'x@y.z' }).success).toBe(false);
    expect(PatchMeRequestSchema.safeParse({ displayName: '  ' }).success).toBe(false);
    expect(PatchMeRequestSchema.safeParse({ timezone: 'Not/AZone' }).success).toBe(false);
  });
});

describe('care — invites', () => {
  it('create invite request/response', () => {
    expect(CreateInviteRequestSchema.parse({ caregiverEmail: 'c@d.com' })).toEqual({
      caregiverEmail: 'c@d.com',
    });
    expect(CreateInviteRequestSchema.safeParse({ caregiverEmail: 'bad' }).success).toBe(false);
    expect(
      CreateInviteResponseSchema.parse({
        inviteId: UUID,
        caregiverEmail: 'c@d.com',
        expiresAt: LATER,
        status: 'pending',
      }),
    ).toMatchObject({ status: 'pending' });
    expect(
      CreateInviteResponseSchema.safeParse({
        inviteId: UUID,
        caregiverEmail: 'c@d.com',
        expiresAt: LATER,
        status: 'accepted',
      }).success,
    ).toBe(false);
  });

  it('token/id params', () => {
    expect(InviteTokenParamsSchema.parse({ token: 'opaque' })).toEqual({ token: 'opaque' });
    expect(InviteTokenParamsSchema.safeParse({ token: '' }).success).toBe(false);
    expect(InviteIdParamsSchema.parse({ id: UUID })).toEqual({ id: UUID });
    expect(InviteIdParamsSchema.safeParse({ id: 'nope' }).success).toBe(false);
  });

  it('invite preview dto', () => {
    expect(InvitePreviewDtoSchema.parse({ patientDisplayName: 'Asim', expiresAt: LATER })).toEqual({
      patientDisplayName: 'Asim',
      expiresAt: LATER,
    });
  });

  it('accept/decline/resend/cancel responses', () => {
    expect(
      AcceptInviteResponseSchema.parse({
        linkId: UUID,
        patientId: UUID,
        caregiverId: UUID2,
        createdAt: NOW,
      }),
    ).toMatchObject({ linkId: UUID });
    expect(DeclineInviteResponseSchema.parse({ inviteId: UUID, status: 'declined' })).toEqual({
      inviteId: UUID,
      status: 'declined',
    });
    expect(ResendInviteResponseSchema.parse({ inviteId: UUID, expiresAt: LATER })).toEqual({
      inviteId: UUID,
      expiresAt: LATER,
    });
    expect(CancelInviteResponseSchema.parse({ inviteId: UUID, status: 'cancelled' })).toEqual({
      inviteId: UUID,
      status: 'cancelled',
    });
  });

  it('invite list response — pending rows, direction + optional counterparty', () => {
    const res = {
      invites: [
        {
          inviteId: UUID,
          direction: 'sent',
          counterpartyEmail: 'c@d.com',
          expiresAt: LATER,
          createdAt: NOW,
        },
        {
          inviteId: UUID2,
          direction: 'received',
          counterpartyDisplayName: 'Asim',
          expiresAt: LATER,
          createdAt: NOW,
        },
      ],
    };
    expect(InviteListResponseSchema.parse(res)).toEqual(res);
    expect(
      InviteListResponseSchema.safeParse({
        invites: [{ inviteId: UUID, direction: 'sideways', expiresAt: LATER, createdAt: NOW }],
      }).success,
    ).toBe(false);
  });
});

describe('care — links', () => {
  it('link list response both directions', () => {
    const res = {
      links: [
        {
          linkId: UUID,
          direction: 'as-patient',
          counterpart: { userId: UUID2, displayName: 'Care' },
          createdAt: NOW,
        },
        {
          linkId: UUID2,
          direction: 'as-caregiver',
          counterpart: { userId: UUID, displayName: 'Pat' },
          createdAt: NOW,
        },
      ],
    };
    expect(LinkListResponseSchema.parse(res)).toEqual(res);
  });

  it('end link params + response', () => {
    expect(LinkIdParamsSchema.parse({ id: UUID })).toEqual({ id: UUID });
    expect(EndLinkResponseSchema.parse({ linkId: UUID, status: 'ended', endedAt: NOW })).toEqual({
      linkId: UUID,
      status: 'ended',
      endedAt: NOW,
    });
    expect(
      EndLinkResponseSchema.safeParse({ linkId: UUID, status: 'active', endedAt: NOW }).success,
    ).toBe(false);
  });
});
