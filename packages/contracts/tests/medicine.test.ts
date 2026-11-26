import { describe, expect, it } from 'vitest';
import {
  ArchiveMedicineResponseSchema,
  CatalogEntryDtoSchema,
  CatalogEntryIdParamsSchema,
  CatalogListResponseSchema,
  CatalogQuerySchema,
  ConfirmPhotoParamsSchema,
  ConfirmPhotoRequestSchema,
  CreateCatalogEntryRequestSchema,
  CreateMedicineRequestSchema,
  DeleteMedicineResponseSchema,
  IssuePhotoRequestSchema,
  IssuePhotoResponseSchema,
  ListMedicinesQuerySchema,
  ListMedicinesResponseSchema,
  MedicineIdParamsSchema,
  PatchCatalogEntryRequestSchema,
  PatchMedicineRequestSchema,
  PatientMedicineDetailDtoSchema,
  PatientMedicineSummaryDtoSchema,
} from '../src/index.js';

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID2 = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-11-26T10:00:00.000Z';
const LATER = '2026-12-03T10:00:00.000Z';
const PHOTO_URL = 'https://photos.simmaps.com/catalog/e1/A/k1.jpg';

const catalogEntry = {
  id: UUID,
  brandName: 'panadol',
  ingredientNames: ['paracetamol'],
  form: 'tablet',
  packagingQuantity: 30,
  photos: { A: PHOTO_URL, B: null, C: null },
  createdAt: NOW,
  updatedAt: NOW,
};

const patientMedicine = {
  id: UUID,
  patientId: UUID2,
  catalogEntryId: UUID,
  catalog: {
    brandName: 'panadol',
    form: 'tablet',
    packagingQuantity: 30,
    photos: { A: PHOTO_URL, B: null, C: null },
  },
  prescribingDoctor: 'Dr. X',
  dosage: '500mg',
  dosesRemaining: 12,
  refillThreshold: 6,
  price: 5.5,
  pharmacyName: 'Boots',
  createdAt: NOW,
};

