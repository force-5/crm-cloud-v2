import * as React from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { AlertCircle, MailCheck } from 'lucide-react';
import { ERROR_CODES, forgotPasswordSchema, resetPasswordSchema, verifyRecoveryCodeSchema } from '@crm/contracts';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/misc';
import { useApi } from '@/lib/api';
import { errorMessage, isApiError } from '@/lib/errors';
import { AuthHeading } from './AuthLayout';
import { PasswordChecklist, PasswordInput } from './PasswordInput';

type Step = 'email' | 'code' | 'password';

/** Errors that must not reveal whether the email exists: anything but transport/outage problems. */
function isEnumerationSafe(err: unknown): boolean {
  if (!isApiError(err)) return false;
  return err.status > 0 && err.status < 500 && err.code !== ERROR_CODES.RATE_LIMITED;
}

function StepIndicator({ step }: { step: Step }) {
  const { t } = useTranslation('auth');
  const n = step === 'email' ? 1 : step === 'code' ? 2 : 3;
  return (
    <div className="mb-3 flex items-center gap-2" aria-hidden="false">
      <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-text-muted">{t('forgot.step', { n })}</span>
      <span className="flex gap-1" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-1 w-6 rounded-full ${i <= n ? 'bg-primary' : 'bg-border-strong'}`} />
        ))}
      </span>
    </div>
  );
}

const codeOnly = verifyRecoveryCodeSchema.pick({ code: true });
type PasswordValues = { password: string; passwordConfirmation: string };

export function ForgotPasswordPage() {
  const { t } = useTranslation('auth');
  const api = useApi();
  const navigate = useNavigate();
  const [step, setStep] = React.useState<Step>('email');
  const [email, setEmail] = React.useState('');
  const [code, setCode] = React.useState('');
  const [sentNotice, setSentNotice] = React.useState(false);

  // ---- step 1 ----
  const emailForm = useForm<z.infer<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });
  const send = useMutation({
    mutationFn: (value: string) => api.auth.forgotPassword(value),
  });
  const onEmail = async ({ email: value }: { email: string }) => {
    try {
      await send.mutateAsync(value);
    } catch (err) {
      if (!isEnumerationSafe(err)) return; // outage → show the error, stay on step 1
    }
    // Same outcome whether or not the email exists.
    setEmail(value);
    setSentNotice(true);
    setStep('code');
  };

  // ---- step 2 ----
  const codeForm = useForm<z.infer<typeof codeOnly>>({ resolver: zodResolver(codeOnly), defaultValues: { code: '' } });
  const verify = useMutation({
    mutationFn: (value: string) => api.auth.verifyRecoveryCode(email, value),
    onSuccess: (_r, value) => {
      setCode(value);
      setSentNotice(false);
      setStep('password');
    },
  });

  // ---- step 3 ----
  const pwForm = useForm<PasswordValues>({
    defaultValues: { password: '', passwordConfirmation: '' },
  });
  const password = useWatch({ control: pwForm.control, name: 'password' });
  const reset = useMutation({
    mutationFn: (v: PasswordValues) => api.auth.resetPassword({ email, code, ...v }),
    onSuccess: async () => {
      toast.success(t('forgot.success'));
      await navigate({ to: '/login' });
    },
  });
  const onPassword = (v: PasswordValues) => {
    const parsed = resetPasswordSchema.safeParse({ email, code, ...v });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'password' || key === 'passwordConfirmation') pwForm.setError(key, { message: issue.message });
      }
      return;
    }
    reset.mutate(v);
  };

  const startOver = () => {
    send.reset();
    verify.reset();
    codeForm.reset();
    setSentNotice(false);
    setStep('email');
  };

  return (
    <>
      <StepIndicator step={step} />
      <AuthHeading
        title={t('forgot.title')}
        lead={step === 'email' ? t('forgot.emailLead') : step === 'code' ? t('forgot.codeLead') : t('forgot.newPasswordLead', { email })}
      />

      {step === 'email' && (
        <form noValidate onSubmit={emailForm.handleSubmit(onEmail)} className="space-y-5">
          {send.isError && !isEnumerationSafe(send.error) && (
            <Notice tone="danger" icon={<AlertCircle />} role="alert">
              {errorMessage(send.error)}
            </Notice>
          )}
          <Field label={t('forgot.email')} error={emailForm.formState.errors.email?.message}>
            {(p) => (
              <Input {...p} {...emailForm.register('email')} type="email" autoComplete="username" inputMode="email" autoCapitalize="none" autoFocus maxLength={100} />
            )}
          </Field>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={send.isPending}>
            {t('forgot.sendCode')}
          </Button>
        </form>
      )}

      {step === 'code' && (
        <form noValidate onSubmit={codeForm.handleSubmit(({ code: c }) => verify.mutate(c))} className="space-y-5">
          {sentNotice && (
            <Notice tone="primary" icon={<MailCheck />} role="status">
              {t('forgot.sentNotice', { email })}
            </Notice>
          )}
          {verify.isError && (
            <Notice tone="danger" icon={<AlertCircle />} role="alert">
              {isEnumerationSafe(verify.error) ? t('forgot.codeInvalid') : errorMessage(verify.error)}
            </Notice>
          )}
          <Field label={t('forgot.code')} error={codeForm.formState.errors.code?.message}>
            {(p) => <Input {...p} {...codeForm.register('code')} autoComplete="one-time-code" inputMode="text" autoCapitalize="none" autoFocus maxLength={64} />}
          </Field>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={verify.isPending}>
            {t('forgot.verify')}
          </Button>
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="link" onClick={startOver}>
              {t('forgot.useDifferentEmail')}
            </Button>
            <Button variant="link" onClick={() => void onEmail({ email })} disabled={send.isPending}>
              {t('forgot.resend')}
            </Button>
          </div>
        </form>
      )}

      {step === 'password' && (
        <form noValidate onSubmit={pwForm.handleSubmit(onPassword)} className="space-y-5">
          {reset.isError && (
            <Notice tone="danger" icon={<AlertCircle />} role="alert">
              {errorMessage(reset.error)}
            </Notice>
          )}
          <Field label={t('forgot.newPassword')} error={pwForm.formState.errors.password?.message}>
            {(p) => (
              <>
                <PasswordInput
                  {...p}
                  aria-describedby={[p['aria-describedby'], 'password-rules'].filter(Boolean).join(' ')}
                  {...pwForm.register('password')}
                  autoComplete="new-password"
                  autoFocus
                />
                <PasswordChecklist password={password ?? ''} id="password-rules" />
              </>
            )}
          </Field>
          <Field label={t('forgot.confirmPassword')} error={pwForm.formState.errors.passwordConfirmation?.message}>
            {(p) => <PasswordInput {...p} {...pwForm.register('passwordConfirmation')} autoComplete="new-password" />}
          </Field>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={reset.isPending}>
            {t('forgot.save')}
          </Button>
        </form>
      )}

      <div className="mt-6 text-center">
        <Link to="/login" className="text-[13px] font-bold text-text-muted hover:text-primary-ink hover:underline">
          {t('forgot.backToLogin')}
        </Link>
      </div>
    </>
  );
}
