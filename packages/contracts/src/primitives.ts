import { z } from 'zod';

export const uuidSchema = z.uuid();
export const isoDateTimeSchema = z.iso.datetime();
export const roleSchema = z.enum(['Patient', 'Caregiver']);
export const emailSchema = z.email().max(254);
export const passwordSchema = z.string().min(8).max(128);
export const opaqueTokenSchema = z.string().min(1);
export const ianaTimezoneSchema = z
  .string()
  .min(1)
  .refine(
    (tz) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'invalid IANA timezone' },
  );
