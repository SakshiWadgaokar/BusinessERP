import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApproveOrderInput,
  CreateDealerOrderInput,
  CreateDispatchInput,
  PERMISSIONS,
  approveOrderSchema,
  confirmDeliverySchema,
  createDealerOrderSchema,
  createDispatchSchema,
  paginationQuerySchema,
  rejectOrderSchema,
} from '@erp/shared';
import { z } from 'zod';
import {
  CurrentUser,
  RequireIdempotency,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { OrdersService } from './orders.service';

const listOrdersQuery = paginationQuerySchema.extend({
  status: z.string().optional(),
  dealerId: z.string().uuid().optional(),
});

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORDERS_READ)
  list(
    @Query(new ZodValidationPipe(listOrdersQuery)) query: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.ordersService.list(query, actor);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ORDERS_READ)
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.ordersService.findOne(id, actor);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ORDERS_CREATE)
  create(
    @Body(new ZodValidationPipe(createDealerOrderSchema)) body: CreateDealerOrderInput,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.ordersService.create(body, actor);
  }

  @Post(':id/submit')
  @RequirePermissions(PERMISSIONS.ORDERS_CREATE)
  submit(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.ordersService.submitDraft(id, actor);
  }

  @Post(':id/approve')
  @RequirePermissions(PERMISSIONS.ORDERS_APPROVE)
  approve(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(approveOrderSchema)) body: ApproveOrderInput,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.ordersService.approve(id, body, actor);
  }

  @Post(':id/reject')
  @RequirePermissions(PERMISSIONS.ORDERS_APPROVE)
  reject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rejectOrderSchema)) body: { reason: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.ordersService.reject(id, body.reason, actor);
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.ORDERS_CANCEL)
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rejectOrderSchema)) body: { reason: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.ordersService.cancel(id, body.reason, actor);
  }

  @Post(':id/dispatches')
  @RequirePermissions(PERMISSIONS.DISPATCHES_CREATE)
  @RequireIdempotency()
  createDispatch(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createDispatchSchema)) body: CreateDispatchInput,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.ordersService.createDispatch(id, body, actor);
  }

  @Post('dispatches/:dispatchId/confirm-delivery')
  @RequirePermissions(PERMISSIONS.DISPATCHES_CONFIRM)
  confirmDelivery(
    @Param('dispatchId') dispatchId: string,
    @Body(new ZodValidationPipe(confirmDeliverySchema)) body: { receivedBy: string; remarks?: string | null },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.ordersService.confirmDelivery(dispatchId, body, actor);
  }
}
