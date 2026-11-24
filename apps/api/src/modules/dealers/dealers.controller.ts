import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateDealerInput,
  PERMISSIONS,
  UpdateDealerInput,
  createDealerSchema,
  paginationQuerySchema,
  updateDealerSchema,
  updateOwnDealerProfileSchema,
} from '@erp/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { DealersService } from './dealers.service';

const listDealersQuery = paginationQuerySchema.extend({
  status: z.string().optional(),
});

@Controller('dealers')
export class DealersController {
  constructor(private readonly dealersService: DealersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DEALERS_READ)
  list(@Query(new ZodValidationPipe(listDealersQuery)) query: any) {
    return this.dealersService.list(query);
  }

  @Get('me')
  @RequirePermissions(PERMISSIONS.DEALERS_OWN_READ)
  getOwnProfile(@CurrentUser() actor: AuthenticatedUser) {
    return this.dealersService.findOne(actor.dealerId || '', actor);
  }

  @Patch('me')
  @RequirePermissions(PERMISSIONS.DEALERS_OWN_UPDATE)
  updateOwnProfile(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateOwnDealerProfileSchema)) body: any,
  ) {
    return this.dealersService.updateOwnProfile(actor, body);
  }

  @Get('me/summary')
  @RequirePermissions(PERMISSIONS.DEALERS_OWN_READ)
  getOwnSummary(@CurrentUser() actor: AuthenticatedUser) {
    return this.dealersService.getFinancialSummary(actor.dealerId || '', actor);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.dealersService.findOne(id, actor);
  }

  @Get(':id/summary')
  getSummary(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.dealersService.getFinancialSummary(id, actor);
  }

  @Get(':id/purchases')
  getPurchases(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: any,
  ) {
    return this.dealersService.getPurchaseHistory(id, actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DEALERS_WRITE)
  create(
    @Body(new ZodValidationPipe(createDealerSchema)) body: CreateDealerInput,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.dealersService.create(body, actor);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.DEALERS_WRITE)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateDealerSchema)) body: UpdateDealerInput,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.dealersService.update(id, body, actor);
  }
}
