import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../../common/decorators/auth.decorators';
import { PrismaService } from '../../common/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  liveness() {
    return {
      status: 'ok',
      service: 'business-erp-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('ready')
  async readiness() {
    const dbHealthy = await this.prisma.isHealthy();
    if (!dbHealthy) {
      throw new ServiceUnavailableException({
        status: 'degraded',
        database: 'down',
        timestamp: new Date().toISOString(),
      });
    }
    return {
      status: 'ready',
      database: 'up',
      timestamp: new Date().toISOString(),
    };
  }
}
