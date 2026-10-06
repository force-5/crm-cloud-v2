import {
  accountFormSchema,
  validateAccountForPublish,
  type Account,
  type AccountFormData,
  type AccountLookups,
} from '@crm/contracts';
import { countryCodeLookup } from '@/components/AddressFields';

/** What the inputs hold: strings for text/selects, real types for switches and chips. */
export type AccountFormState = {
  name: string;
  languageId: string;
  timeZoneName: string;
  labelVerticalId: string;
  frameworkIds: number[];
  requireMfa: boolean;
  active: boolean;
  mainContactFirstName: string;
  mainContactLastName: string;
  mainContactEmail: string;
  mainContactMobile: string;
  mainContactPhone: string;
  countryId: string;
  address: string;
  city: string;
  stateId: string;
  provinceOrRegion: string;
  postalCode: string;
};

export const ACCOUNT_FIELDS = [
  'name',
  'languageId',
  'timeZoneName',
  'labelVerticalId',
  'frameworkIds',
  'requireMfa',
  'active',
  'mainContactFirstName',
  'mainContactLastName',
  'mainContactEmail',
  'mainContactMobile',
  'mainContactPhone',
  'countryId',
  'address',
  'city',
  'stateId',
  'provinceOrRegion',
  'postalCode',
] as const satisfies readonly (keyof AccountFormState)[];

export type AccountFieldName = (typeof ACCOUNT_FIELDS)[number];

const s = (v: string | number | null | undefined) => (v === undefined || v === null ? '' : String(v));

export function toFormState(account: Account | null | undefined): AccountFormState {
  return {
    name: s(account?.name),
    languageId: s(account?.languageId),
    timeZoneName: s(account?.timeZoneName),
    labelVerticalId: s(account?.labelVerticalId),
    frameworkIds: account?.frameworkIds ?? [],
    requireMfa: account?.requireMfa ?? false,
    active: account?.active ?? true,
    mainContactFirstName: s(account?.mainContact.firstName),
    mainContactLastName: s(account?.mainContact.lastName),
    mainContactEmail: s(account?.mainContact.email),
    mainContactMobile: s(account?.mainContact.mobile),
    mainContactPhone: s(account?.mainContact.phone),
    countryId: s(account?.countryId),
    address: s(account?.address),
    city: s(account?.city),
    stateId: s(account?.stateId),
    provinceOrRegion: s(account?.provinceOrRegion),
    postalCode: s(account?.postalCode),
  };
}

export type ValidationResult =
  | { ok: true; data: AccountFormData }
  | { ok: false; errors: Partial<Record<AccountFieldName, string>> };

/**
 * Draft rules: only the company name is required; anything filled in must be well-formed.
 * Publish / registered rules: additionally every field `validateAccountForPublish` requires,
 * with the country-specific state and postal-code checks.
 */
export function validateAccountForm(
  state: AccountFormState,
  mode: 'draft' | 'full',
  lookups: Pick<AccountLookups, 'countries'>,
): ValidationResult {
  const input = { ...state, labelVerticalId: state.labelVerticalId === '' ? null : Number(state.labelVerticalId) };
  const parsed = accountFormSchema.safeParse(input);
  const errors: Partial<Record<AccountFieldName, string>> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && (ACCOUNT_FIELDS as readonly string[]).includes(key) && !errors[key as AccountFieldName]) {
        errors[key as AccountFieldName] = issue.message;
      }
    }
  }
  if (mode === 'full') {
    const data = parsed.success ? parsed.data : (input as unknown as AccountFormData);
    const full = validateAccountForPublish(data, countryCodeLookup(lookups.countries));
    for (const [key, message] of Object.entries(full)) {
      if ((ACCOUNT_FIELDS as readonly string[]).includes(key) && !errors[key as AccountFieldName]) {
        errors[key as AccountFieldName] = message;
      }
    }
  }
  if (!parsed.success || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: parsed.data };
}
