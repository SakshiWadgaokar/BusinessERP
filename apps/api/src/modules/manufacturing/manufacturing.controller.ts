import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  PERMISSIONS,
  addProductionCostSchema,
  createJobCardSchema,
  createMaterialRequestSchema,
  issueMaterialSchema,
  paginationQuerySchema,
  recordConsumptionSchema,
  recordProductionOutputSchema,
  reopenJobCardSchema,
  returnMaterialSchema,
} from '@erp/shared';
import { z } from 'zod';
import {
  CurrentUser,
  RequireIdempotency,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { ManufacturingService } from './manufacturing.service';

const jcQuery = paginationQuerySchema.extend({
  status: z.string().optional(),
  locationId: z.string().uuid().optional(),
});

@Controller('job-cards')
export class ManufacturingController {
  constructor(private readonly manufacturingService: ManufacturingService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.JOB_CARDS_READ)
  list(
    @Query(new ZodValidationPipe(jcQuery)) query: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.manufacturingService.listJobCards(query, actor);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.JOB_CARDS_READ)
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.manufacturingService.findJobCard(id, actor);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.JOB_CARDS_CREATE)
  create(
    @Body(new ZodValidationPipe(createJobCardSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.manufacturingService.createJobCard(body, actor);
  }

  @Post(':id/material-requests')
  @RequirePermissions(PERMISSIONS.JOB_CARDS_EXECUTE)
  createMaterialRequest(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createMaterialRequestSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.manufacturingService.createMaterialRequest(id, body, actor);
  }

  @Post(':id/issues')
  @RequirePermissions(PERMISSIONS.INVENTORY_ISSUE)
  @RequireIdempotency()
  issueMaterial(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(issueMaterialSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.manufacturingService.issueMaterial(id, body, actor);
  }

  @Post(':id/consumption')
  @RequirePermissions(PERMISSIONS.JOB_CARDS_EXECUTE)
  recordConsumption(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(recordConsumptionSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.manufacturingService.recordConsumption(id, body, actor);
  }

  @Post(':id/returns')
  @RequirePermissions(PERMISSIONS.INVENTORY_RETURN)
  @RequireIdempotency()
  returnMaterial(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(returnMaterialSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.manufacturingService.returnMaterial(id, body, actor);
  }

  @Post(':id/production')
  @RequirePermissions(PERMISSIONS.PRODUCTION_RECORD)
  @RequireIdempotency()
  recordOutput(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(recordProductionOutputSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.manufacturingService.recordProductionOutput(id, body, actor);
  }

  @Get(':id/costing')
  @RequirePermissions(PERMISSIONS.COSTING_READ)
  getCosting(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.manufacturingService.getCostingBreakdown(id, actor);
  }

  @Post(':id/costs')
  @RequirePermissions(PERMISSIONS.COSTING_WRITE)
  addCost(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addProductionCostSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.manufacturingService.addProductionCost(id, body, actor);
  }

  @Post(':id/close')
  @RequirePermissions(PERMISSIONS.JOB_CARDS_CLOSE)
  close(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.manufacturingService.closeJobCard(id, actor);
  }

  @Post(':id/reopen')
  @RequirePermissions(PERMISSIONS.JOB_CARDS_REOPEN)
  reopen(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reopenJobCardSchema)) body: { reason: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.manufacturingService.reopenJobCard(id, body.reason, actor);
  }
}
