import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import { PAGE_SIZES, type StatusFilter } from '@crm/contracts';
import { Input, NativeSelect } from '@/components/ui/input';
import { Segmented } from '@/components/ui/tabs';

export const SEARCH_DEBOUNCE_MS = 300;

/** Search input that keeps its own text and reports changes after a 300ms pause. */
export function DebouncedSearch({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder: string;
  label: string;
}) {
  const { t } = useTranslation();
  const [text, setText] = React.useState(value ?? '');
  const last = React.useRef(value ?? '');
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  // External changes (back button, "clear filters") flow into the box.
  React.useEffect(() => {
    if ((value ?? '') !== last.current) {
      last.current = value ?? '';
      setText(value ?? '');
    }
  }, [value]);

  React.useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === last.current) return;
    const id = window.setTimeout(() => {
      last.current = trimmed;
      onChangeRef.current(trimmed || undefined);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [text]);

  return (
    <div className="relative w-full sm:w-auto sm:min-w-[260px]">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
      <Input
        type="search"
        role="searchbox"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="pl-9 pr-10 [&::-webkit-search-cancel-button]:hidden"
        maxLength={100}
      />
      {text && (
        <button
          type="button"
          onClick={() => setText('')}
          aria-label={t('actions.clear')}
          className="absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function StatusSegmented({ value, onChange }: { value: StatusFilter; onChange: (v: StatusFilter) => void }) {
  const { t } = useTranslation();
  return (
    <Segmented
      label={t('filters.status')}
      value={value}
      onValueChange={onChange}
      className="w-full sm:w-auto"
      options={[
        { value: 'active', label: t('status.active') },
        { value: 'inactive', label: t('status.inactive') },
        { value: 'all', label: t('status.all') },
      ]}
    />
  );
}

export function PageSizeSelect({ value, onChange }: { value: number; onChange: (size: number) => void }) {
  const { t } = useTranslation();
  return (
    <NativeSelect
      aria-label={t('filters.pageSize')}
      value={String(value)}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full sm:w-[150px]"
    >
      {PAGE_SIZES.map((n) => (
        <option key={n} value={n}>
          {t('filters.perPage', { count: n })}
        </option>
      ))}
    </NativeSelect>
  );
}

/** Prototype .toolbar: filters on the left, extra controls on the right; stacks on phones. */
export function ListToolbar({ left, right }: { left: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3.5 flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-[9px]">{left}</div>
      {right && <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-[9px]">{right}</div>}
    </div>
  );
}
