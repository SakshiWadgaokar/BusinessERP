import { BadRequestException, Injectable } from '@nestjs/common';
import { LedgerEntryType, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

export interface DealerLedgerInput {
  dealerId: string;
  entryType: LedgerEntryType;
  entryDate?: Date;
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  debitAmount?: string | number | Decimal;
  creditAmount?: string | number | Decimal;
  description: string;
  createdById: string;
}

@Injectable()
export class DealerLedgerService {
  /**
   * Acquires an exclusive row lock on the dealer record, appends an immutable
   * `dealer_ledger_entries` row, and updates `dealers.outstanding_balance` atomically.
   */
  async postEntry(tx: Prisma.TransactionClient, input: DealerLedgerInput) {
    const debit = new Decimal((input.debitAmount ?? 0).toString()).toDecimalPlaces(
      2,
      Decimal.ROUND_HALF_UP,
    );
    const credit = new Decimal((input.creditAmount ?? 0).toString()).toDecimalPlaces(
      2,
      Decimal.ROUND_HALF_UP,
    );

    if (debit.isNegative() || credit.isNegative()) {
      throw new BadRequestException('Ledger debit and credit amounts must be non-negative.');
    }
    if (debit.isZero() && credit.isZero()) {
      throw new BadRequestException('Ledger entry must have a non-zero debit or credit.');
    }

    const locked = await tx.$queryRaw<
      Array<{ id: string; outstanding_balance: Prisma.Decimal }>
    >`
      SELECT id, outstanding_balance
      FROM dealers
      WHERE id = ${input.dealerId}
      FOR UPDATE
    `;

    if (locked.length === 0) {
      throw new BadRequestException('Dealer not found for ledger posting.');
    }

    const prevBalance = new Decimal(locked[0].outstanding_balance.toString());
    const runningBalance = prevBalance.plus(debit).minus(credit).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    await tx.dealer.update({
      where: { id: input.dealerId },
      data: { outstandingBalance: runningBalance.toFixed(2) },
    });

    const entry = await tx.dealerLedgerEntry.create({
      data: {
        dealerId: input.dealerId,
        entryDate: input.entryDate ?? new Date(),
        entryType: input.entryType,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        referenceNumber: input.referenceNumber ?? null,
        debitAmount: debit.toFixed(2),
        creditAmount: credit.toFixed(2),
        runningBalance: runningBalance.toFixed(2),
        description: input.description,
        createdById: input.createdById,
      },
    });

    return { entry, runningBalance };
  }
}
