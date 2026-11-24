import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a guaranteed-unique sequential document number using a single atomic
   * PostgreSQL `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` statement.
   * Safe under heavy concurrency both inside and outside explicit transactions.
   */
  async next(
    code: string,
    tx?: Prisma.TransactionClient,
    options?: { useFiscalYear?: boolean; yearOnly?: boolean },
  ): Promise<string> {
    const client = tx ?? this.prisma;
    const rows = await client.$queryRaw<
      Array<{ prefix: string; last_number: number; padding: number }>
    >`
      INSERT INTO document_sequences (code, prefix, last_number, padding, updated_at)
      VALUES (${code}, ${code}, 1, 6, NOW())
      ON CONFLICT (code)
      DO UPDATE SET
        last_number = document_sequences.last_number + 1,
        updated_at = NOW()
      RETURNING prefix, last_number, padding
    `;

    const prefix = rows[0].prefix;
    const lastNumber = Number(rows[0].last_number);
    const padding = Number(rows[0].padding);

    const padded = String(lastNumber).padStart(padding, '0');
    const now = new Date();
    const year = now.getFullYear();

    if (options?.yearOnly) {
      return `${prefix}-${year}-${padded}`;
    }

    if (options?.useFiscalYear !== false) {
      // India Financial Year (April 1 to March 31)
      const fyStart = now.getMonth() >= 3 ? year : year - 1;
      const fyEnd = (fyStart + 1) % 100;
      const fyLabel = `${String(fyStart % 100).padStart(2, '0')}${String(fyEnd).padStart(2, '0')}`;
      return `${prefix}-${fyLabel}-${padded}`;
    }

    return `${prefix}-${padded}`;
  }
}
