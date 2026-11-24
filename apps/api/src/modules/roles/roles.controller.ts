import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { PERMISSIONS, updateRolePermissionsSchema } from '@erp/shared';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { RolesService } from './roles.service';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ROLES_READ)
  listRoles() {
    return this.rolesService.listRoles();
  }

  @Get('permissions')
  @RequirePermissions(PERMISSIONS.ROLES_READ)
  listPermissions() {
    return this.rolesService.listPermissions();
  }

  @Put(':code/permissions')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  updateRolePermissions(
    @Param('code') code: string,
    @Body(new ZodValidationPipe(updateRolePermissionsSchema)) body: { permissionCodes: string[] },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.rolesService.updateRolePermissions(code, body.permissionCodes, actor);
  }
}
