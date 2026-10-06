import * as React from 'react';
import { Label as LabelPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn('mb-1.5 block text-[12px] font-bold text-text-muted', className)} {...props} />;
}

export type FieldControlProps = {
  id: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
  'aria-required': true | undefined;
};

/** Label + control + hint + inline error, wired with ids for screen readers. */
export function Field({
  label,
  error,
  hint,
  required,
  className,
  id: idProp,
  children,
}: {
  label: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  id?: string;
  children: (control: FieldControlProps) => React.ReactNode;
}) {
  const autoId = React.useId();
  const id = idProp ?? autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('min-w-0', className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        'aria-required': required ? true : undefined,
      })}
      {error && (
        <p id={errorId} className="mt-1.5 text-[12px] font-bold text-danger">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="mt-1.5 text-[12px] text-text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
