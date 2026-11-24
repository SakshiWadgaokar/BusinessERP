import { z } from 'zod';
import { ItemType, StockLocationType } from '../enums';
import { POSITIVE_MONEY_REGEX, POSITIVE_QTY_REGEX } from '../utils/decimal';

export const createLocationSchema = z.object({
  code: z.string().trim().min(2).max(40).toUpperCase(),
  name: z.string().trim().min(2).max(120),
  locationType: z.nativeEnum(StockLocationType),
  address: z.string().trim().max(255).optional().nullable(),
});

export const createItemSchema = z.object({
  sku: z.string().trim().min(2).max(60).toUpperCase(),
  name: z.string().trim().min(2).max(180),
  itemType: z.nativeEnum(ItemType),
  categoryId: z.string().uuid().optional().nullable(),
  uomId: z.string().uuid(),
  description: z.string().trim().max(2000).optional().nullable(),
  hsnSacCode: z.string().trim().max(20).optional().nullable(),
  defaultTaxRate: z.coerce.number().min(0).max(100).optional().nullable(),
  standardSellPrice: z.string().regex(POSITIVE_MONEY_REGEX).default('0.00'),
  standardCost: z.string().regex(POSITIVE_QTY_REGEX).default('0'),
  minStockLevel: z.string().regex(POSITIVE_QTY_REGEX).default('0'),
  reorderLevel: z.string().regex(POSITIVE_QTY_REGEX).default('0'),
  preferredSupplierId: z.string().uuid().optional().nullable(),
  visibleToDealers: z.boolean().default(false),
});

export const updateItemSchema = createItemSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const openingStockSchema = z.object({
  itemId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.string().regex(POSITIVE_QTY_REGEX),
  unitCost: z.string().regex(POSITIVE_QTY_REGEX),
  reason: z.string().trim().min(3).max(255).default('Opening stock balance'),
});

export const stockTransferSchema = z.object({
  sourceLocationId: z.string().uuid(),
  destLocationId: z.string().uuid(),
  reason: z.string().trim().min(3).max(255),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        quantity: z.string().regex(POSITIVE_QTY_REGEX),
      }),
    )
    .min(1),
});

export const createStockAdjustmentSchema = z.object({
  locationId: z.string().uuid(),
  reason: z.string().trim().min(5, 'Detailed reason is required for stock adjustments').max(1000),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        quantityDelta: z.string().regex(/^-?\d{1,14}(\.\d{1,4})?$/, 'Enter valid positive or negative delta'),
        unitCost: z.string().regex(POSITIVE_QTY_REGEX).optional(),
        notes: z.string().trim().max(255).optional(),
      }),
    )
    .min(1),
});

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  contactPerson: z.string().trim().max(120).optional().nullable(),
  mobile: z.string().trim().min(8).max(25),
  email: z.string().trim().email().optional().nullable().or(z.literal('')),
  address: z.string().trim().max(1000).optional().nullable(),
  gstin: z.string().trim().max(20).optional().nullable(),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(30),
});

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  expectedDate: z.string().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        orderedQuantity: z.string().regex(POSITIVE_QTY_REGEX),
        unitRate: z.string().regex(POSITIVE_QTY_REGEX),
        taxRate: z.coerce.number().min(0).max(100).default(0),
      }),
    )
    .min(1),
});

export const createGoodsReceiptSchema = z.object({
  locationId: z.string().uuid(),
  challanRef: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  items: z
    .array(
      z.object({
        purchaseOrderItemId: z.string().uuid(),
        receivedQuantity: z.string().regex(POSITIVE_QTY_REGEX),
        acceptedQuantity: z.string().regex(POSITIVE_QTY_REGEX),
        rejectedQuantity: z.string().regex(POSITIVE_QTY_REGEX).default('0'),
        rejectionReason: z.string().trim().max(255).optional().nullable(),
      }),
    )
    .min(1),
});
