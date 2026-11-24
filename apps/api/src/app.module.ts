import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { getEnv } from './common/config/env';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DealersModule } from './modules/dealers/dealers.module';
import { OrdersModule } from './modules/orders/orders.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PurchasingModule } from './modules/purchasing/purchasing.module';
import { FinanceModule } from './modules/finance/finance.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { ManufacturingModule } from './modules/manufacturing/manufacturing.module';
import { ScrapModule } from './modules/scrap/scrap.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ReportsModule } from './modules/reports/reports.module';
import { OffersModule } from './modules/offers/offers.module';

const env = getEnv();

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: env.RATE_LIMIT_TTL_SECONDS * 1000,
        limit: env.RATE_LIMIT_MAX_REQUESTS,
      },
    ]),
    PrismaModule,
    CommonModule,
    RealtimeModule,
    NotificationsModule,
    HealthModule,
    AuthModule,
    UsersModule,
    RolesModule,
    SettingsModule,
    AuditLogsModule,
    DealersModule,
    OrdersModule,
    InventoryModule,
    PurchasingModule,
    FinanceModule,
    DocumentsModule,
    EmployeesModule,
    ManufacturingModule,
    ScrapModule,
    AnalyticsModule,
    ReportsModule,
    OffersModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
