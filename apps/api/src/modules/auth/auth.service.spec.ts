import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

// Ensure test env vars exist before getEnv() runs
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/business_erp';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_access_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test_refresh_secret_32_characters_long';
process.env.CSRF_SECRET = process.env.CSRF_SECRET || 'test_csrf_secret_32_characters_long_xx';
process.env.STORAGE_SIGNED_URL_SECRET =
  process.env.STORAGE_SIGNED_URL_SECRET || 'test_storage_secret_32_characters_long';

describe('AuthService (Unit)', () => {
  const mockPrisma: any = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    userSession: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((fn: any) => fn(mockPrisma)),
  };
  const mockAudit: any = { record: jest.fn() };
  const jwtService = new JwtService({});
  const authService = new AuthService(mockPrisma, jwtService, mockAudit);

  beforeEach(() => jest.clearAllMocks());

  it('hashes and verifies passwords using Argon2id', async () => {
    const hash = await authService.hashPassword('StrongPass@2026!');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await authService.verifyPassword(hash, 'StrongPass@2026!')).toBe(true);
    expect(await authService.verifyPassword(hash, 'WrongPass@2026!')).toBe(false);
  });

  it('locks account after configured failed login attempts', async () => {
    const hash = await authService.hashPassword('CorrectPass@2026!');
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-lock',
      email: 'user@company.com',
      fullName: 'Test User',
      status: 'ACTIVE',
      passwordHash: hash,
      failedLoginAttempts: 4, // 5th failure triggers lockout
      lockedUntil: null,
      userRoles: [],
      permissionOverrides: [],
      dealer: null,
      employee: null,
    });

    await expect(
      authService.login('user@company.com', 'WrongPassword!', {}),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-lock' },
        data: expect.objectContaining({
          failedLoginAttempts: 0,
          lockedUntil: expect.any(Date),
        }),
      }),
    );
    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUTH_ACCOUNT_LOCKED' }),
    );
  });

  it('rejects login while account is locked', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-locked',
      email: 'locked@company.com',
      status: 'ACTIVE',
      failedLoginAttempts: 0,
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      userRoles: [],
      permissionOverrides: [],
      dealer: null,
      employee: null,
    });

    await expect(
      authService.login('locked@company.com', 'Anything123!', {}),
    ).rejects.toThrow(ForbiddenException);
  });
});
