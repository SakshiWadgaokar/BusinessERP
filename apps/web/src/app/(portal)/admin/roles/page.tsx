'use client';

import React, { useEffect, useState } from 'react';
import { PERMISSIONS, ROLES } from '@erp/shared';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface RoleInfo {
  id: string;
  code: string;
  name: string;
  description: string;
  userCount: number;
  permissions: string[];
}

interface PermissionInfo {
  id: string;
  code: string;
  module: string;
  description: string;
}

export default function RolesAdminPage() {
  const { can } = useAuth();
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [permissions, setPermissions] = useState<PermissionInfo[]>([]);
  const [selectedRoleCode, setSelectedRoleCode] = useState<string>(ROLES.ADMIN_MANAGER);
  const [draftPerms, setDraftPerms] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiRequest<RoleInfo[]>('/roles'),
      apiRequest<PermissionInfo[]>('/roles/permissions'),
    ]).then(([r, p]) => {
      setRoles(r);
      setPermissions(p);
      const initial = r.find((x) => x.code === ROLES.ADMIN_MANAGER) || r[0];
      if (initial) {
        setSelectedRoleCode(initial.code);
        setDraftPerms(new Set(initial.permissions));
      }
    });
  }, []);

  const selectRole = (role: RoleInfo) => {
    setSelectedRoleCode(role.code);
    setDraftPerms(new Set(role.permissions));
    setFeedback(null);
  };

  const togglePerm = (code: string) => {
    if (selectedRoleCode === ROLES.SUPER_ADMIN) return;
    setDraftPerms((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const savePermissions = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await apiRequest(`/roles/${selectedRoleCode}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissionCodes: Array.from(draftPerms) }),
      });
      setRoles((prev) =>
        prev.map((r) =>
          r.code === selectedRoleCode ? { ...r, permissions: Array.from(draftPerms) } : r,
        ),
      );
      setFeedback('Role permissions saved and audit logged.');
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : 'Failed to update permissions.');
    } finally {
      setSaving(false);
    }
  };

  const grouped = permissions.reduce<Record<string, PermissionInfo[]>>((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});

  const selectedRole = roles.find((r) => r.code === selectedRoleCode);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Role-Based Access Control (RBAC)</h2>
        <p className="text-sm text-slate-600">
          Every permission is enforced server-side on all API endpoints.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-2 lg:col-span-4">
          {roles.map((role) => (
            <button
              key={role.code}
              onClick={() => selectRole(role)}
              className={`w-full rounded-xl border p-4 text-left transition-colors ${
                role.code === selectedRoleCode
                  ? 'border-brand-500 bg-brand-50/50 ring-1 ring-brand-500'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-900">{role.name}</p>
                <Badge variant="default">{role.userCount} users</Badge>
              </div>
              <p className="mt-1 text-xs text-slate-600">{role.description}</p>
            </button>
          ))}
        </div>

        <div className="lg:col-span-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{selectedRole?.name || 'Select Role'}</CardTitle>
                <CardDescription>
                  {selectedRoleCode === ROLES.SUPER_ADMIN
                    ? 'Super Admin always retains full system permissions.'
                    : `${draftPerms.size} permissions selected`}
                </CardDescription>
              </div>
              {can(PERMISSIONS.ROLES_MANAGE) && selectedRoleCode !== ROLES.SUPER_ADMIN && (
                <Button onClick={savePermissions} loading={saving}>
                  Save Changes
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-5">
              {feedback && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-800">
                  {feedback}
                </div>
              )}

              {Object.entries(grouped).map(([moduleName, perms]) => (
                <div key={moduleName} className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {moduleName.replace(/_/g, ' ')}
                  </h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {perms.map((p) => (
                      <label
                        key={p.code}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={draftPerms.has(p.code)}
                          disabled={
                            selectedRoleCode === ROLES.SUPER_ADMIN || !can(PERMISSIONS.ROLES_MANAGE)
                          }
                          onChange={() => togglePerm(p.code)}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="font-mono text-xs text-slate-800">{p.code}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
