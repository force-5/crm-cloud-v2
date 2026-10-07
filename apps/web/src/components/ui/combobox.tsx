import * as React from 'react';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { inputClass } from './input';
import { Popover, PopoverAnchor, PopoverContent } from './overlays';

export type ComboOption = { value: string; label: string; description?: string };

const MAX_RENDERED = 200;

function useFiltered(options: readonly ComboOption[], query: string) {
  return React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
      : options;
    return list.slice(0, MAX_RENDERED);
  }, [options, query]);
}

/** Search box + listbox used inside the popover (WAI-ARIA combobox pattern). */
function ListPanel({
  options,
  isSelected,
  onPick,
  searchLabel,
  emptyText,
  listId,
}: {
  options: readonly ComboOption[];
  isSelected: (value: string) => boolean;
  onPick: (value: string) => void;
  searchLabel: string;
  emptyText: string;
  listId: string;
}) {
  const [query, setQuery] = React.useState('');
  const filtered = useFiltered(options, query);
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLUListElement>(null);

  React.useEffect(() => setActive(0), [query]);
  React.useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Home') {
      setActive(0);
    } else if (e.key === 'End') {
      setActive(filtered.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = filtered[active];
      if (o) onPick(o.value);
    }
  };

  const activeOption = filtered[active];
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <input
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeOption ? `${listId}-${active}` : undefined}
          aria-label={searchLabel}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={searchLabel}
          className={cn(inputClass, 'h-11 pl-9 text-base md:h-10 md:text-[14px]')}
        />
      </div>
      <ul
        id={listId}
        ref={listRef}
        role="listbox"
        aria-label={searchLabel}
        className="mt-2 max-h-[min(300px,45dvh)] overflow-y-auto overscroll-contain"
      >
        {filtered.length === 0 && <li className="px-3 py-6 text-center text-text-muted">{emptyText}</li>}
        {filtered.map((o, i) => {
          const selected = isSelected(o.value);
          return (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              data-index={i}
              role="option"
              aria-selected={selected}
              onMouseMove={() => setActive(i)}
              onClick={() => onPick(o.value)}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-2 rounded-[7px] px-3 py-2 md:min-h-9',
                i === active && 'bg-surface-muted',
              )}
            >
              <Check className={cn('size-4 shrink-0 text-primary-ink', !selected && 'invisible')} aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate font-bold">{o.label}</span>
                {o.description && <span className="block truncate text-[12px] text-text-muted">{o.description}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const triggerClass = cn(
  inputClass,
  'flex h-11 items-center justify-between gap-2 text-left text-base md:h-10 md:text-[14px] disabled:opacity-60',
);

/** Searchable single-select. */
export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder,
  searchLabel,
  disabled,
  className,
  clearable = false,
  ...aria
}: {
  id?: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  options: readonly ComboOption[];
  placeholder: string;
  searchLabel: string;
  disabled?: boolean;
  className?: string;
  clearable?: boolean;
  'aria-invalid'?: true | undefined;
  'aria-describedby'?: string | undefined;
  'aria-required'?: true | undefined;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const listId = React.useId();
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={cn('relative', className)}>
          <button
            type="button"
            id={id}
            disabled={disabled}
            // ARIA 1.2 select-only combobox: role=combobox is what allows aria-required/aria-invalid here.
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            onClick={() => setOpen((o) => !o)}
            className={triggerClass}
            {...aria}
          >
            <span className={cn('truncate', !selected && 'text-text-muted')}>{selected?.label ?? placeholder}</span>
            <ChevronsUpDown className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
          </button>
          {clearable && selected && !disabled && (
            <button
              type="button"
              aria-label={t('actions.clear')}
              onClick={() => onChange(undefined)}
              className="absolute right-8 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded text-text-muted hover:text-text"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-2">
        <ListPanel
          options={options}
          listId={listId}
          isSelected={(v) => v === value}
          onPick={(v) => {
            onChange(v);
            setOpen(false);
          }}
          searchLabel={searchLabel}
          emptyText={t('empty.noMatches')}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Multi-select rendered as removable chips + an "Add" popover. */
export function MultiSelectChips({
  id,
  values,
  onChange,
  options,
  placeholder,
  searchLabel,
  disabled,
  ...aria
}: {
  id?: string;
  values: readonly string[];
  onChange: (values: string[]) => void;
  options: readonly ComboOption[];
  placeholder: string;
  searchLabel: string;
  disabled?: boolean;
  'aria-invalid'?: true | undefined;
  'aria-describedby'?: string | undefined;
  'aria-required'?: true | undefined;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const listId = React.useId();
  const selected = values
    .map((v) => options.find((o) => o.value === v))
    .filter((o): o is ComboOption => !!o);
  const toggle = (v: string) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            inputClass,
            'flex min-h-11 flex-wrap items-center gap-1.5 px-1.5 py-1.5 md:min-h-10',
            disabled && 'bg-surface-muted',
          )}
        >
          {selected.map((o) => (
            <span
              key={o.value}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-soft py-0.5 pl-2.5 pr-0.5 text-[12px] font-bold text-primary-soft-text"
            >
              <span className="truncate">{o.label}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggle(o.value)}
                  aria-label={t('actions.removeItem', { name: o.label })}
                  className="inline-flex size-7 items-center justify-center rounded-full hover:bg-primary/15"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              )}
            </span>
          ))}
          <button
            type="button"
            id={id}
            disabled={disabled}
            // ARIA 1.2 select-only combobox: role=combobox is what allows aria-required/aria-invalid here.
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex min-h-8 flex-1 items-center justify-between gap-2 rounded px-1.5 text-left text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus-ring"
            {...aria}
          >
            <span className="truncate">{selected.length ? t('actions.addMore') : placeholder}</span>
            <ChevronsUpDown className="size-4 shrink-0" aria-hidden="true" />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[240px] p-2">
        <ListPanel
          options={options}
          listId={listId}
          isSelected={(v) => values.includes(v)}
          onPick={toggle}
          searchLabel={searchLabel}
          emptyText={t('empty.noMatches')}
        />
      </PopoverContent>
    </Popover>
  );
}
