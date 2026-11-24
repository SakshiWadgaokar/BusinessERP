import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  PERMISSIONS,
  createEmployeeSchema,
  paginationQuerySchema,
  updateEmployeeSchema,
} from '@erp/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { EmployeesService } from './employees.service';

const empQuery = paginationQuerySchema.extend({
  status: z.string().optional(),
  department: z.string().optional(),
});

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.EMPLOYEES_READ)
  list(@Query(new ZodValidationPipe(empQuery)) query: any) {
    return this.employeesService.list(query);
  }

  @Get('me/dashboard')
  @RequirePermissions(PERMISSIONS.DASHBOARD_EMPLOYEE)
  getMyDashboard(@CurrentUser() actor: AuthenticatedUser) {
    return this.employeesService.getEmployeeSummary('me', actor);
  }

  @Get(':id/summary')
  getSummary(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.employeesService.getEmployeeSummary(id, actor);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  create(
    @Body(new ZodValidationPipe(createEmployeeSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.employeesService.create(body, actor);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateEmployeeSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.employeesService.update(id, body, actor);
  }
}
