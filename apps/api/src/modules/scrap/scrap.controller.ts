import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  PERMISSIONS,
  createScrapRecordSchema,
  disposeScrapSchema,
  paginationQuerySchema,
  verifyScrapSchema,
} from '@erp/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { ScrapService } from './scrap.service';

const scrapQuery = paginationQuerySchema.extend({
  status: z.string().optional(),
  category: z.string().optional(),
  jobCardId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
});

@Controller('scrap')
export class ScrapController {
  constructor(private readonly scrapService: ScrapService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SCRAP_READ)
  list(
    @Query(new ZodValidationPipe(scrapQuery)) query: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.scrapService.list(query, actor);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.SCRAP_READ)
  summary(@Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.scrapService.getSummary(dateFrom, dateTo);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SCRAP_RECORD)
  record(
    @Body(new ZodValidationPipe(createScrapRecordSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.scrapService.recordScrap(body, actor);
  }

  @Post(':id/verify')
  @RequirePermissions(PERMISSIONS.SCRAP_VERIFY)
  verify(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(verifyScrapSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.scrapService.verifyScrap(id, body, actor);
  }

  @Post(':id/dispose')
  @RequirePermissions(PERMISSIONS.SCRAP_DISPOSE)
  dispose(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(disposeScrapSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.scrapService.disposeScrap(id, body, actor);
  }
}
