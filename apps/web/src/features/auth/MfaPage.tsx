import * as React from 'react';
import { Link, Navigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';
import { mfaVerifySchema } from '@crm/contracts';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/misc';
import { useApi } from '@/lib/api';
import { errorMessage, isApiError } from '@/lib/errors';
import { AuthHeading } from './AuthLayout';
import { CodeInput } from './CodeInput';
import { loginErrorMessage, useHandleLoginResult, usePendingLogin } from './useLoginFlow';

export const RESEND_COOLDOWN_S = 30;

function useCooldown(initial: number) {
  const [left, setLeft] = React.useState(initial);
  React.useEffect(() => {
    if (left <= 0) return;
    const id = window.setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [left]);
  return [left, () => setLeft(RESEND_COOLDOWN_S)] as const;
}

export function MfaPage({ redirect }: { redirect?: string }) {
  const { t } = useTranslation('auth');
  const api = useApi();
  const pending = usePendingLogin();
  const handleResult = useHandleLoginResult(redirect);
  const [code, setCode] = React.useState('');
  const [cooldown, restartCooldown] = useCooldown(RESEND_COOLDOWN_S);
  const headingId = React.useId();

  const verify = useMutation({
    mutationFn: (passcode: string) => api.auth.verifyMfa({ passcode }),
    onSuccess: handleResult,
    onError: () => setCode(''),
  });
  const resend = useMutation({
    mutationFn: () => api.auth.sendMfa(),
    onSuccess: () => {
      toast.success(t('mfa.resent'));
      restartCooldown();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (pending?.step !== 'mfa') return <Navigate to="/login" search={{ redirect }} replace />;

  const submit = (value: string) => {
    if (!mfaVerifySchema.safeParse({ passcode: value }).success || verify.isPending) return;
    verify.mutate(value);
  };

  const lead =
    pending.channel === 'totp'
      ? t('mfa.leadTotp')
      : pending.destination
        ? t('mfa.leadSms', { destination: pending.destination })
        : t('mfa.leadSmsNoDest');

  const verifyError = verify.error;
  const wrongCode = isApiError(verifyError) && (verifyError.status === 400 || verifyError.status === 401 || verifyError.code === 'VALIDATION');

  return (
    <>
      <AuthHeading title={t('mfa.title')} lead={lead} />
      {verify.isError && (
        <Notice tone="danger" icon={<AlertCircle />} className="mb-4" role="alert">
          {wrongCode ? t('mfa.invalid') : loginErrorMessage(verifyError)}
        </Notice>
      )}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit(code);
        }}
      >
        <p id={headingId} className="m-0 mb-2 text-[12px] font-bold text-text-muted">
          {t('mfa.code')}
        </p>
        <CodeInput value={code} onChange={setCode} onComplete={submit} invalid={verify.isError} disabled={verify.isPending} labelledBy={headingId} />
        <Button type="submit" variant="primary" size="lg" className="mt-6 w-full" loading={verify.isPending} disabled={code.length !== 6}>
          {t('mfa.submit')}
        </Button>
      </form>
      <div className="mt-5 flex flex-col items-center gap-2">
        {pending.channel === 'sms' && (
          <Button variant="ghost" onClick={() => resend.mutate()} disabled={cooldown > 0} loading={resend.isPending}>
            {cooldown > 0 ? t('mfa.resendIn', { seconds: cooldown }) : t('mfa.resend')}
          </Button>
        )}
        <Link to="/login" search={{ redirect }} className="text-[13px] font-bold text-text-muted hover:text-primary-ink hover:underline">
          {t('mfa.back')}
        </Link>
      </div>
    </>
  );
}
