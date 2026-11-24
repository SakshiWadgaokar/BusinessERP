import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  PERMISSIONS,
  UpdateBusinessSettingsInput,
  updateBusinessSettingsSchema,
} from '@erp/shared';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SETTINGS_READ)
  getAll() {
    return this.settingsService.getAll();
  }

  @Patch()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  updateMany(
    @Body(new ZodValidationPipe(updateBusinessSettingsSchema)) body: UpdateBusinessSettingsInput,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.settingsService.updateMany(body, actor);
  }
}
