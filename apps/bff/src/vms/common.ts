import type { ListQuery, Option, Page, StatusFilter, StringOption } from '@crm/contracts';
import { z } from 'zod';
import type { VmsQuery } from './client';

/** VMS sends `null` for absent values; the contracts use `undefined`. */
export const nn = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);

/** Normalize any VMS date (Instant `...Z` or java.util.Date `...+00:00`) to ISO-8601 UTC. */
export function isoDate(v: string | number | null | undefined): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

const str = z.string().nullish();
export const nullishString = str;

// ---- paging -----------------------------------------------------------------

export const vmsPageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    content: z.array(item),
    page: z.object({
      number: z.number(),
      size: z.number(),
      totalElements: z.number(),
      totalPages: z.number(),
    }),
  });

export type VmsPage<T> = { content: T[]; page: { number: number; size: number; totalElements: number; totalPages: number } };

/** VMS 0-based page → contracts 1-based `Page<T>`. */
export function toPage<In, Out>(p: VmsPage<In>, map: (x: In) => Out): Page<Out> {
  return {
    items: p.content.map(map),
    page: p.page.number + 1,
    size: p.page.size,
    total: p.page.totalElements,
    totalPages: p.page.totalPages,
  };
}

/** `active|inactive|all` → VMS `active=true|false|<omitted>` */
export function activeParam(status: StatusFilter | undefined): boolean | undefined {
  if (status === 'active') return true;
  if (status === 'inactive') return false;
  return undefined;
}

export type SortSpec = {
  /** UI sort key → one or more VMS sort properties. */
  map: Record<string, string[]>;
  /** Used when the UI sends no (or an unknown) sort key. Entries are `field,dir`. */
  default: string[];
  /** Always appended as a secondary sort (`field,dir`) unless already the primary. */
  always?: string[];
};

export function sortParams(q: Pick<ListQuery, 'sort' | 'dir'>, spec: SortSpec): string[] {
  const fields = q.sort ? spec.map[q.sort] : undefined;
  const dir = q.dir ?? 'asc';
  const primary = fields ? fields.map((f) => `${f},${dir}`) : spec.default;
  const used = new Set(primary.map((s) => s.split(',')[0]));
  return [...primary, ...(spec.always ?? []).filter((s) => !used.has(s.split(',')[0]))];
}

/** Contracts list query (1-based) → VMS paging params (0-based, `sort=field,dir`, `active`). */
export function pagingQuery(q: ListQuery, spec: SortSpec): VmsQuery {
  return {
    page: Math.max(q.page - 1, 0),
    size: q.size,
    sort: sortParams(q, spec),
    search: q.search || undefined,
    active: activeParam(q.status),
  };
}

// ---- supporting lists ---------------------------------------------------------

const idCodeDescription = z.object({ id: z.number(), code: str, description: str });
const timeZone = z.object({ zoneId: z.string(), description: str });
/** VMS SelectItemDto: `{value: "1", text: "Visitor"}` */
const selectItem = z.object({ value: z.union([z.string(), z.number()]), text: str });

export const supportingListsSchema = z.looseObject({
  supportedLanguages: z.array(idCodeDescription).nullish(),
  supportedTimeZones: z.array(timeZone).nullish(),
  country: z.array(idCodeDescription).nullish(),
  states: z.array(idCodeDescription).nullish(),
  framework: z.array(selectItem).nullish(),
});
export type VmsSupportingLists = z.infer<typeof supportingListsSchema>;

const toOption = (x: z.infer<typeof idCodeDescription>): Option => ({
  value: x.id,
  label: x.description ?? x.code ?? String(x.id),
  ...(x.code ? { code: x.code } : {}),
});

export function mapCommonLookups(s: VmsSupportingLists) {
  return {
    languages: (s.supportedLanguages ?? []).map(toOption),
    timeZones: (s.supportedTimeZones ?? []).map(
      (t): StringOption => ({ value: t.zoneId, label: t.description ?? t.zoneId }),
    ),
    countries: (s.country ?? []).map(toOption),
    states: (s.states ?? []).map(toOption),
  };
}

export function mapFrameworks(s: VmsSupportingLists): Option[] {
  return (s.framework ?? [])
    .map((f) => ({ value: Number(f.value), label: f.text ?? String(f.value) }))
    .filter((o) => Number.isFinite(o.value));
}

/** A tiny TTL cache for lookups that are identical for every user (supporting lists). */
export class TtlCache<T> {
  private value: { v: T; at: number } | undefined;
  constructor(private readonly ttlMs: number) {}
  async get(load: () => Promise<T>): Promise<T> {
    if (this.value && Date.now() - this.value.at < this.ttlMs) return this.value.v;
    const v = await load();
    this.value = { v, at: Date.now() };
    return v;
  }
  set(v: T) {
    this.value = { v, at: Date.now() };
  }
}
