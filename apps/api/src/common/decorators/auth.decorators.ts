import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PermissionCode } from '@erp/shared';
import { AuthenticatedUser } from '../types/auth-user.type';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'requiredPermissions';
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const IDEMPOTENT_KEY = 'requireIdempotency';
export const RequireIdempotency = () => SetMetadata(IDEMPOTENT_KEY, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthenticatedUser;
  },
);
