'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema } from '@erp/shared';
import { z } from 'zod';
import { apiRequest, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

type FormValues = z.infer<typeof resetPasswordSchema>;

function ResetForm() {
  const params = useSearchParams();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token: params.get('token') || '' },
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(values),
        skipAuthRefresh: true,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to reset password.');
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardContent className="p-6 sm:p-8">
        <h1 className="text-xl font-bold text-slate-900">Set New Password</h1>
        {done ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Password reset successfully. All previous sessions have been revoked.
            </div>
            <Link href="/login" className="block text-center text-sm font-medium text-brand-600">
              Proceed to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <Input
              label="Reset Token"
              required
              error={errors.token?.message}
              {...register('token')}
            />
            <Input
              label="New Password"
              type="password"
              required
              hint="Min 10 characters with uppercase, lowercase, number, and special character."
              error={errors.newPassword?.message}
              {...register('newPassword')}
            />
            <Button type="submit" className="w-full" loading={isSubmitting}>
              Update Password
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <Suspense fallback={<div className="text-sm text-slate-500">Loading...</div>}>
        <ResetForm />
      </Suspense>
    </div>
  );
}
