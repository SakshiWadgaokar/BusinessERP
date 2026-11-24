import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { PERMISSIONS } from '@erp/shared';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('search')
  globalSearch(@Query('q') q: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.reportsService.globalSearch(q, actor);
  }

  @Get('sales-register')
  @RequirePermissions(PERMISSIONS.INVOICES_READ)
  getSalesRegister(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('search') search?: string,
  ) {
    return this.reportsService.getSalesRegister(dateFrom, dateTo, search);
  }

  @Get(':type')
  @RequirePermissions(PERMISSIONS.REPORTS_SALES)
  getReport(
    @Param('type') type: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.reportsService.getReportData(type, dateFrom, dateTo);
  }

  @Get(':type/export')
  @RequirePermissions(PERMISSIONS.REPORTS_SALES)
  async exportReport(
    @Param('type') type: string,
    @Query('format') format = 'csv',
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Res() res: Response,
  ) {
    if (format === 'xlsx') {
      const buf = await this.reportsService.exportExcel(type, dateFrom, dateTo);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename="${type}-report.xlsx"`);
      return res.send(buf);
    }
    if (format === 'pdf') {
      const buf = await this.reportsService.exportPdf(type, dateFrom, dateTo);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-report.pdf"`);
      return res.send(buf);
    }
    const csv = await this.reportsService.exportCsv(type, dateFrom, dateTo);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-report.csv"`);
    return res.send(csv);
  }
}
