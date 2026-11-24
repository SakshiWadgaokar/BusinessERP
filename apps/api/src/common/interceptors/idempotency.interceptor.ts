import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';
import { Observable, from, of, switchMap, tap } from 'rxjs';
import { IDEMPOTENT_KEY } from '../decorators/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../types/auth-user.type';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const isIdempotent = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isIdempotent) return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest();
    const response = http.getResponse();
    const rawKey = request.headers['idempotency-key'];
    const key = typeof rawKey === 'string' ? rawKey.trim() : '';

    if (!key || key.length < 8 || key.length > 128) {
      throw new BadRequestException({
        errorCode: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header (8–128 chars) is required for this operation.',
      });
    }

    const user: AuthenticatedUser | undefined = request.user;
    const scopedKey = `${user?.userId || 'anon'}:${key}`;
    const requestHash = crypto
      .createHash('sha256')
      .update(`${request.method}:${request.originalUrl}:${JSON.stringify(request.body ?? {})}`)
      .digest('hex');

    return from(
      this.prisma.idempotencyKey.findUnique({
        where: { key: scopedKey },
      }),
    ).pipe(
      switchMap((existing) => {
        if (existing && existing.expiresAt > new Date()) {
          if (existing.requestHash !== requestHash) {
            throw new ConflictException({
              errorCode: 'IDEMPOTENCY_KEY_CONFLICT',
              message: 'This Idempotency-Key was already used with a different request payload.',
            });
          }
          response.setHeader('X-Idempotency-Replayed', 'true');
          response.status(existing.responseStatus);
          return of(existing.responseBody);
        }

        return next.handle().pipe(
          tap((data) => {
            const statusCode = response.statusCode || 200;
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            void this.prisma.idempotencyKey
              .upsert({
                where: { key: scopedKey },
                update: {
                  requestHash,
                  responseStatus: statusCode,
                  responseBody: (data ?? {}) as any,
                  expiresAt,
                },
                create: {
                  key: scopedKey,
                  userId: user?.userId || 'anon',
                  method: request.method,
                  path: String(request.originalUrl).slice(0, 255),
                  requestHash,
                  responseStatus: statusCode,
                  responseBody: (data ?? {}) as any,
                  expiresAt,
                },
              })
              .catch(() => {
                // Non-blocking persistence error handled safely
              });
          }),
        );
      }),
    );
  }
}
