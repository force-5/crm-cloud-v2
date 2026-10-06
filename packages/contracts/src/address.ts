/**
 * Client-side country rules. VMS's `country/{id}` route does not exist (plan §6.3, V7),
 * so address behaviour is driven from this table, keyed by ISO country code.
 */
export type CountryRule = {
  usesStates: boolean;
  stateLabel: string;
  postalLabel: string;
  postalPattern?: RegExp;
  postalHint?: string;
};

const DEFAULT_RULE: CountryRule = { usesStates: false, stateLabel: 'Province / region', postalLabel: 'Postal code' };

export const COUNTRY_RULES: Record<string, CountryRule> = {
  US: {
    usesStates: true,
    stateLabel: 'State',
    postalLabel: 'ZIP code',
    postalPattern: /^\d{5}(-\d{4})?$/,
    postalHint: '5-digit ZIP or ZIP+4',
  },
  CA: {
    usesStates: false,
    stateLabel: 'Province',
    postalLabel: 'Postal code',
    postalPattern: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,
    postalHint: 'e.g. K1A 0B1',
  },
  GB: { usesStates: false, stateLabel: 'County', postalLabel: 'Postcode' },
};

export function countryRule(code: string | undefined | null): CountryRule {
  return (code && COUNTRY_RULES[code.toUpperCase()]) || DEFAULT_RULE;
}
