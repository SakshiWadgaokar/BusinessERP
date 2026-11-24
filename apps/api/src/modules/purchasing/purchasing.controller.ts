import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  PERMISSIONS,
  createGoodsReceiptSchema,
  createPurchaseOrderSchema,
  createSupplierSchema,
  paginationQuerySchema,
  recordSupplierInvoiceSchema,
  recordSupplierPaymentSchema,
} from '@erp/shared';
import { z } from 'zod';
import {
  CurrentUser,
  RequireIdempotency,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { PurchasingService } from './purchasing.service';

const poQuerySchema = paginationQuerySchema.extend({
  status: z.string().optional(),
  supplierId: z.string().uuid().optional(),
});

@Controller('purchasing')
export class PurchasingController {
  constructor(private readonly purchasingService: PurchasingService) {}

  @Get('suppliers')
  @RequirePermissions(PERMISSIONS.SUPPLIERS_READ)
  listSuppliers(@Query(new ZodValidationPipe(paginationQuerySchema)) query: any) {
    return this.purchasingService.listSuppliers(query);
  }

  @Post('suppliers')
  @RequirePermissions(PERMISSIONS.SUPPLIERS_MANAGE)
  createSupplier(
    @Body(new ZodValidationPipe(createSupplierSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.purchasingService.createSupplier(body, actor);
  }

  @Get('purchase-orders')
  @RequirePermissions(PERMISSIONS.PURCHASES_READ)
  listPOs(@Query(new ZodValidationPipe(poQuerySchema)) query: any) {
    return this.purchasingService.listPurchaseOrders(query);
  }

  @Post('purchase-orders')
  @RequirePermissions(PERMISSIONS.PURCHASES_MANAGE)
  createPO(
    @Body(new ZodValidationPipe(createPurchaseOrderSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.purchasingService.createPurchaseOrder(body, actor);
  }

  @Post('purchase-orders/:id/receipts')
  @RequirePermissions(PERMISSIONS.GRN_RECEIVE)
  @RequireIdempotency()
  receiveGoods(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createGoodsReceiptSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.purchasingService.receiveGoods(id, body, actor);
  }

  @Get('supplier-invoices')
  @RequirePermissions(PERMISSIONS.PURCHASES_READ)
  listSupplierInvoices(@Query(new ZodValidationPipe(paginationQuerySchema)) query: any) {
    return this.purchasingService.listSupplierInvoices(query);
  }

  @Post('supplier-invoices')
  @RequirePermissions(PERMISSIONS.PURCHASES_MANAGE)
  recordSupplierInvoice(
    @Body(new ZodValidationPipe(recordSupplierInvoiceSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.purchasingService.recordSupplierInvoice(body, actor);
  }

  @Post('supplier-payments')
  @RequirePermissions(PERMISSIONS.PAYMENTS_RECORD)
  @RequireIdempotency()
  recordSupplierPayment(
    @Body(new ZodValidationPipe(recordSupplierPaymentSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.purchasingService.recordSupplierPayment(body, actor);
  }
}
