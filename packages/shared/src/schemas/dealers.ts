import { z } from 'zod';
import { DealerStatus } from '../enums';
import { POSITIVE_MONEY_REGEX, POSITIVE_QTY_REGEX } from '../utils/decimal';
import { strongPasswordSchema } from './index';

export const createDealerSchema = z.object({
  dealerName: z.string().trim().min(2).max(150),
  businessName: z.string().trim().min(2).max(180),
  contactPerson: z.string().trim().min(2).max(120),
  mobile: z.string().trim().min(8).max(25),
  email: z.string().trim().email().toLowerCase(),
  gstin: z.string().trim().max(20).optional().nullable(),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(30),
  paymentTermsLabel: z.string().trim().max(120).optional().nullable(),
  creditLimit: z.string().regex(POSITIVE_MONEY_REGEX, 'Enter a valid monetary amount').default('0.00'),
  openingBalance: z.string().regex(POSITIVE_MONEY_REGEX, 'Enter a valid opening balance').default('0.00'),
  enforceHardBlock: z.boolean().default(false),
  allowBackorders: z.boolean().default(false),
  canViewStockQty: z.boolean().default(true),
  notes: z.string().trim().max(2000).optional().nullable(),
  address: z.object({
    addressLine1: z.string().trim().min(3).max(255),
    addressLine2: z.string().trim().max(255).optional().nullable(),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().min(2).max(80),
    postalCode: z.string().trim().min(4).max(20),
    country: z.string().trim().default('India'),
  }),
  createPortalLogin: z.boolean().default(true),
  portalPassword: strongPasswordSchema.optional(),
});

export const updateDealerSchema = z.object({
  dealerName: z.string().trim().min(2).max(150).optional(),
  businessName: z.string().trim().min(2).max(180).optional(),
  contactPerson: z.string().trim().min(2).max(120).optional(),
  mobile: z.string().trim().min(8).max(25).optional(),
  email: z.string().trim().email().toLowerCase().optional(),
  gstin: z.string().trim().max(20).optional().nullable(),
  status: z.nativeEnum(DealerStatus).optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).optional(),
  paymentTermsLabel: z.string().trim().max(120).optional().nullable(),
  creditLimit: z.string().regex(POSITIVE_MONEY_REGEX).optional(),
  enforceHardBlock: z.boolean().optional(),
  allowBackorders: z.boolean().optional(),
  canViewStockQty: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const updateOwnDealerProfileSchema = z.object({
  contactPerson: z.string().trim().min(2).max(120).optional(),
  mobile: z.string().trim().min(8).max(25).optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const createDealerOrderSchema = z.object({
  dealerId: z.string().uuid().optional(), // Ignored and overridden for DEALER role
  requestedDate: z.string().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  offerId: z.string().uuid().optional().nullable(),
  submitImmediately: z.boolean().default(true),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        quantity: z.string().regex(POSITIVE_QTY_REGEX, 'Enter a valid positive quantity'),
      }),
    )
    .min(1, 'Order must contain at least one item'),
});

export const createOfferSchema = z.object({
  code: z.string().trim().min(2).max(40).toUpperCase(),
  title: z.string().trim().min(3).max(160),
  occasion: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000).optional().nullable(),
  discountPercent: z.coerce.number().min(0.01, 'Discount must be greater than 0%').max(100, 'Discount cannot exceed 100%'),
  minOrderAmount: z.string().regex(POSITIVE_MONEY_REGEX).default('0.00'),
  targetDealerId: z.string().uuid().optional().nullable(),
  validFrom: z.string(),
  validTo: z.string(),
});

export const updateOfferSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  discountPercent: z.coerce.number().min(0.01).max(100).optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const approveOrderSchema = z.object({
  sourceLocationId: z.string().uuid('Select a warehouse/location to reserve stock from'),
  overrideCreditLimit: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const rejectOrderSchema = z.object({
  reason: z.string().trim().min(3, 'Rejection reason is required').max(1000),
});

export const createDispatchSchema = z.object({
  sourceLocationId: z.string().uuid(),
  vehicleNumber: z.string().trim().max(40).optional().nullable(),
  transporterName: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  generateInvoice: z.boolean().default(true),
  items: z
    .array(
      z.object({
        orderItemId: z.string().uuid(),
        quantity: z.string().regex(POSITIVE_QTY_REGEX, 'Enter valid dispatch quantity'),
      }),
    )
    .min(1),
});

export const confirmDeliverySchema = z.object({
  receivedBy: z.string().trim().min(2).max(120),
  remarks: z.string().trim().max(1000).optional().nullable(),
});

export type CreateDealerInput = z.infer<typeof createDealerSchema>;
export type UpdateDealerInput = z.infer<typeof updateDealerSchema>;
export type CreateDealerOrderInput = z.infer<typeof createDealerOrderSchema>;
export type ApproveOrderInput = z.infer<typeof approveOrderSchema>;
export type CreateDispatchInput = z.infer<typeof createDispatchSchema>;
