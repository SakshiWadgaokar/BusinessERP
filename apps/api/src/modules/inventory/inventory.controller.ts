import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  PERMISSIONS,
  createItemSchema,
  createLocationSchema,
  createStockAdjustmentSchema,
  openingStockSchema,
  paginationQuerySchema,
  stockTransferSchema,
  updateItemSchema,
} from '@erp/shared';
import { z } from 'zod';
import {
  CurrentUser,
  RequireIdempotency,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { InventoryService } from './inventory.service';

const itemsQuerySchema = paginationQuerySchema.extend({
  itemType: z.string().optional(),
  activeOnly: z.string().optional(),
});

const txnsQuerySchema = paginationQuerySchema.extend({
  itemId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  transactionType: z.string().optional(),
});

const decideAdjustmentSchema = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(255).optional(),
});

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('uoms')
  @RequirePermissions(PERMISSIONS.ITEMS_READ)
  listUoms() {
    return this.inventoryService.listUoms();
  }

  @Get('categories')
  @RequirePermissions(PERMISSIONS.ITEMS_READ)
  listCategories(@Query('itemType') itemType?: string) {
    return this.inventoryService.listCategories(itemType);
  }

  @Post('categories')
  @RequirePermissions(PERMISSIONS.ITEMS_WRITE)
  createCategory(
    @Body(
      new ZodValidationPipe(
        z.object({
          name: z.string().trim().min(2).max(100),
          itemType: z.enum(['RAW_MATERIAL', 'FINISHED_GOOD', 'WIP', 'SCRAP', 'CONSUMABLE', 'OTHER']).default('FINISHED_GOOD'),
          description: z.string().trim().max(255).optional().nullable(),
        }),
      ),
    )
    body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventoryService.createCategory(body, actor);
  }

  @Get('locations')
  @RequirePermissions(PERMISSIONS.LOCATIONS_READ)
  listLocations() {
    return this.inventoryService.listLocations();
  }

  @Post('locations')
  @RequirePermissions(PERMISSIONS.LOCATIONS_MANAGE)
  createLocation(
    @Body(new ZodValidationPipe(createLocationSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventoryService.createLocation(body, actor);
  }

  @Get('items')
  @RequirePermissions(PERMISSIONS.ITEMS_READ)
  listItems(
    @Query(new ZodValidationPipe(itemsQuerySchema)) query: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventoryService.listItems(query, actor);
  }

  @Post('items')
  @RequirePermissions(PERMISSIONS.ITEMS_WRITE)
  createItem(
    @Body(new ZodValidationPipe(createItemSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventoryService.createItem(body, actor);
  }

  @Patch('items/:id')
  @RequirePermissions(PERMISSIONS.ITEMS_WRITE)
  updateItem(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateItemSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventoryService.updateItem(id, body, actor);
  }

  @Get('balances')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  getBalances(
    @Query('locationId') locationId?: string,
    @Query('itemType') itemType?: string,
    @Query('search') search?: string,
  ) {
    return this.inventoryService.getBalances({ locationId, itemType, search });
  }

  @Get('transactions')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  getTransactions(@Query(new ZodValidationPipe(txnsQuerySchema)) query: any) {
    return this.inventoryService.getTransactions(query);
  }

  @Get('low-stock')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  getLowStockAlerts() {
    return this.inventoryService.getLowStockAlerts();
  }

  @Post('opening-stock')
  @RequirePermissions(PERMISSIONS.INVENTORY_RECEIVE)
  @RequireIdempotency()
  recordOpeningStock(
    @Body(new ZodValidationPipe(openingStockSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventoryService.recordOpeningStock(body, actor);
  }

  @Post('transfers')
  @RequirePermissions(PERMISSIONS.INVENTORY_TRANSFER)
  @RequireIdempotency()
  createTransfer(
    @Body(new ZodValidationPipe(stockTransferSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventoryService.createTransfer(body, actor);
  }

  @Get('adjustments')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  listAdjustments(@Query(new ZodValidationPipe(paginationQuerySchema)) query: any) {
    return this.inventoryService.listAdjustments(query);
  }

  @Post('adjustments')
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST_REQUEST)
  requestAdjustment(
    @Body(new ZodValidationPipe(createStockAdjustmentSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventoryService.requestAdjustment(body, actor);
  }

  @Post('adjustments/:id/decision')
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST_APPROVE)
  decideAdjustment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(decideAdjustmentSchema)) body: { approve: boolean; note?: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventoryService.decideAdjustment(id, body.approve, body.note, actor);
  }
}
