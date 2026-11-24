import { PermissionCode, RoleCode } from '@erp/shared';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  fullName: string;
  roles: RoleCode[];
  permissions: PermissionCode[];
  dealerId: string | null;
  employeeId: string | null;
  sessionId: string;
}
