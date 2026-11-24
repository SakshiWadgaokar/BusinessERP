import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DealerLedgerService } from '../finance/dealer-ledger.service';
import { DealersController } from './dealers.controller';
import { DealersService } from './dealers.service';

@Module({
  imports: [AuthModule],
  controllers: [DealersController],
  providers: [DealersService, DealerLedgerService],
  exports: [DealersService],
})
export class DealersModule {}
