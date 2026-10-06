import * as React from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import { Copy, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import type { CurrentUser, MfaType, TotpEnrollment } from '@crm/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardTitle, Notice } from '@/components/ui/misc';
import { SwitchRow } from '@/components/ui/switch';
import { Segmented } from '@/components/ui/tabs';
import { useApi } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { usePatchUser } from './api';

function TotpSetup({ enrollment, onDone, saving }: { enrollment: TotpEnrollment; onDone: () => void; saving: boolean }) {
  const { t } = useTranslation('profile');
  const [qr, setQr] = React.useState<string | null>(null);
  React.useEffect(() => {
    let alive = true;
    QRCode.toDataURL(enrollment.uri, { margin: 1, width: 220, errorCorrectionLevel: 'M' })
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [enrollment.uri]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      toast.success(t('security.copied'));
    } catch {
      /* clipboard blocked — the key is still selectable */
    }
  };

  return (
    <div className="mt-4 rounded-[10px] border border-border p-4">
      <p className="m-0 mb-1 font-black text-text">{t('security.totpTitle')}</p>
      <p className="m-0 text-[13px] text-text-muted">{t('security.totpStep1')}</p>
      <div className="my-4 flex justify-center sm:justify-start">
        <div className="grid size-[236px] place-items-center rounded-[10px] border border-border bg-white p-2">
          {qr ? <img src={qr} alt={t('security.totpQrAlt')} width={220} height={220} /> : null}
        </div>
      </div>
      <p className="m-0 text-[13px] text-text-muted">{t('security.totpStep2')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="select-all break-all rounded-md bg-surface-muted px-2.5 py-2 font-mono text-[13px] tracking-[0.08em] text-text">{enrollment.secret}</code>
        <Button size="sm" variant="secondary" onClick={() => void copy()}>
          <Copy aria-hidden="true" />
          {t('security.copy')}
        </Button>
      </div>
      <p className="m-0 mt-3 text-[12px] text-text-muted">{t('security.totpPendingVerify')}</p>
      <Button className="mt-4 w-full sm:w-auto" variant="primary" onClick={onDone} loading={saving}>
        {t('security.totpDone')}
      </Button>
    </div>
  );
}

export function SecurityTab({ user }: { user: CurrentUser }) {
  const { t } = useTranslation('profile');
  const api = useApi();
  const patchUser = usePatchUser();
  const required = user.tenant.requireMfa;
  const enabled = required || user.mfaEnabled;
  const method: MfaType = user.mfaType ?? 'sms';
  const [enrollment, setEnrollment] = React.useState<TotpEnrollment | null>(null);

  const prefs = useMutation({
    mutationFn: (body: { mfaEnabled?: boolean; mfaType?: MfaType }) => api.profile.preferences(body),
    onMutate: (body) => {
      const prev = { mfaEnabled: user.mfaEnabled, mfaType: user.mfaType };
      patchUser(body);
      return { prev };
    },
    onError: (err, _b, ctx) => {
      if (ctx) patchUser(ctx.prev);
      toast.error(errorMessage(err));
    },
    onSuccess: (res, body) => {
      patchUser({ mfaEnabled: res.user.mfaEnabled, mfaType: res.user.mfaType });
      if (body.mfaEnabled !== undefined && body.mfaType === undefined) {
        toast.success(body.mfaEnabled ? t('security.enabled') : t('security.disabled'));
      } else {
        toast.success(t('security.methodSaved'));
      }
    },
  });

  const enroll = useMutation({
    mutationFn: () => api.profile.enrollTotp(),
    onSuccess: setEnrollment,
    onError: (err) => toast.error(errorMessage(err)),
  });

  const chooseMethod = (next: MfaType) => {
    if (next === method) return;
    if (next === 'totp') {
      enroll.mutate();
      return;
    }
    setEnrollment(null);
    prefs.mutate({ mfaEnabled: true, mfaType: 'sms' });
  };

  return (
    <div className="grid max-w-[800px] gap-4">
      <Card>
        <CardTitle className="mb-2 flex items-center gap-2">
          <ShieldCheck className="size-[18px] text-text-muted" aria-hidden="true" />
          {t('security.mfaTitle')}
        </CardTitle>
        <SwitchRow
          id="mfa-enabled"
          label={
            <span className="flex flex-wrap items-center gap-2">
              {t('security.mfaEnable')}
              {required && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-black text-primary-soft-text">
                  <Lock className="size-3" aria-hidden="true" />
                  {t('security.required')}
                </span>
              )}
            </span>
          }
          description={required ? t('security.requiredHint') : t('security.mfaHint')}
          checked={enabled}
          disabled={required || prefs.isPending}
          onCheckedChange={(checked) => {
            if (!checked) setEnrollment(null);
            prefs.mutate({ mfaEnabled: checked });
          }}
        />
        {enabled && (
          <div className="mt-3">
            <p className="m-0 mb-1.5 text-[12px] font-bold text-text-muted" id="mfa-method-label">
              {t('security.method')}
            </p>
            <Segmented
              label={t('security.method')}
              value={enrollment ? 'totp' : method}
              onValueChange={chooseMethod}
              className="w-full sm:w-auto"
              options={[
                { value: 'sms', label: t('security.sms') },
                { value: 'totp', label: t('security.totp') },
              ]}
            />
            {method === 'sms' && !enrollment && (
              <p className="m-0 mt-2.5 text-[13px] text-text-muted">
                {user.mobilePhone ? t('security.smsTo', { phone: user.mobilePhone }) : t('security.smsNoPhone')}
              </p>
            )}
            {method === 'totp' && !enrollment && (
              <Button className="mt-3" variant="secondary" size="sm" onClick={() => enroll.mutate()} loading={enroll.isPending}>
                <KeyRound aria-hidden="true" />
                {t('security.totpStart')}
              </Button>
            )}
            {enrollment && (
              <TotpSetup
                enrollment={enrollment}
                saving={prefs.isPending}
                onDone={() =>
                  prefs.mutate(
                    { mfaEnabled: true, mfaType: 'totp' },
                    {
                      onSuccess: () => setEnrollment(null),
                    },
                  )
                }
              />
            )}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle className="mb-3">{t('security.passwordTitle')}</CardTitle>
        <Notice>
          {t('security.passwordNote')}{' '}
          <Link to="/forgot-password" className="font-bold underline">
            {t('security.passwordLink')}
          </Link>{' '}
          {t('security.passwordNoteEnd')}
        </Notice>
      </Card>
    </div>
  );
}
