/**
 * Safe decimal formatting and conversion helpers.
 * Monetary calculations on the backend MUST use Prisma.Decimal / decimal.js;
 * these helpers avoid IEEE-754 floating-point drift during serialization and display.
 */

export function formatINR(value: string | number | null | undefined, currencySymbol = '₹'): string {
  if (value === null || value === undefined || value === '') return `${currencySymbol}0.00`;
  const str = typeof value === 'number' ? value.toFixed(2) : String(value);
  const num = Number(str);
  if (Number.isNaN(num)) return `${currencySymbol}0.00`;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(num)
    .replace('₹', currencySymbol);
}

export function formatQuantity(value: string | number | null | undefined, maxDecimals = 4): string {
  if (value === null || value === undefined || value === '') return '0';
  const num = Number(value);
  if (Number.isNaN(num)) return '0';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(num);
}

export const DECIMAL_MONEY_REGEX = /^-?\d{1,16}(\.\d{1,2})?$/;
export const POSITIVE_MONEY_REGEX = /^\d{1,16}(\.\d{1,2})?$/;
export const POSITIVE_QTY_REGEX = /^\d{1,14}(\.\d{1,4})?$/;
