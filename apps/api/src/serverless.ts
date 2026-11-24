import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express, { Express, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { getEnv } from './common/config/env';

let cachedExpressApp: Express | null = null;
let initPromise: Promise<Express> | null = null;

async function bootstrapServerless(): Promise<Express> {
  if (cachedExpressApp) return cachedExpressApp;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const env = getEnv();
    const expressApp = express();
    const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
      logger: ['error', 'warn', 'log'],
    });

    app.use(
      helmet({
        crossOriginResourcePolicy: { policy: 'same-site' },
      }),
    );
    app.use(cookieParser());

    const allowedOrigins = env.CORS_ORIGIN.split(',')
      .map((o) => o.trim())
      .filter(Boolean);

    app.enableCors({
      origin: allowedOrigins.includes('*') ? true : allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'Idempotency-Key', 'X-Request-Id'],
    });

    app.setGlobalPrefix(env.API_PREFIX);
    await app.init();

    cachedExpressApp = expressApp;
    return expressApp;
  })();

  try {
    return await initPromise;
  } catch (err) {
    initPromise = null;
    throw err;
  }
}

export async function handleVercelRequest(req: Request, res: Response) {
  const expressApp = await bootstrapServerless();
  return expressApp(req, res);
}
