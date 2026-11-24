import { BadRequestException, ConflictException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';
import { firstValueFrom, of } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';

describe('IdempotencyInterceptor (Unit)', () => {
  const reflector = new Reflector();
  const mockPrisma: any = {
    idempotencyKey: {
      findUnique: jest.fn(),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const interceptor = new IdempotencyInterceptor(reflector, mockPrisma);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
  });

  afterEach(() => jest.restoreAllMocks());

  function buildCtx(headers: Record<string, string>, body: any = { amount: '1000.00' }) {
    const res = {
      statusCode: 201,
      setHeader: jest.fn(),
      status: jest.fn(),
    };
    const req = {
      method: 'POST',
      originalUrl: '/api/v1/payments',
      headers,
      body,
      user: { userId: 'user-1' },
    };
    return {
      ctx: {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
      } as any,
      res,
    };
  }

  it('rejects missing Idempotency-Key header', () => {
    const { ctx } = buildCtx({});
    expect(() => interceptor.intercept(ctx, { handle: () => of({ ok: true }) })).toThrow(
      BadRequestException,
    );
  });

  it('replays cached response for duplicate payment submission', async () => {
    const body = { amount: '1000.00' };
    const hash = crypto
      .createHash('sha256')
      .update(`POST:/api/v1/payments:${JSON.stringify(body)}`)
      .digest('hex');

    mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
      key: 'user-1:idem-key-123456',
      requestHash: hash,
      responseStatus: 201,
      responseBody: { paymentId: 'pay-001' },
      expiresAt: new Date(Date.now() + 60_000),
    });

    const { ctx, res } = buildCtx({ 'idempotency-key': 'idem-key-123456' }, body);
    const handler = { handle: jest.fn(() => of({ paymentId: 'should-not-run' })) };

    const result = await firstValueFrom(interceptor.intercept(ctx, handler));
    expect(result).toEqual({ paymentId: 'pay-001' });
    expect(handler.handle).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('X-Idempotency-Replayed', 'true');
  });

  it('throws 409 Conflict when same Idempotency-Key is reused with different payload', async () => {
    mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
      key: 'user-1:idem-key-123456',
      requestHash: 'different-hash',
      responseStatus: 201,
      responseBody: { paymentId: 'pay-001' },
      expiresAt: new Date(Date.now() + 60_000),
    });

    const { ctx } = buildCtx({ 'idempotency-key': 'idem-key-123456' }, { amount: '5000.00' });
    await expect(
      firstValueFrom(interceptor.intercept(ctx, { handle: () => of({}) })),
    ).rejects.toThrow(ConflictException);
  });
});
