import { z } from 'zod';

const uuid = z.uuid();
const isoDate = z.iso.datetime();
const role = z.enum(['Patient', 'Caregiver']);
const outcome = z.enum(['taken-on-time', 'taken-late', 'skipped', 'missed']);

function eventSchema<T extends string, F extends z.ZodRawShape>(type: T, fields: F) {
  return z.object({
    eventId: uuid,
    occurredAt: isoDate,
    type: z.literal(type),
    ...fields,
  });
}

export const EVENT_SCHEMAS = {
  UserRegistered: eventSchema('UserRegistered', { userId: uuid, role }),
  ProfileChanged: eventSchema('ProfileChanged', {
    userId: uuid,
    changedFields: z.array(z.string()),
  }),
  AccountDeleted: eventSchema('AccountDeleted', { userId: uuid }),
  EmailVerificationRequested: eventSchema('EmailVerificationRequested', {
    userId: uuid,
    email: z.email(),
    verifyLink: z.string().min(1),
  }),
  PasswordResetRequested: eventSchema('PasswordResetRequested', {
    userId: uuid,
    email: z.email(),
    resetLink: z.string().min(1),
  }),
  CareLinkInviteCreated: eventSchema('CareLinkInviteCreated', {
    inviteId: uuid,
    patientId: uuid,
    caregiverEmail: z.email(),
    inviteLink: z.string().min(1),
    expiresAt: isoDate,
  }),
  CareLinkInviteDeclined: eventSchema('CareLinkInviteDeclined', {
    inviteId: uuid,
    patientId: uuid,
    caregiverId: uuid,
  }),
  CareLinkInviteExpired: eventSchema('CareLinkInviteExpired', {
    inviteId: uuid,
    patientId: uuid,
  }),
  CareLinkCreated: eventSchema('CareLinkCreated', {
    linkId: uuid,
    patientId: uuid,
    caregiverId: uuid,
  }),
  CareLinkEnded: eventSchema('CareLinkEnded', {
    linkId: uuid,
    patientId: uuid,
    caregiverId: uuid,
    endedBy: uuid,
  }),
  RefillThresholdCrossed: eventSchema('RefillThresholdCrossed', {
    medicineId: uuid,
    patientId: uuid,
    dosesRemaining: z.number().int().min(0),
    threshold: z.union([z.literal(6), z.literal(0)]),
  }),
  MedicineArchived: eventSchema('MedicineArchived', {
    medicineId: uuid,
    patientId: uuid,
  }),
  DoseOutcomeChanged: eventSchema('DoseOutcomeChanged', {
    doseId: uuid,
    medicineId: uuid,
    patientId: uuid,
    outcome,
    actorId: uuid.optional(),
  }),
} as const;

export type EventType = keyof typeof EVENT_SCHEMAS;
export const EVENT_TYPES = Object.keys(EVENT_SCHEMAS) as EventType[];

export type BrokerEvent = {
  id: string;
  eventId: string;
  occurredAt: string;
  type: string;
} & Record<string, unknown>;

export function parseBrokerEvent(raw: Record<string, unknown>, rowId: string): BrokerEvent {
  const type = raw.type;
  const schema = typeof type === 'string' ? EVENT_SCHEMAS[type as EventType] : undefined;
  if (!schema) {
    throw new Error(`unknown event type: ${String(type)}`);
  }
  const parsed = schema.parse(raw);
  return { ...parsed, id: rowId } as BrokerEvent;
}
