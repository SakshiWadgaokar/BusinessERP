import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS, ROLES } from '@erp/shared';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const reflector = new Reflector();
  const guard = new PermissionsGuard(reflector);

  function mockContext(user: any, requiredPerms?: string[], isPublic = false): any {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) => {
      if (key === 'isPublic') return isPublic;
      if (key === 'requiredPermissions') return requiredPerms;
      return undefined;
    });
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    };
  }

  afterEach(() => jest.restoreAllMocks());

  it('allows public routes without authentication', () => {
    expect(guard.canActivate(mockContext(undefined, [PERMISSIONS.USERS_MANAGE], true))).toBe(true);
  });

  it('grants Super Admin access to any protected endpoint', () => {
    const superAdmin = {
      userId: 'u1',
      roles: [ROLES.SUPER_ADMIN],
      permissions: [],
    };
    expect(guard.canActivate(mockContext(superAdmin, [PERMISSIONS.PAYMENTS_REVERSE]))).toBe(true);
  });

  it('blocks Employee from recording financial payments', () => {
    const employee = {
      userId: 'u2',
      roles: [ROLES.EMPLOYEE],
      permissions: [PERMISSIONS.JOB_CARDS_READ, PERMISSIONS.JOB_CARDS_EXECUTE],
    };
    expect(() =>
      guard.canActivate(mockContext(employee, [PERMISSIONS.PAYMENTS_RECORD])),
    ).toThrow(ForbiddenException);
  });

  it('blocks Dealer from approving orders', () => {
    const dealer = {
      userId: 'u3',
      roles: [ROLES.DEALER],
      permissions: [PERMISSIONS.ORDERS_CREATE, PERMISSIONS.ORDERS_READ],
    };
    expect(() =>
      guard.canActivate(mockContext(dealer, [PERMISSIONS.ORDERS_APPROVE])),
    ).toThrow(ForbiddenException);
  });

  it('allows Accountant to record payments', () => {
    const accountant = {
      userId: 'u4',
      roles: [ROLES.ACCOUNTANT],
      permissions: [PERMISSIONS.PAYMENTS_RECORD, PERMISSIONS.PAYMENTS_VERIFY],
    };
    expect(guard.canActivate(mockContext(accountant, [PERMISSIONS.PAYMENTS_RECORD]))).toBe(true);
  });
});
