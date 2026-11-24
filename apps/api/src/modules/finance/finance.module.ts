import { Module } from '@nestjs/common';
import { DealerLedgerService } from './dealer-ledger.service';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, DealerLedgerService],
  exports: [FinanceService, DealerLedgerService],
})
export class FinanceModule {}
