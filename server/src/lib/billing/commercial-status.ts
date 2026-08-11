/**
 * Estados comerciales y cuáles entran en MRR real.
 */
export const COMMERCIAL_STATUSES = [
  'billable',
  'demo',
  'courtesy',
  'promo',
  'legacy',
  'non_billable',
] as const

export type CommercialStatus = (typeof COMMERCIAL_STATUSES)[number]

/** Sin fila community_billing. */
export const UNCONFIGURED_STATUS = 'unconfigured' as const

/** Statuses que suman a MRR real. */
export const MRR_COMMERCIAL_STATUSES: ReadonlySet<string> = new Set([
  'billable',
  'promo',
  'legacy',
])

export function isMrrCommercialStatus(status: string): boolean {
  return MRR_COMMERCIAL_STATUSES.has(status)
}

export function isKnownCommercialStatus(status: string): status is CommercialStatus {
  return (COMMERCIAL_STATUSES as readonly string[]).includes(status)
}
