import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  PERMISSIONS,
  createCreditNoteSchema,
  createExpenseSchema,
  dealerSubmitPaymentSchema,
  paginationQuerySchema,
  recordPaymentSchema,
  reversePaymentSchema,
  verifyPaymentDecisionSchema,
} from '@erp/shared';
import { z } from 'zod';
import {
  CurrentUser,
  RequireIdempotency,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { FinanceService } from './finance.service';

const financeListQuery = paginationQuerySchema.extend({
  dealerId: z.string().uuid().optional(),
  status: z.string().optional(),
  categoryId: z.string().uuid().optional(),
});

@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('summary')
  @RequirePermissions(PERMISSIONS.REPORTS_FINANCE)
  getSummary(@Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.financeService.getFinanceSummary(dateFrom, dateTo);
  }

  @Get('invoices')
  @RequirePermissions(PERMISSIONS.INVOICES_READ)
  listInvoices(
    @Query(new ZodValidationPipe(financeListQuery)) query: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.financeService.listInvoices(query, actor);
  }

  @Get('invoices/:id')
  @RequirePermissions(PERMISSIONS.INVOICES_READ)
  findInvoice(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.financeService.findInvoice(id, actor);
  }

  @Get('ledger/:dealerId')
  @RequirePermissions(PERMISSIONS.LEDGER_READ)
  getDealerLedger(
    @Param('dealerId') dealerId: string,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.financeService.getDealerLedger(dealerId, query, actor);
  }

  @Get('payments')
  @RequirePermissions(PERMISSIONS.PAYMENTS_READ)
  listPayments(
    @Query(new ZodValidationPipe(financeListQuery)) query: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.financeService.listPayments(query, actor);
  }

  @Post('payments')
  @RequirePermissions(PERMISSIONS.PAYMENTS_RECORD)
  @RequireIdempotency()
  recordPayment(
    @Body(new ZodValidationPipe(recordPaymentSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.financeService.recordPayment(body, actor);
  }

  @Post('payments/dealer-submit')
  @RequirePermissions(PERMISSIONS.PAYMENTS_READ)
  @RequireIdempotency()
  dealerSubmitPayment(
    @Body(new ZodValidationPipe(dealerSubmitPaymentSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.financeService.dealerSubmitPayment(body, actor);
  }

  @Post('payments/:id/verify')
  @RequirePermissions(PERMISSIONS.PAYMENTS_VERIFY)
  verifyDealerPayment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(verifyPaymentDecisionSchema)) body: { action: 'VERIFY' | 'REJECT'; reason?: string | null },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.financeService.verifyDealerPayment(id, body, actor);
  }

  @Post('payments/:id/reverse')
  @RequirePermissions(PERMISSIONS.PAYMENTS_REVERSE)
  reversePayment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reversePaymentSchema)) body: { reason: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.financeService.reversePayment(id, body.reason, actor);
  }

  @Post('credit-notes')
  @RequirePermissions(PERMISSIONS.CREDIT_NOTES_MANAGE)
  @RequireIdempotency()
  createCreditNote(
    @Body(new ZodValidationPipe(createCreditNoteSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.financeService.createCreditNote(body, actor);
  }

  @Get('expense-categories')
  @RequirePermissions(PERMISSIONS.EXPENSES_READ)
  listExpenseCategories() {
    return this.financeService.listExpenseCategories();
  }

  @Get('expenses')
  @RequirePermissions(PERMISSIONS.EXPENSES_READ)
  listExpenses(@Query(new ZodValidationPipe(financeListQuery)) query: any) {
    return this.financeService.listExpenses(query);
  }

  @Post('expenses')
  @RequirePermissions(PERMISSIONS.EXPENSES_MANAGE)
  createExpense(
    @Body(new ZodValidationPipe(createExpenseSchema)) body: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.financeService.createExpense(body, actor);
  }
}
