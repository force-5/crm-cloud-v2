/* eslint-disable @typescript-eslint/no-explicit-any -- RHF's Control generics vary by transform type */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import {
  Card,
  SelectField,
  SwitchRow,
  TextField,
  type SelectOption,
  type TextFieldProps,
} from '@/components';

type Base<T extends FieldValues> = { control: Control<T, any, any>; name: Path<T> };

export function FormText<T extends FieldValues>({
  control,
  name,
  ...props
}: Base<T> & Omit<TextFieldProps, 'value' | 'onChangeText' | 'onBlur' | 'error'>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          {...props}
          ref={field.ref}
          value={field.value === undefined || field.value === null ? '' : String(field.value)}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}

export function FormSelect<T extends FieldValues, V extends string | number>({
  control,
  name,
  options,
  label,
  required,
  readOnly,
  searchable,
  noneLabel,
  helper,
  placeholder,
}: Base<T> & {
  options: readonly SelectOption<V>[];
  label: string;
  required?: boolean;
  readOnly?: boolean;
  searchable?: boolean;
  noneLabel?: string;
  helper?: string;
  placeholder?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <SelectField<V>
          label={label}
          options={options}
          value={(field.value ?? null) as V | null}
          onChange={(v) => field.onChange(v ?? (noneLabel ? null : undefined))}
          error={fieldState.error?.message}
          required={required}
          readOnly={readOnly}
          searchable={searchable}
          noneLabel={noneLabel}
          helper={helper}
          placeholder={placeholder}
        />
      )}
    />
  );
}

export function FormMultiSelect<T extends FieldValues, V extends string | number>({
  control,
  name,
  options,
  label,
  readOnly,
  helper,
}: Base<T> & { options: readonly SelectOption<V>[]; label: string; readOnly?: boolean; helper?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <SelectField<V>
          multiple
          label={label}
          options={options}
          value={(field.value ?? []) as V[]}
          onChange={field.onChange}
          error={fieldState.error?.message}
          readOnly={readOnly}
          helper={helper}
          placeholder="None selected"
        />
      )}
    />
  );
}

export function FormSwitch<T extends FieldValues>({
  control,
  name,
  label,
  description,
  disabled,
}: Base<T> & { label: string; description?: string; disabled?: boolean }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <SwitchRow
          label={label}
          description={description}
          value={!!field.value}
          onValueChange={field.onChange}
          disabled={disabled}
        />
      )}
    />
  );
}

/** A titled card that lays its fields out in one column (two on wide screens via `row`). */
export function FormSection({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card title={title} subtitle={subtitle} style={{ gap: 16 }}>
      {children}
    </Card>
  );
}

export function FieldRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>{children}</View>;
}
