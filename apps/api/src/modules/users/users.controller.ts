import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateUserInput,
  PERMISSIONS,
  UpdateUserInput,
  createUserSchema,
  paginationQuerySchema,
  updateUserSchema,
} from '@erp/shared';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { UsersService } from './users.service';
import { z } from 'zod';

const listUsersQuerySchema = paginationQuerySchema.extend({
  status: z.string().optional(),
  role: z.string().optional(),
});

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_READ)
  list(@Query(new ZodValidationPipe(listUsersQuerySchema)) query: any) {
    return this.usersService.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  create(
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.create(body, actor);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.update(id, body, actor);
  }
}
