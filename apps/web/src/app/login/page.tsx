'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoginInput, loginSchema } from '@erp/shared';
import { AlertCircle, Boxes, Calculator, Factory, Shield, Store } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

const PORTAL_SHORTCUTS = [
  {
    label: 'Admin Portal',
    sub: 'Owner / Full ERP',
    email: 'owner@businesserp.local',
    icon: Shield,
  },
  {
    label: 'Dealer Portal',
    sub: 'Orders, Bills & Ledger',
    email: 'dealer@businesserp.local',
    icon: Store,
  },
  {
    label: 'Employee / Factory',
    sub: 'Job Cards, Output & Scrap',
    email: 'employee@businesserp.local',
    icon: Factory,
  },
  {
    label: 'Accountant',
    sub: 'Payments, Invoices & Tax',
    email: 'accountant@businesserp.local',
    icon: Calculator,
  },
  {
    label: 'Inventory Manager',
    sub: 'Warehouses & Stock',
    email: 'inventory@businesserp.local',
    icon: Boxes,
  },
];

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [selectedPortal, setSelectedPortal] = useState('Admin Portal');

  const {
    register,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const selectPortal = (p: (typeof PORTAL_SHORTCUTS)[number]) => {
    setSelectedPortal(p.label);
    setValue('email', p.email, { shouldValidate: true });
    setServerError(null);
  };

  const onSubmit = async (values: LoginInput) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError('Unable to reach server. Please try again.');
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#1b2a4a] text-white shadow-sm">
            <Shield className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Business ERP
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Unified Login — Automatically opens your Admin, Dealer, Employee, Accountant, or Inventory Portal
          </p>
        </div>

        {/* Portal Role Selector */}
        <div className="mb-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {PORTAL_SHORTCUTS.map((p) => {
            const Icon = p.icon;
            const active = selectedPortal === p.label;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => selectPortal(p)}
                className={`rounded-xl border p-3 text-left transition-all ${
                  active
                    ? 'border-brand-600 bg-brand-50/70 ring-1 ring-brand-600'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-brand-600' : 'text-slate-500'}`} />
                <p className="mt-1.5 text-xs font-semibold text-slate-900">{p.label}</p>
                <p className="text-[10px] leading-tight text-slate-500">{p.sub}</p>
              </button>
            );
          })}
        </div>

        <Card className="mx-auto max-w-md">
          <CardContent className="p-6 sm:p-8">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-brand-600">
              Signing into: {selectedPortal}
            </p>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
              {serverError && (
                <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{serverError}</span>
                </div>
              )}

              <Input
                label="Email Address"
                type="email"
                autoComplete="email"
                placeholder="name@company.com"
                required
                error={errors.email?.message}
                {...register('email')}
              />

              <Input
                label="Password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                required
                error={errors.password?.message}
                {...register('password')}
              />

              <div className="flex items-center justify-between text-sm">
                <span className="text-xs text-slate-500">Protected by RBAC & Audit Logging</span>
                <Link
                  href="/forgot-password"
                  className="font-medium text-brand-600 hover:text-brand-700"
                >
                  Forgot password?
                </Link>
              </div>

              <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
                Sign In to {selectedPortal}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-slate-500">
          Business ERP
        </p>
      </div>
    </div>
  );
}
