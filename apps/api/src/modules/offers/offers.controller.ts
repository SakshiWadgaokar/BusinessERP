import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PERMISSIONS, createOfferSchema, updateOfferSchema } from '@erp/shared';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { OffersService } from './offers.service';

@Controller('offers')
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SETTINGS_READ)
  listAll() {
    return this.offersService.listAll();
  }

  @Get('active')
  listActive(@CurrentUser() actor: AuthenticatedUser) {
    return this.offersService.listActiveForActor(actor);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  create(
    @Body(new ZodValidationPipe(createOfferSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.offersService.create(body, actor);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateOfferSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.offersService.update(id, body, actor);
  }
}
