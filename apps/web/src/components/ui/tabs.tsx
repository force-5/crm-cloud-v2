import * as React from 'react';
import { Tabs as TabsPrimitive, ToggleGroup } from 'radix-ui';
import { cn } from '@/lib/utils';

// ---- Underline tabs (prototype .tabs/.tab with orange active border) --------------------------

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        '-mx-4 mb-[18px] flex gap-[22px] overflow-x-auto border-b border-border px-4 [scrollbar-width:none] sm:mx-0 sm:px-0',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        '-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-0.5 font-bold text-text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=active]:border-primary data-[state=active]:text-text',
        className,
      )}
      {...props}
    />
  );
}

// ---- Segmented control (prototype .seg) -------------------------------------------------------

export type SegmentOption<V extends string> = { value: V; label: React.ReactNode; disabled?: boolean };

export function Segmented<V extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
}: {
  value: V;
  onValueChange: (value: V) => void;
  options: readonly SegmentOption<V>[];
  label: string;
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => {
        // Radix allows deselecting; a segmented control always has a value.
        if (v) onValueChange(v as V);
      }}
      aria-label={label}
      className={cn('inline-flex rounded-md bg-surface-muted p-[3px] dark:bg-background', className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          className="inline-flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-[6px] px-3 text-[13px] font-bold text-text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus-ring data-[state=on]:bg-surface data-[state=on]:text-text data-[state=on]:shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:data-[state=on]:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-text-muted md:min-h-8"
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
