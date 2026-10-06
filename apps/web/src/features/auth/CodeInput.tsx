import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * Six single-digit boxes that behave like one field: typing advances, Backspace goes back,
 * paste fills all boxes, and the OS one-time-code autofill works on the first box.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  invalid,
  disabled,
  length = 6,
  labelledBy,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  length?: number;
  labelledBy: string;
}) {
  const { t } = useTranslation('auth');
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  const setAt = (index: number, chars: string) => {
    const clean = chars.replace(/\D/g, '');
    if (!clean) return;
    const next = (value.slice(0, index) + clean).slice(0, length);
    onChange(next);
    const focusIndex = Math.min(next.length, length - 1);
    refs.current[focusIndex]?.focus();
    if (next.length === length) onComplete?.(next);
  };

  return (
    <div role="group" aria-labelledby={labelledBy} className="flex justify-between gap-1.5 sm:gap-2.5">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          disabled={disabled}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={i === 0 ? length : 1}
          aria-label={t('mfa.digit', { n: i + 1 })}
          aria-invalid={invalid || undefined}
          autoFocus={i === 0}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') {
              onChange(value.slice(0, i));
              return;
            }
            setAt(i, v.length > 1 && i === 0 ? v : v.slice(-1));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !digits[i] && i > 0) {
              e.preventDefault();
              onChange(value.slice(0, i - 1));
              refs.current[i - 1]?.focus();
            } else if (e.key === 'ArrowLeft' && i > 0) {
              refs.current[i - 1]?.focus();
            } else if (e.key === 'ArrowRight' && i < length - 1) {
              refs.current[i + 1]?.focus();
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            setAt(0, e.clipboardData.getData('text'));
          }}
          className={cn(
            'h-14 w-full min-w-0 max-w-14 rounded-[9px] border border-border-strong bg-surface text-center text-[22px] font-black text-text transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus-ring disabled:opacity-60',
            invalid && 'border-danger',
          )}
        />
      ))}
    </div>
  );
}
