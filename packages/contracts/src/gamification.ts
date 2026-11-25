import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './primitives.js';

const themeStateSchema = z.enum(['Harmony', 'Uneasy', 'Horror']);

// GET /v1/patients/{id}/gamification — absent state → {0,'Harmony',null} synthesized server-side
export const GamificationPatientParamsSchema = z.strictObject({ id: uuidSchema });
export const GamificationStateDtoSchema = z.strictObject({
  harmonyPoints: z.number().int().min(0),
  themeState: themeStateSchema,
  updatedAt: isoDateTimeSchema.nullable(),
});
export type GamificationPatientParams = z.infer<typeof GamificationPatientParamsSchema>;
export type GamificationStateDto = z.infer<typeof GamificationStateDtoSchema>;
