import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import * as crypto from 'crypto';
import { AppModule } from './app.module';
import { getEnv } from './common/config/env';

async function bootstrap() {
  const env = getEnv();
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.use(
    pinoHttp({
      genReqId: (req) => (req.headers['x-request-id'] as string) || crypto.randomUUID(),
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      autoLogging: env.NODE_ENV !== 'test',
    }),
  );

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(cookieParser());

  app.enableCors({
    origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'Idempotency-Key', 'X-Request-Id'],
  });

  app.setGlobalPrefix(env.API_PREFIX);
  app.enableShutdownHooks();

  if (env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Business ERP API')
      .setDescription('Centralized REST API for Manufacturing & Distribution ERP')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(env.API_PORT);
  console.log(`Business ERP API listening on http://localhost:${env.API_PORT}/${env.API_PREFIX}`);
}

bootstrap();
