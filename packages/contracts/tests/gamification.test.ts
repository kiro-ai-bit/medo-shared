import { describe, expect, it } from 'vitest';
import {
  GamificationPatientParamsSchema,
  GamificationStateDtoSchema,
  PatientIdParamsSchema,
} from '../src/index.js';

const UUID = '11111111-1111-4111-8111-111111111111';
const NOW = '2026-11-26T10:00:00.000Z';

const state = { harmonyPoints: 120, themeState: 'Harmony', updatedAt: NOW };

describe('gamification — GET /v1/patients/{id}/gamification', () => {
  it('GamificationStateDto — score floor, theme enum, nullable updatedAt', () => {
    expect(GamificationStateDtoSchema.parse(state)).toEqual(state);
    expect(
      GamificationStateDtoSchema.parse({
        harmonyPoints: 0,
        themeState: 'Harmony',
        updatedAt: null,
      }),
    ).toEqual({ harmonyPoints: 0, themeState: 'Harmony', updatedAt: null });
    for (const t of ['Harmony', 'Uneasy', 'Horror']) {
      expect(GamificationStateDtoSchema.safeParse({ ...state, themeState: t }).success).toBe(true);
    }
    for (const bad of ['harmony', 'UNSET', '']) {
      expect(GamificationStateDtoSchema.safeParse({ ...state, themeState: bad }).success).toBe(
        false,
      );
    }
    expect(GamificationStateDtoSchema.safeParse({ ...state, harmonyPoints: -1 }).success).toBe(
      false,
    );
    expect(GamificationStateDtoSchema.safeParse({ ...state, harmonyPoints: 1.5 }).success).toBe(
      false,
    );
    expect(
      GamificationStateDtoSchema.safeParse({ ...state, updatedAt: 'not-a-date' }).success,
    ).toBe(false);
    expect(GamificationStateDtoSchema.safeParse({ ...state, extra: 1 }).success).toBe(false);
  });

  it('path params — patient id uuid', () => {
    expect(GamificationPatientParamsSchema.parse({ id: UUID })).toEqual({ id: UUID });
    expect(GamificationPatientParamsSchema.safeParse({ id: 'x' }).success).toBe(false);
    expect(PatientIdParamsSchema.parse({ id: UUID })).toEqual({ id: UUID });
  });
});
