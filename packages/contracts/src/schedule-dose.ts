import { z } from 'zod';
import { ianaTimezoneSchema, isoDateTimeSchema, uuidSchema } from './primitives.js';

const localDateSchema = z.iso.date();
const doseTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const doseOutcomeSchema = z.enum(['unmarked', 'taken-on-time', 'taken-late', 'skipped', 'missed']);
const clientMarkOutcomeSchema = z.enum(['taken-on-time', 'taken-late', 'skipped']);
const dueWindowSchema = z.enum(['early', 'on-time', 'late', 'hourly', 'missed-lock']);
const scheduleExceptionKindSchema = z.enum(['skip', 'time-override']);

// RecurrenceDto — guided-builder contract, request + response
export const RecurrenceDtoSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('rrule'), rrule: z.string().min(1) }),
  z.strictObject({ kind: z.literal('date-list'), dates: z.array(localDateSchema).min(1) }),
]);
export type RecurrenceDto = z.infer<typeof RecurrenceDtoSchema>;

const scheduleExceptionInputSchema = z
  .strictObject({
    date: localDateSchema,
    kind: scheduleExceptionKindSchema,
    time: doseTimeSchema.optional(),
  })
  .refine((e) => (e.kind === 'time-override' ? e.time !== undefined : e.time === undefined), {
    message: 'time required iff kind=time-override',
  });
const scheduleExceptionDtoSchema = z
  .strictObject({
    date: localDateSchema,
    kind: scheduleExceptionKindSchema,
    timeOverride: doseTimeSchema.nullable(),
  })
  .refine((e) => (e.kind === 'time-override' ? e.timeOverride !== null : e.timeOverride === null), {
    message: 'timeOverride non-null iff kind=time-override',
  });

const scheduleSummaryShape = {
  id: uuidSchema,
  patientId: uuidSchema,
  medicineId: uuidSchema,
  recurrence: RecurrenceDtoSchema,
  doseTimes: z.array(doseTimeSchema).min(1),
  timezone: ianaTimezoneSchema,
  startDate: localDateSchema,
  endDate: localDateSchema.nullable(),
  exceptionCount: z.number().int().min(0),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
};

export const ScheduleSummaryDtoSchema = z.strictObject(scheduleSummaryShape);
export const ScheduleDetailDtoSchema = z.strictObject({
  ...scheduleSummaryShape,
  exceptions: z.array(scheduleExceptionDtoSchema),
  resolvedStartDate: localDateSchema,
});
export type ScheduleSummaryDto = z.infer<typeof ScheduleSummaryDtoSchema>;
export type ScheduleDetailDto = z.infer<typeof ScheduleDetailDtoSchema>;

// GET /v1/patients/{id}/schedules (200) · POST same path (201 → ScheduleDetailDto)
export const PatientIdParamsSchema = z.strictObject({ id: uuidSchema });
export const ScheduleListResponseSchema = z.strictObject({
  schedules: z.array(ScheduleSummaryDtoSchema),
});
export const CreateScheduleRequestSchema = z.strictObject({
  medicineId: uuidSchema,
  recurrence: RecurrenceDtoSchema,
  doseTimes: z.array(doseTimeSchema).min(1),
  timezone: ianaTimezoneSchema,
  startDate: localDateSchema.optional(),
  endDate: localDateSchema.nullable().optional(),
  exceptions: z.array(scheduleExceptionInputSchema).optional(),
});
export type PatientIdParams = z.infer<typeof PatientIdParamsSchema>;
export type ScheduleListResponse = z.infer<typeof ScheduleListResponseSchema>;
export type CreateScheduleRequest = z.infer<typeof CreateScheduleRequestSchema>;

// GET/PATCH/DELETE /v1/schedules/{id}
export const ScheduleIdParamsSchema = z.strictObject({ id: uuidSchema });
export const SchedulePatchRequestSchema = z
  .strictObject({
    medicineId: uuidSchema.optional(),
    recurrence: RecurrenceDtoSchema.optional(),
    doseTimes: z.array(doseTimeSchema).min(1).optional(),
    timezone: ianaTimezoneSchema.optional(),
    startDate: localDateSchema.optional(),
    endDate: localDateSchema.nullable().optional(),
    exceptions: z.array(scheduleExceptionInputSchema).optional(),
  })
  .refine(
    (v) =>
      v.recurrence !== undefined ||
      v.doseTimes !== undefined ||
      v.timezone !== undefined ||
      v.startDate !== undefined ||
      v.endDate !== undefined ||
      v.exceptions !== undefined,
    { message: 'at least one mutable field required' },
  );
