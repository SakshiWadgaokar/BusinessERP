'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { PermissionCode, ROLES, RoleCode } from '@erp/shared';
import { apiRequest, refreshAccessToken, setAuthTokens } from '@/lib/api-client';

export interface AuthProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  status: string;
  roles: RoleCode[];
  permissions: PermissionCode[];
  dealer: { id: string; dealerCode: string; businessName: string; status: string } | null;
  employee: { id: string; employeeCode: string; designation: string; status: string } | null;
  lastLoginAt: string | null;
}

interface AuthContextValue {
  user: AuthProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthProfile>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  can: (permission: PermissionCode) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    try {
      const token = await refreshAccessToken();
      if (!token) {
        setUser(null);
        return;
      }
      const profile = await apiRequest<AuthProfile>('/auth/me');
      setUser(profile);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiRequest<{
      accessToken: string;
      csrfToken: string;
      user: AuthProfile;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      skipAuthRefresh: true,
    });
    setAuthTokens(res.accessToken, res.csrfToken);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST', skipAuthRefresh: true });
    } catch {
      // Clear client state even if server session already expired
    } finally {
      setAuthTokens(null, null);
      setUser(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const profile = await apiRequest<AuthProfile>('/auth/me');
    setUser(profile);
  }, []);

  const can = useCallback(
    (permission: PermissionCode) => {
      if (!user) return false;
      if (user.roles.includes(ROLES.SUPER_ADMIN)) return true;
      return user.permissions.includes(permission);
    },
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshProfile, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
