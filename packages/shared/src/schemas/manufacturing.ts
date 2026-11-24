import { z } from 'zod';
import { EmployeeStatus, ProductionCostType, ScrapCategory } from '../enums';
import { POSITIVE_MONEY_REGEX, POSITIVE_QTY_REGEX } from '../utils/decimal';
import { strongPasswordSchema } from './index';

export const createEmployeeSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  mobile: z.string().trim().min(8).max(25),
  email: z.string().trim().email().toLowerCase(),
  designation: z.string().trim().min(2).max(100),
  department: z.string().trim().min(2).max(100),
  joiningDate: z.string(),
  assignedLocationId: z.string().uuid().optional().nullable(),
  hourlyLaborRate: z.string().regex(POSITIVE_MONEY_REGEX).optional().nullable(),
  createPortalLogin: z.boolean().default(true),
  portalPassword: strongPasswordSchema.optional(),
});

export const updateEmployeeSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  mobile: z.string().trim().min(8).max(25).optional(),
  designation: z.string().trim().min(2).max(100).optional(),
  department: z.string().trim().min(2).max(100).optional(),
  assignedLocationId: z.string().uuid().optional().nullable(),
  hourlyLaborRate: z.string().regex(POSITIVE_MONEY_REGEX).optional().nullable(),
  status: z.nativeEnum(EmployeeStatus).optional(),
});

export const createJobCardSchema = z.object({
  finishedProductId: z.string().uuid(),
  targetQuantity: z.string().regex(POSITIVE_QTY_REGEX),
  locationId: z.string().uuid(),
  supervisorId: z.string().uuid().optional().nullable(),
  employeeIds: z.array(z.string().uuid()).min(1, 'Assign at least one employee'),
  plannedStartDate: z.string().optional().nullable(),
  plannedCompletionDate: z.string().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  materials: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        requiredQuantity: z.string().regex(POSITIVE_QTY_REGEX),
      }),
    )
    .min(1, 'Specify at least one required raw material'),
});

export const createMaterialRequestSchema = z.object({
  isReplacement: z.boolean().default(false),
  reason: z.string().trim().max(1000).optional().nullable(),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        requestedQuantity: z.string().regex(POSITIVE_QTY_REGEX),
      }),
    )
    .min(1),
});

export const issueMaterialSchema = z.object({
  employeeId: z.string().uuid(),
  itemId: z.string().uuid(),
  sourceLocationId: z.string().uuid(),
  quantity: z.string().regex(POSITIVE_QTY_REGEX),
  requestId: z.string().uuid().optional().nullable(),
  isReplacement: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const recordConsumptionSchema = z.object({
  itemId: z.string().uuid(),
  consumedQuantity: z.string().regex(POSITIVE_QTY_REGEX),
  defectiveQuantity: z.string().regex(POSITIVE_QTY_REGEX).default('0'),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const returnMaterialSchema = z.object({
  employeeId: z.string().uuid().optional(),
  itemId: z.string().uuid(),
  destLocationId: z.string().uuid(),
  quantity: z.string().regex(POSITIVE_QTY_REGEX),
  reason: z.string().trim().min(3).max(255),
});

export const recordProductionOutputSchema = z.object({
  goodQuantity: z.string().regex(POSITIVE_QTY_REGEX),
  rejectedQuantity: z.string().regex(POSITIVE_QTY_REGEX).default('0'),
  destLocationId: z.string().uuid(),
  laborHours: z.coerce.number().min(0).max(1000).optional().nullable(),
  batchNumber: z.string().trim().max(60).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const addProductionCostSchema = z.object({
  costType: z.nativeEnum(ProductionCostType),
  description: z.string().trim().min(3).max(255),
  amount: z.string().regex(POSITIVE_MONEY_REGEX),
});

export const reopenJobCardSchema = z.object({
  reason: z.string().trim().min(5, 'Audit reason is required to reopen a closed Job Card').max(1000),
});

export const createScrapRecordSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.string().regex(POSITIVE_QTY_REGEX),
  category: z.nativeEnum(ScrapCategory),
  reason: z.string().trim().min(3).max(1000),
  jobCardId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid().optional().nullable(),
  productionBatch: z.string().trim().max(60).optional().nullable(),
  locationId: z.string().uuid(),
  estimatedValue: z.string().regex(POSITIVE_MONEY_REGEX).default('0.00'),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const verifyScrapSchema = z.object({
  approved: z.boolean(),
  scrapStorageLocationId: z.string().uuid().optional(),
  estimatedValue: z.string().regex(POSITIVE_MONEY_REGEX).optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const disposeScrapSchema = z.object({
  disposalType: z.enum(['REUSED', 'SOLD', 'DISPOSED']),
  quantity: z.string().regex(POSITIVE_QTY_REGEX),
  saleValue: z.string().regex(POSITIVE_MONEY_REGEX).default('0.00'),
  buyerName: z.string().trim().max(160).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});
