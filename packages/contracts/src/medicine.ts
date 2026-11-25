import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './primitives.js';

const medicineFormSchema = z.enum(['tablet', 'capsule', 'syrup', 'injection', 'drops', 'other']);
const photoSlotSchema = z.enum(['A', 'B', 'C']);
const photoUrlSchema = z.url().nullable();
const shortTextSchema = z.string().trim().min(1).max(200);

const catalogPhotosSchema = z.strictObject({
  A: photoUrlSchema,
  B: photoUrlSchema,
  C: photoUrlSchema,
});

// GET /v1/medicine-catalog — query
export const CatalogQuerySchema = z.strictObject({
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
});
export type CatalogQuery = z.infer<typeof CatalogQuerySchema>;

// CatalogEntryDto — shared by catalog list/detail/create/patch/photo-confirm responses
export const CatalogEntryDtoSchema = z.strictObject({
  id: uuidSchema,
  brandName: z.string(),
  ingredientNames: z.array(z.string()),
  form: medicineFormSchema,
  packagingQuantity: z.number().int().min(1),
  photos: catalogPhotosSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export const CatalogListResponseSchema = z.strictObject({
  entries: z.array(CatalogEntryDtoSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
});
export type CatalogEntryDto = z.infer<typeof CatalogEntryDtoSchema>;
export type CatalogListResponse = z.infer<typeof CatalogListResponseSchema>;

// POST /v1/medicine-catalog (201 → CatalogEntryDto)
export const CreateCatalogEntryRequestSchema = z.strictObject({
  brandName: shortTextSchema,
  ingredientNames: z.array(shortTextSchema).min(1),
  form: medicineFormSchema,
  packagingQuantity: z.number().int().min(1),
});
export type CreateCatalogEntryRequest = z.infer<typeof CreateCatalogEntryRequestSchema>;

// PATCH /v1/medicine-catalog/{id} — partial, ≥1 field, photos immutable
export const PatchCatalogEntryRequestSchema = z
  .strictObject({
    brandName: shortTextSchema.optional(),
    ingredientNames: z.array(shortTextSchema).min(1).optional(),
    form: medicineFormSchema.optional(),
    packagingQuantity: z.number().int().min(1).optional(),
  })
  .refine(
    (v) =>
      v.brandName !== undefined ||
      v.ingredientNames !== undefined ||
      v.form !== undefined ||
      v.packagingQuantity !== undefined,
    { message: 'at least one mutable field required' },
  );
export type PatchCatalogEntryRequest = z.infer<typeof PatchCatalogEntryRequestSchema>;

// POST /v1/medicine-catalog/{id}/photos → presigned PUT
export const IssuePhotoRequestSchema = z.strictObject({ slot: photoSlotSchema });
export const IssuePhotoResponseSchema = z.strictObject({
  photoKey: z.string().min(1),
  uploadUrl: z.url(),
  expiresAt: isoDateTimeSchema,
});
export type IssuePhotoRequest = z.infer<typeof IssuePhotoRequestSchema>;
export type IssuePhotoResponse = z.infer<typeof IssuePhotoResponseSchema>;

// PUT /v1/medicine-catalog/{id}/photos/{slot} — confirm issued key (200 → CatalogEntryDto)
export const CatalogEntryIdParamsSchema = z.strictObject({ id: uuidSchema });
export const ConfirmPhotoParamsSchema = z.strictObject({
  id: uuidSchema,
  slot: photoSlotSchema,
});
export const ConfirmPhotoRequestSchema = z.strictObject({ photoKey: z.string().min(1) });
export type CatalogEntryIdParams = z.infer<typeof CatalogEntryIdParamsSchema>;
export type ConfirmPhotoParams = z.infer<typeof ConfirmPhotoParamsSchema>;
export type ConfirmPhotoRequest = z.infer<typeof ConfirmPhotoRequestSchema>;

// GET /v1/medicines?patientId= (200)
export const ListMedicinesQuerySchema = z.strictObject({ patientId: uuidSchema });
export const PatientMedicineSummaryDtoSchema = z.strictObject({
  id: uuidSchema,
  patientId: uuidSchema,
  catalogEntryId: uuidSchema,
  catalog: z.strictObject({
    brandName: z.string(),
    form: medicineFormSchema,
    packagingQuantity: z.number().int().min(1),
    photos: catalogPhotosSchema,
  }),
  prescribingDoctor: z.string(),
  dosage: z.string(),
  dosesRemaining: z.number().int().min(0),
  price: z.number().min(0),
  pharmacyName: z.string(),
  createdAt: isoDateTimeSchema,
});
export const ListMedicinesResponseSchema = z.strictObject({
  medicines: z.array(PatientMedicineSummaryDtoSchema),
});
export type ListMedicinesQuery = z.infer<typeof ListMedicinesQuerySchema>;
export type PatientMedicineSummaryDto = z.infer<typeof PatientMedicineSummaryDtoSchema>;
export type ListMedicinesResponse = z.infer<typeof ListMedicinesResponseSchema>;

// POST /v1/medicines (201 → PatientMedicineDetailDto)
export const CreateMedicineRequestSchema = z.strictObject({
  patientId: uuidSchema,
  catalogEntryId: uuidSchema,
  prescribingDoctor: shortTextSchema,
  dosage: shortTextSchema,
  dosesRemaining: z.number().int().min(0),
  price: z.number().min(0),
  pharmacyName: shortTextSchema,
});
export type CreateMedicineRequest = z.infer<typeof CreateMedicineRequestSchema>;

// GET/PATCH /v1/medicines/{id} — internal service-JWT variant returns same detail DTO
export const MedicineIdParamsSchema = z.strictObject({ id: uuidSchema });
export const PatientMedicineDetailDtoSchema = z.strictObject({
  ...PatientMedicineSummaryDtoSchema.shape,
  updatedAt: isoDateTimeSchema,
  archivedAt: isoDateTimeSchema.nullable(),
});
export const PatchMedicineRequestSchema = z
  .strictObject({
    prescribingDoctor: shortTextSchema.optional(),
    dosage: shortTextSchema.optional(),
    dosesRemaining: z.number().int().min(0).optional(),
    price: z.number().min(0).optional(),
    pharmacyName: shortTextSchema.optional(),
  })
  .refine(
    (v) =>
      v.prescribingDoctor !== undefined ||
      v.dosage !== undefined ||
      v.dosesRemaining !== undefined ||
      v.price !== undefined ||
      v.pharmacyName !== undefined,
    { message: 'at least one mutable field required' },
  );
export type MedicineIdParams = z.infer<typeof MedicineIdParamsSchema>;
export type PatientMedicineDetailDto = z.infer<typeof PatientMedicineDetailDtoSchema>;
export type PatchMedicineRequest = z.infer<typeof PatchMedicineRequestSchema>;

// POST /v1/medicines/{id}/archive (200) · DELETE /v1/medicines/{id} (200)
export const ArchiveMedicineResponseSchema = z.strictObject({
  id: uuidSchema,
  archivedAt: isoDateTimeSchema,
});
export const DeleteMedicineResponseSchema = z.strictObject({
  id: uuidSchema,
  deleted: z.literal(true),
});
export type ArchiveMedicineResponse = z.infer<typeof ArchiveMedicineResponseSchema>;
export type DeleteMedicineResponse = z.infer<typeof DeleteMedicineResponseSchema>;
