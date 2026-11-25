import { describe, expect, it } from 'vitest';
import {
  CreateScheduleRequestSchema,
  DeleteScheduleResponseSchema,
  DoseDetailDtoSchema,
  DoseIdParamsSchema,
  DoseSummaryDtoSchema,
  DueDosesQuerySchema,
  DueDosesResponseSchema,
  DueDoseDtoSchema,
  HasDoseRecordsResponseSchema,
  MarkDoseOutcomeRequestSchema,
  PatientDosesQuerySchema,
  PatientDosesResponseSchema,
  PatientIdParamsSchema,
  RecurrenceDtoSchema,
  ScheduleDetailDtoSchema,
  ScheduleIdParamsSchema,
  ScheduleListResponseSchema,
  SchedulePatchRequestSchema,
  ScheduleSummaryDtoSchema,
} from '../src/index.js';

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID2 = '22222222-2222-4222-8222-222222222222';
const UUID3 = '33333333-3333-4333-8333-333333333333';
const UUID4 = '44444444-4444-4444-8444-444444444444';
const NOW = '2026-11-26T10:00:00.000Z';
const SCHED_AT = '2026-11-26T09:00:00.000Z';

const scheduleSummary = {
  id: UUID,
  patientId: UUID2,
  medicineId: UUID3,
  recurrence: { kind: 'rrule', rrule: 'FREQ=WEEKLY;BYDAY=MO,WE' },
  doseTimes: ['08:00', '20:00'],
  timezone: 'Asia/Karachi',
  startDate: '2026-11-26',
  endDate: null,
  exceptionCount: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

const doseSummary = {
  id: UUID4,
  scheduleId: UUID,
  patientId: UUID2,
  medicineId: UUID3,
  localDate: '2026-11-26',
  doseTime: '08:00',
  scheduledAt: SCHED_AT,
  outcome: 'unmarked',
  skippedByUser: false,
  snoozedUntil: null,
  actorId: null,
  markedAt: null,
};

describe('schedule-dose — recurrence + summary/detail DTOs', () => {
  it('RecurrenceDto union both kinds', () => {
    expect(RecurrenceDtoSchema.parse({ kind: 'rrule', rrule: 'FREQ=DAILY' })).toEqual({
      kind: 'rrule',
      rrule: 'FREQ=DAILY',
    });
    expect(
      RecurrenceDtoSchema.parse({ kind: 'date-list', dates: ['2026-12-01', '2026-12-05'] }),
    ).toEqual({ kind: 'date-list', dates: ['2026-12-01', '2026-12-05'] });
    expect(RecurrenceDtoSchema.safeParse({ kind: 'rrule' }).success).toBe(false);
    expect(RecurrenceDtoSchema.safeParse({ kind: 'date-list', dates: [] }).success).toBe(false);
    expect(RecurrenceDtoSchema.safeParse({ kind: 'other' }).success).toBe(false);
  });

  it('ScheduleSummaryDto + DetailDto round-trip', () => {
    expect(ScheduleSummaryDtoSchema.parse(scheduleSummary)).toEqual(scheduleSummary);
    const detail = {
      ...scheduleSummary,
      exceptions: [{ date: '2026-11-28', kind: 'time-override', timeOverride: '09:30' }],
      resolvedStartDate: '2026-11-26',
    };
    expect(ScheduleDetailDtoSchema.parse(detail)).toEqual(detail);
    expect(ScheduleDetailDtoSchema.safeParse({ ...detail, timezone: 'Not/AZone' }).success).toBe(
      false,
    );
    expect(
      ScheduleSummaryDtoSchema.safeParse({ ...scheduleSummary, doseTimes: ['25:00'] }).success,
    ).toBe(false);
  });

  it('schedule list response + params', () => {
    expect(ScheduleListResponseSchema.parse({ schedules: [scheduleSummary] })).toEqual({
      schedules: [scheduleSummary],
    });
    expect(PatientIdParamsSchema.parse({ id: UUID })).toEqual({ id: UUID });
    expect(ScheduleIdParamsSchema.parse({ id: UUID })).toEqual({ id: UUID });
  });
});

describe('schedule-dose — schedule writes', () => {
  it('create request full shape', () => {
    const req = {
      medicineId: UUID3,
      recurrence: { kind: 'date-list', dates: ['2026-12-01'] },
      doseTimes: ['08:00'],
      timezone: 'Asia/Karachi',
      startDate: '2026-11-26',
      endDate: '2027-01-01',
      exceptions: [{ date: '2026-12-01', kind: 'skip' }],
    };
    expect(CreateScheduleRequestSchema.parse(req)).toEqual(req);
    expect(CreateScheduleRequestSchema.safeParse({ ...req, doseTimes: [] }).success).toBe(false);
    expect(CreateScheduleRequestSchema.safeParse({ ...req, timezone: 'Bad/Zone' }).success).toBe(
      false,
    );
  });

  it('exception time rule — required iff time-override, forbidden iff skip', () => {
    const base = {
      medicineId: UUID3,
      recurrence: { kind: 'rrule', rrule: 'FREQ=DAILY' },
      doseTimes: ['08:00'],
      timezone: 'UTC',
    };
    expect(
      CreateScheduleRequestSchema.safeParse({
        ...base,
        exceptions: [{ date: '2026-12-01', kind: 'time-override' }],
      }).success,
    ).toBe(false);
    expect(
      CreateScheduleRequestSchema.safeParse({
        ...base,
        exceptions: [{ date: '2026-12-01', kind: 'time-override', time: '09:00' }],
      }).success,
    ).toBe(true);
    expect(
      CreateScheduleRequestSchema.safeParse({
        ...base,
        exceptions: [{ date: '2026-12-01', kind: 'skip', time: '09:00' }],
      }).success,
    ).toBe(false);
    expect(
      CreateScheduleRequestSchema.safeParse({
        ...base,
        exceptions: [{ date: '2026-12-01', kind: 'skip' }],
      }).success,
    ).toBe(true);
  });

  it('patch request — ≥1 mutable field; medicineId allowed but cannot be sole field', () => {
    expect(SchedulePatchRequestSchema.parse({ doseTimes: ['09:00'] })).toEqual({
      doseTimes: ['09:00'],
    });
    expect(SchedulePatchRequestSchema.safeParse({}).success).toBe(false);
    expect(SchedulePatchRequestSchema.safeParse({ medicineId: UUID3 }).success).toBe(false);
    expect(SchedulePatchRequestSchema.safeParse({ medicineId: UUID3, endDate: null }).success).toBe(
      true,
    );
    expect(SchedulePatchRequestSchema.safeParse({ extra: 1 }).success).toBe(false);
  });

  it('delete response literal', () => {
    expect(DeleteScheduleResponseSchema.parse({ id: UUID, deleted: true })).toEqual({
      id: UUID,
      deleted: true,
    });
    expect(DeleteScheduleResponseSchema.safeParse({ id: UUID, deleted: false }).success).toBe(
      false,
    );
  });
});

describe('schedule-dose — dose DTOs + reads', () => {
  it('DoseSummaryDto + DoseDetailDto (LD-SCH-07 names)', () => {
    expect(DoseSummaryDtoSchema.parse(doseSummary)).toEqual(doseSummary);
    const detail = { ...doseSummary, createdAt: NOW, updatedAt: NOW };
    expect(DoseDetailDtoSchema.parse(detail)).toEqual(detail);
    expect(DoseSummaryDtoSchema.safeParse({ ...doseSummary, outcome: 'taken' }).success).toBe(
      false,
    );
    expect(DoseSummaryDtoSchema.safeParse({ ...doseSummary, actorId: 'x' }).success).toBe(false);
  });

  it('patient doses query + response', () => {
    expect(PatientDosesQuerySchema.parse({ from: NOW, to: '2026-11-27T10:00:00.000Z' })).toEqual({
      from: NOW,
      to: '2026-11-27T10:00:00.000Z',
    });
    expect(
      PatientDosesQuerySchema.parse({
        from: NOW,
        to: '2026-11-27T10:00:00.000Z',
        outcome: 'missed',
      }).outcome,
    ).toBe('missed');
    expect(
      PatientDosesQuerySchema.safeParse({ from: NOW, to: '2026-11-27T10:00:00.000Z', outcome: 'x' })
        .success,
    ).toBe(false);
    expect(
      PatientDosesQuerySchema.safeParse({ from: '2026-11-27T10:00:00.000Z', to: NOW }).success,
    ).toBe(false);
    expect(
      PatientDosesResponseSchema.parse({
        doses: [doseSummary],
        from: NOW,
        to: '2026-11-27T10:00:00.000Z',
      }).doses,
    ).toHaveLength(1);
    expect(DoseIdParamsSchema.parse({ id: UUID4 })).toEqual({ id: UUID4 });
  });
});

describe('schedule-dose — outcome + snooze writes', () => {
  it('mark outcome accepts only client-markable classes', () => {
    expect(MarkDoseOutcomeRequestSchema.parse({ outcome: 'taken-on-time' })).toEqual({
      outcome: 'taken-on-time',
    });
    expect(MarkDoseOutcomeRequestSchema.parse({ outcome: 'skipped' })).toEqual({
      outcome: 'skipped',
    });
    for (const bad of ['missed', 'unmarked', 'taken']) {
      expect(MarkDoseOutcomeRequestSchema.safeParse({ outcome: bad }).success).toBe(false);
    }
    expect(MarkDoseOutcomeRequestSchema.safeParse({ outcome: 'skipped', extra: 1 }).success).toBe(
      false,
    );
  });
});

describe('schedule-dose — internal surfaces', () => {
  it('due window enum + DueDoseDto + response (LD-SCH-06)', () => {
    for (const w of ['early', 'on-time', 'late', 'hourly', 'missed-lock']) {
      expect(DueDosesQuerySchema.parse({ window: w })).toEqual({ window: w });
    }
    expect(DueDosesQuerySchema.safeParse({ window: 'missed' }).success).toBe(false);
    expect(DueDosesQuerySchema.safeParse({}).success).toBe(false);

    const due = {
      doseId: UUID4,
      medicineId: UUID3,
      patientId: UUID2,
      scheduleId: UUID,
      localDate: '2026-11-26',
      doseTime: '08:00',
      scheduledAt: SCHED_AT,
      outcome: 'unmarked',
      skippedByUser: false,
      snoozedUntil: null,
    };
    expect(DueDoseDtoSchema.parse(due)).toEqual(due);
    expect(DueDoseDtoSchema.safeParse({ ...due, actorId: UUID }).success).toBe(false);
    expect(
      DueDosesResponseSchema.parse({ doses: [due], window: 'on-time', evaluatedAt: NOW }),
    ).toEqual({ doses: [due], window: 'on-time', evaluatedAt: NOW });
  });

  it('has-dose-records response shape', () => {
    expect(HasDoseRecordsResponseSchema.parse({ hasDoseRecords: true })).toEqual({
      hasDoseRecords: true,
    });
    expect(HasDoseRecordsResponseSchema.safeParse({ hasDoseRecords: 'yes' }).success).toBe(false);
    expect(HasDoseRecordsResponseSchema.safeParse({}).success).toBe(false);
  });
});
