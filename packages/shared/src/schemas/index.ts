import { z } from 'zod';
import { ROLES } from '../permissions';
import { CostingMethod, UserStatus } from '../enums';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  sortBy: z.string().trim().max(64).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  dateFrom: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  dateTo: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required').max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const strongPasswordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters long')
  .max(128, 'Password cannot exceed 128 characters')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[0-9]/, 'Password must include a number')
  .regex(/[^A-Za-z0-9]/, 'Password must include a special character');

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(32, 'Invalid reset token'),
  newPassword: strongPasswordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: strongPasswordSchema,
});

export const createUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().toLowerCase(),
  phone: z.string().trim().max(25).optional().nullable(),
  password: strongPasswordSchema,
  roleCodes: z
    .array(z.enum(Object.values(ROLES) as [string, ...string[]]))
    .min(1, 'At least one role is required'),
  status: z.nativeEnum(UserStatus).default(UserStatus.ACTIVE),
});

export const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(25).optional().nullable(),
  status: z.nativeEnum(UserStatus).optional(),
  roleCodes: z
    .array(z.enum(Object.values(ROLES) as [string, ...string[]]))
    .min(1)
    .optional(),
  permissionOverrides: z
    .array(
      z.object({
        permissionCode: z.string().min(3),
        granted: z.boolean(),
      }),
    )
    .optional(),
});

export const updateRolePermissionsSchema = z.object({
  permissionCodes: z.array(z.string().min(3)),
});

export const updateBusinessSettingsSchema = z.object({
  businessName: z.string().trim().min(2).max(160).optional(),
  businessAddress: z.string().trim().max(500).optional(),
  businessPhone: z.string().trim().max(30).optional(),
  businessEmail: z.string().trim().email().optional().or(z.literal('')),
  gstEnabled: z.boolean().optional(),
  gstin: z.string().trim().max(20).optional().nullable(),
  currencyCode: z.string().trim().min(3).max(5).optional(),
  currencySymbol: z.string().trim().min(1).max(5).optional(),
  costingMethod: z.nativeEnum(CostingMethod).optional(),
  creditLimitMode: z.enum(['SOFT_BLOCK', 'HARD_BLOCK']).optional(),
  allowBackorders: z.boolean().optional(),
  allowNegativeStock: z.boolean().optional(),
  invoicePrefix: z.string().trim().min(2).max(12).optional(),
  receiptPrefix: z.string().trim().min(2).max(12).optional(),
  orderPrefix: z.string().trim().min(2).max(12).optional(),
  jobCardPrefix: z.string().trim().min(2).max(12).optional(),
  scrapPrefix: z.string().trim().min(2).max(12).optional(),
  defaultPaymentTermsDays: z.coerce.number().int().min(0).max(365).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateBusinessSettingsInput = z.infer<typeof updateBusinessSettingsSchema>;
