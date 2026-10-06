import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Circle, Eye, EyeOff } from 'lucide-react';
import { PASSWORD_RULES } from '@crm/contracts';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Password field with a show/hide toggle. */
export function PasswordInput({ className, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  const { t } = useTranslation('auth');
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input type={visible ? 'text' : 'password'} className={cn('pr-12', className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('login.hidePassword') : t('login.showPassword')}
        aria-pressed={visible}
        className="absolute right-0.5 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus-ring md:size-9"
      >
        {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
      </button>
    </div>
  );
}

/** Live checklist of PASSWORD_RULES. */
export function PasswordChecklist({ password, id }: { password: string; id?: string }) {
  const { t } = useTranslation('auth');
  return (
    <div id={id} className="mt-2 rounded-[9px] border border-border bg-surface-muted/60 px-3 py-2.5">
      <p className="m-0 mb-1.5 text-[12px] font-bold text-text-muted">{t('forgot.rulesTitle')}</p>
      <ul className="m-0 grid list-none gap-1 p-0 sm:grid-cols-2">
        {PASSWORD_RULES.map((rule) => {
          const ok = rule.test(password);
          return (
            <li key={rule.id} className={cn('flex items-center gap-1.5 text-[12px]', ok ? 'font-bold text-success' : 'text-text-muted')}>
              {ok ? <Check className="size-3.5" aria-hidden="true" /> : <Circle className="size-3" aria-hidden="true" />}
              <span className="sr-only">{ok ? t('forgot.ruleMet') : t('forgot.ruleUnmet')} </span>
              {t(`forgot.rules.${rule.id}`, { defaultValue: rule.label })}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