export const DeleteScheduleResponseSchema = z.strictObject({
  id: uuidSchema,
  deleted: z.literal(true),
});
export type ScheduleIdParams = z.infer<typeof ScheduleIdParamsSchema>;
export type SchedulePatchRequest = z.infer<typeof SchedulePatchRequestSchema>;
export type DeleteScheduleResponse = z.infer<typeof DeleteScheduleResponseSchema>;

// DoseSummaryDto / DoseDetailDto — names fixed by LD-SCH-07 (frontend + Gamification consume)
const doseSharedShape = {
  medicineId: uuidSchema,
  patientId: uuidSchema,
  scheduleId: uuidSchema,
  localDate: localDateSchema,
  doseTime: doseTimeSchema,
  scheduledAt: isoDateTimeSchema,
  outcome: doseOutcomeSchema,
  skippedByUser: z.boolean(),
  snoozedUntil: isoDateTimeSchema.nullable(),
};
const doseSummaryShape = {
  id: uuidSchema,
  ...doseSharedShape,
  actorId: uuidSchema.nullable(),
  markedAt: isoDateTimeSchema.nullable(),
};
export const DoseSummaryDtoSchema = z.strictObject(doseSummaryShape);
export const DoseDetailDtoSchema = z.strictObject({
  ...doseSummaryShape,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type DoseSummaryDto = z.infer<typeof DoseSummaryDtoSchema>;
export type DoseDetailDto = z.infer<typeof DoseDetailDtoSchema>;

// GET /v1/patients/{id}/doses?from=&to=&outcome= (200) — public + internal variants share DTOs
export const PatientDosesQuerySchema = z
  .strictObject({
    from: isoDateTimeSchema,
    to: isoDateTimeSchema,
    outcome: doseOutcomeSchema.optional(),
  })
  .refine((v) => Date.parse(v.to) > Date.parse(v.from), {
    message: 'to must be after from',
  });
export const PatientDosesResponseSchema = z.strictObject({
  doses: z.array(DoseSummaryDtoSchema),
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
});
export type PatientDosesQuery = z.infer<typeof PatientDosesQuerySchema>;
export type PatientDosesResponse = z.infer<typeof PatientDosesResponseSchema>;

// GET /v1/doses/{id} (200 → DoseDetailDto) · POST outcome (200 → DoseDetailDto) · POST snooze (200 → DoseDetailDto)
export const DoseIdParamsSchema = z.strictObject({ id: uuidSchema });
export const MarkDoseOutcomeRequestSchema = z.strictObject({
  outcome: clientMarkOutcomeSchema,
});
export type DoseIdParams = z.infer<typeof DoseIdParamsSchema>;
export type MarkDoseOutcomeRequest = z.infer<typeof MarkDoseOutcomeRequestSchema>;

// GET /v1/doses/due?window= — internal (LD-SCH-06 enum)
export const DueDosesQuerySchema = z.strictObject({ window: dueWindowSchema });
export const DueDoseDtoSchema = z.strictObject({
  doseId: uuidSchema,
  ...doseSharedShape,
});
export const DueDosesResponseSchema = z.strictObject({
  doses: z.array(DueDoseDtoSchema),
  window: dueWindowSchema,
  evaluatedAt: isoDateTimeSchema,
});
export type DueDosesQuery = z.infer<typeof DueDosesQuerySchema>;
export type DueDoseDto = z.infer<typeof DueDoseDtoSchema>;
export type DueDosesResponse = z.infer<typeof DueDosesResponseSchema>;

// GET /v1/patients/{id}/has-dose-records — internal; shape confirmed vs Medicine OQ-LLD-MED-01
export const HasDoseRecordsResponseSchema = z.strictObject({
  hasDoseRecords: z.boolean(),
});
export type HasDoseRecordsResponse = z.infer<typeof HasDoseRecordsResponseSchema>;