describe('medicine — catalog DTO + list', () => {
  it('CatalogEntryDto round-trips and rejects bad form/extra keys', () => {
    expect(CatalogEntryDtoSchema.parse(catalogEntry)).toEqual(catalogEntry);
    expect(CatalogEntryDtoSchema.safeParse({ ...catalogEntry, form: 'pill' }).success).toBe(false);
    expect(CatalogEntryDtoSchema.safeParse({ ...catalogEntry, extra: 1 }).success).toBe(false);
    expect(
      CatalogEntryDtoSchema.safeParse({
        ...catalogEntry,
        photos: { A: 'not-a-url', B: null, C: null },
      }).success,
    ).toBe(false);
  });

  it('catalog list response + query params', () => {
    const res = { entries: [catalogEntry], page: 1, pageSize: 20, total: 1 };
    expect(CatalogListResponseSchema.parse(res)).toEqual(res);
    expect(CatalogQuerySchema.parse({})).toEqual({});
    expect(CatalogQuerySchema.parse({ q: 'para', page: '2' })).toEqual({ q: 'para', page: 2 });
    expect(CatalogQuerySchema.safeParse({ q: 'x'.repeat(201) }).success).toBe(false);
    expect(CatalogQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(CatalogQuerySchema.safeParse({ pageSize: 50 }).success).toBe(false);
  });
});

describe('medicine — catalog writes + photos', () => {
  it('create catalog entry request', () => {
    const req = {
      brandName: 'Panadol',
      ingredientNames: ['Paracetamol'],
      form: 'tablet',
      packagingQuantity: 30,
    };
    expect(CreateCatalogEntryRequestSchema.parse(req)).toEqual(req);
    expect(CreateCatalogEntryRequestSchema.safeParse({ ...req, ingredientNames: [] }).success).toBe(
      false,
    );
    expect(
      CreateCatalogEntryRequestSchema.safeParse({ ...req, packagingQuantity: 0 }).success,
    ).toBe(false);
    expect(CreateCatalogEntryRequestSchema.safeParse({ ...req, extra: 1 }).success).toBe(false);
  });

  it('patch catalog entry requires ≥1 mutable field', () => {
    expect(PatchCatalogEntryRequestSchema.parse({ form: 'syrup' })).toEqual({ form: 'syrup' });
    expect(PatchCatalogEntryRequestSchema.safeParse({}).success).toBe(false);
    expect(PatchCatalogEntryRequestSchema.safeParse({ photos: {} }).success).toBe(false);
  });

  it('photo issue/confirm contracts', () => {
    expect(IssuePhotoRequestSchema.parse({ slot: 'A' })).toEqual({ slot: 'A' });
    expect(IssuePhotoRequestSchema.safeParse({ slot: 'D' }).success).toBe(false);
    expect(
      IssuePhotoResponseSchema.parse({
        photoKey: 'catalog/e1/A/k1',
        uploadUrl: 'https://r2.example.com/presigned',
        expiresAt: LATER,
      }),
    ).toMatchObject({ photoKey: 'catalog/e1/A/k1' });
    expect(ConfirmPhotoParamsSchema.parse({ id: UUID, slot: 'C' })).toEqual({
      id: UUID,
      slot: 'C',
    });
    expect(ConfirmPhotoRequestSchema.parse({ photoKey: 'k' })).toEqual({ photoKey: 'k' });
    expect(ConfirmPhotoRequestSchema.safeParse({}).success).toBe(false);
    expect(CatalogEntryIdParamsSchema.parse({ id: UUID })).toEqual({ id: UUID });
  });
});

describe('medicine — patient medicines', () => {
  it('summary/detail DTOs', () => {
    expect(PatientMedicineSummaryDtoSchema.parse(patientMedicine)).toEqual(patientMedicine);
    const detail = { ...patientMedicine, updatedAt: NOW, archivedAt: null };
    expect(PatientMedicineDetailDtoSchema.parse(detail)).toEqual(detail);
    expect(
      PatientMedicineDetailDtoSchema.safeParse({ ...detail, archivedAt: undefined }).success,
    ).toBe(false);
    expect(
      PatientMedicineSummaryDtoSchema.safeParse({ ...patientMedicine, dosesRemaining: -1 }).success,
    ).toBe(false);
  });

  it('list query + response', () => {
    expect(ListMedicinesQuerySchema.parse({ patientId: UUID })).toEqual({ patientId: UUID });
    expect(ListMedicinesQuerySchema.safeParse({}).success).toBe(false);
    const res = { medicines: [patientMedicine] };
    expect(ListMedicinesResponseSchema.parse(res)).toEqual(res);
  });

  it('create request requires all fields', () => {
    const req = {
      patientId: UUID,
      catalogEntryId: UUID,
      prescribingDoctor: 'Dr. X',
      dosage: '500mg',
      dosesRemaining: 30,
      price: 5.5,
      pharmacyName: 'Boots',
    };
    expect(CreateMedicineRequestSchema.parse(req)).toEqual(req);
    expect(CreateMedicineRequestSchema.safeParse({ ...req, dosage: '' }).success).toBe(false);
    expect(CreateMedicineRequestSchema.safeParse({ ...req, dosesRemaining: -1 }).success).toBe(
      false,
    );
  });

  it('patch request — mutable fields only, ≥1 required', () => {
    expect(PatchMedicineRequestSchema.parse({ dosage: '250mg' })).toEqual({ dosage: '250mg' });
    expect(PatchMedicineRequestSchema.safeParse({}).success).toBe(false);
    expect(PatchMedicineRequestSchema.safeParse({ catalogEntryId: UUID }).success).toBe(false);
    expect(PatchMedicineRequestSchema.safeParse({ price: -1 }).success).toBe(false);
  });

  it('archive/delete/id params responses', () => {
    expect(MedicineIdParamsSchema.parse({ id: UUID })).toEqual({ id: UUID });
    expect(ArchiveMedicineResponseSchema.parse({ id: UUID, archivedAt: NOW })).toEqual({
      id: UUID,
      archivedAt: NOW,
    });
    expect(DeleteMedicineResponseSchema.parse({ id: UUID, deleted: true })).toEqual({
      id: UUID,
      deleted: true,
    });
    expect(DeleteMedicineResponseSchema.safeParse({ id: UUID, deleted: false }).success).toBe(
      false,
    );
  });
});
