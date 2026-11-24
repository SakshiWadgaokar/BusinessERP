'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema } from '@erp/shared';
import { z } from 'zod';
import { apiRequest, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

type FormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest<{ message: string; devResetToken?: string }>(
        '/auth/forgot-password',
        { method: 'POST', body: JSON.stringify(values), skipAuthRefresh: true },
      );
      setMessage(res.message);
      if (res.devResetToken) setDevToken(res.devResetToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to submit request.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 sm:p-8">
          <h1 className="text-xl font-bold text-slate-900">Reset Your Password</h1>
          <p className="mt-1 text-sm text-slate-600">
            Enter your registered email address to request a password reset token.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <p>{message}</p>
                {devToken && (
                  <p className="mt-2 break-all font-mono text-xs">
                    Dev Reset Token:{' '}
                    <Link
                      href={`/reset-password?token=${encodeURIComponent(devToken)}`}
                      className="underline"
                    >
                      Continue to Reset Password
                    </Link>
                  </p>
                )}
              </div>
            )}

            <Input
              label="Email Address"
              type="email"
              required
              error={errors.email?.message}
              {...register('email')}
            />

            <Button type="submit" className="w-full" loading={isSubmitting}>
              Request Reset Token
            </Button>

            <div className="text-center">
              <Link href="/login" className="text-sm font-medium text-brand-600 hover:underline">
                Back to Sign In
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
