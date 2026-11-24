'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { PERMISSIONS, ROLES, UserStatus, createUserSchema } from '@erp/shared';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Search, UserCheck, UserX } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface UserRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  status: string;
  lastLoginAt: string | null;
  roles: Array<{ code: string; name: string }>;
}

type CreateUserForm = z.infer<typeof createUserSchema>;

export default function UsersAdminPage() {
  const { can } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: '20',
        ...(search ? { search } : {}),
      });
      const res = await apiRequest<{ data: UserRow[]; meta: { total: number } }>(`/users?${qs}`);
      setUsers(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      roleCodes: [ROLES.ADMIN_MANAGER],
      status: UserStatus.ACTIVE,
    },
  });

  const [selectedRole, setSelectedRole] = useState<string>(ROLES.ADMIN_MANAGER);

  const onCreate = async (values: CreateUserForm) => {
    setError(null);
    try {
      await apiRequest('/users', {
        method: 'POST',
        body: JSON.stringify({ ...values, roleCodes: [selectedRole] }),
      });
      reset();
      setShowModal(false);
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create user.');
    }
  };

  const toggleStatus = async (user: UserRow) => {
    const nextStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    if (
      !window.confirm(
        `Change ${user.fullName}'s status to ${nextStatus}? Deactivating immediately revokes active sessions.`,
      )
    ) {
      return;
    }
    try {
      await apiRequest(`/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update user status.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Users & Access Management</h2>
          <p className="text-sm text-slate-600">
            Create accounts, assign roles, and control active access across all portals.
          </p>
        </div>
        {can(PERMISSIONS.USERS_MANAGE) && (
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4" />
            Add User
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Registered Users ({total})</CardTitle>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Search name, email, phone..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                <tr>
                  <th className="px-6 py-3">User</th>
                  <th className="px-6 py-3">Roles</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Last Login</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                      Loading users...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                      No users found matching your filter.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3.5">
                        <p className="font-medium text-slate-900">{u.fullName}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((r) => (
                            <Badge key={r.code} variant="info">
                              {r.name}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge variant={u.status === 'ACTIVE' ? 'success' : 'danger'}>
                          {u.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-600">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-IN') : 'Never'}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        {can(PERMISSIONS.USERS_MANAGE) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toggleStatus(u)}
                          >
                            {u.status === 'ACTIVE' ? (
                              <>
                                <UserX className="h-3.5 w-3.5" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <UserCheck className="h-3.5 w-3.5" />
                                Activate
                              </>
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Create ERP User Account</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
                <Input label="Full Name" required error={errors.fullName?.message} {...register('fullName')} />
                <Input label="Email" type="email" required error={errors.email?.message} {...register('email')} />
                <Input label="Phone" error={errors.phone?.message} {...register('phone')} />
                <Input
                  label="Initial Password"
                  type="password"
                  required
                  hint="Min 10 chars with uppercase, lowercase, number, and symbol."
                  error={errors.password?.message}
                  {...register('password')}
                />
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Primary Role *</label>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                  >
                    {Object.values(ROLES).map((role) => (
                      <option key={role} value={role}>
                        {role.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" loading={isSubmitting}>
                    Create User
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
