import { Controller, Get, Query } from '@nestjs/common';
import { PERMISSIONS, paginationQuerySchema } from '@erp/shared';
import { z } from 'zod';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditLogsService } from './audit-logs.service';

const auditQuerySchema = paginationQuerySchema.extend({
  entityType: z.string().optional(),
  action: z.string().optional(),
  actorUserId: z.string().optional(),
});

@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_LOGS_READ)
  list(@Query(new ZodValidationPipe(auditQuerySchema)) query: any) {
    return this.auditLogsService.list(query);
  }
}
