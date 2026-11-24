import { Module } from '@nestjs/common';
import { InventoryLedgerService } from '../inventory/inventory-ledger.service';
import { DealerLedgerService } from '../finance/dealer-ledger.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, InventoryLedgerService, DealerLedgerService],
  exports: [OrdersService],
})
export class OrdersModule {}
