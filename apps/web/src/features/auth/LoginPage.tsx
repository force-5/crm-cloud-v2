import * as React from 'react';
import { Link } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Clock } from 'lucide-react';
import { loginRequestSchema, type LoginRequest } from '@crm/contracts';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/misc';
import { useApi } from '@/lib/api';
import { AuthHeading } from './AuthLayout';
import { PasswordInput } from './PasswordInput';
import { loginErrorMessage, useHandleLoginResult } from './useLoginFlow';

export function LoginPage({ redirect, reason }: { redirect?: string; reason?: 'timeout' }) {
  const { t } = useTranslation('auth');
  const api = useApi();
  const handleResult = useHandleLoginResult(redirect);
  const errorRef = React.useRef<HTMLDivElement>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { email: '', password: '' },
  });

  const login = useMutation({
    mutationFn: (body: LoginRequest) => api.auth.login(body),
    onSuccess: handleResult,
    onError: () => {
      setValue('password', '');
      requestAnimationFrame(() => errorRef.current?.focus());
    },
  });

  return (
    <>
      <AuthHeading title={t('login.title')} lead={t('login.lead')} />
      {reason === 'timeout' && !login.isError && (
        <Notice tone="info" icon={<Clock />} className="mb-5" role="status">
          {t('login.timeout')}
        </Notice>
      )}
      {login.isError && (
        <Notice tone="danger" icon={<AlertCircle />} className="mb-5" role="alert" tabIndex={-1} ref={errorRef}>
          {loginErrorMessage(login.error)}
        </Notice>
      )}
      <form noValidate onSubmit={handleSubmit((v) => login.mutate(v))} className="space-y-4">
        <Field label={t('login.email')} error={errors.email?.message}>
          {(p) => (
            <Input
              {...p}
              {...register('email')}
              type="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={50}
              autoFocus
              className="md:h-11"
            />
          )}
        </Field>
        <div>
          <Field label={t('login.password')} error={errors.password?.message}>
            {(p) => <PasswordInput {...p} {...register('password')} autoComplete="current-password" className="md:h-11" />}
          </Field>
          <div className="mb-6 mt-2.5 flex justify-end">
            <Link
              to="/forgot-password"
              className="inline-flex min-h-8 items-center rounded-sm text-[12px] font-bold text-text-muted hover:text-primary-ink hover:underline"
            >
              {t('login.forgot')}
            </Link>
          </div>
        </div>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={login.isPending}>
          {login.isPending ? t('login.submitting') : t('login.submit')}
        </Button>
      </form>
    </>
  );
}
