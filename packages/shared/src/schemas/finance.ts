import { z } from 'zod';
import { PaymentMode } from '../enums';
import { POSITIVE_MONEY_REGEX } from '../utils/decimal';

export const recordPaymentSchema = z.object({
  dealerId: z.string().uuid(),
  paymentDate: z.string().optional(),
  amount: z.string().regex(POSITIVE_MONEY_REGEX, 'Enter a valid payment amount'),
  paymentMode: z.nativeEnum(PaymentMode),
  transactionRef: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  allocations: z
    .array(
      z.object({
        invoiceId: z.string().uuid(),
        allocatedAmount: z.string().regex(POSITIVE_MONEY_REGEX),
      }),
    )
    .default([]),
});

export const reversePaymentSchema = z.object({
  reason: z.string().trim().min(5, 'Reversal reason is required').max(1000),
});

export const dealerSubmitPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  paymentType: z.enum(['FULL', 'PARTIAL']),
  amount: z.string().regex(POSITIVE_MONEY_REGEX, 'Enter a valid payment amount'),
  paymentMode: z.nativeEnum(PaymentMode),
  transactionRef: z.string().trim().max(120).optional().nullable(),
  partialPaymentReason: z.string().trim().max(1000).optional().nullable(),
  expectedBalanceDate: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(1500).optional().nullable(),
});

export const verifyPaymentDecisionSchema = z.object({
  action: z.enum(['VERIFY', 'REJECT']),
  reason: z.string().trim().max(1000).optional().nullable(),
});

export const createCreditNoteSchema = z.object({
  dealerId: z.string().uuid(),
  invoiceId: z.string().uuid().optional().nullable(),
  amount: z.string().regex(POSITIVE_MONEY_REGEX),
  reason: z.string().trim().min(5).max(1000),
});

export const createExpenseSchema = z.object({
  categoryId: z.string().uuid(),
  expenseDate: z.string(),
  amount: z.string().regex(POSITIVE_MONEY_REGEX),
  paymentMode: z.nativeEnum(PaymentMode),
  vendorName: z.string().trim().max(160).optional().nullable(),
  referenceNo: z.string().trim().max(100).optional().nullable(),
  description: z.string().trim().min(3).max(2000),
});

export const recordSupplierInvoiceSchema = z.object({
  supplierId: z.string().uuid(),
  purchaseOrderId: z.string().uuid().optional().nullable(),
  supplierBillNo: z.string().trim().min(1).max(80),
  billDate: z.string(),
  dueDate: z.string().optional().nullable(),
  subtotal: z.string().regex(POSITIVE_MONEY_REGEX),
  taxAmount: z.string().regex(POSITIVE_MONEY_REGEX).default('0.00'),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const recordSupplierPaymentSchema = z.object({
  supplierId: z.string().uuid(),
  supplierInvoiceId: z.string().uuid().optional().nullable(),
  paymentDate: z.string().optional(),
  amount: z.string().regex(POSITIVE_MONEY_REGEX),
  paymentMode: z.nativeEnum(PaymentMode),
  referenceNo: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});
