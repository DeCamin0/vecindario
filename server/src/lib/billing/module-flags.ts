/**
 * Mapeo central módulo comercial ↔ flag funcional.
 * Única fuente de verdad — no duplicar en otros archivos.
 */

export const BILLING_MODULE_CODES = [
  'incidents',
  'bookings',
  'services',
  'pool',
  'parcels',
  'key_loans',
  'diario',
  'control_entrada',
] as const

export type BillingModuleCode = (typeof BILLING_MODULE_CODES)[number]

/** Flags funcionales asociados a módulos cobrables. */
export type BillingFlagKey =
  | 'appNavServicesEnabled'
  | 'appNavIncidentsEnabled'
  | 'appNavBookingsEnabled'
  | 'appNavPoolAccessEnabled'
  | 'appNavPaqueteriaEnabled'
  | 'paqueteriaKeyLoansEnabled'
  | 'appNavCuadernoDiarioEnabled'
  | 'appNavControlEntradaEnabled'

/**
 * Flag funcional de Entrega especial (NO es módulo cobrable).
 * Comercialmente incluida en Paquetería (`parcels`).
 */
export const SPECIAL_DELIVERY_FLAG_KEY = 'paqueteriaSpecialDeliveryEnabled' as const

export type ModuleFlagMapping = {
  moduleCode: BillingModuleCode
  flagKey: BillingFlagKey
  /** Defaults true en Community: se considera activo si !== false. */
  defaultEnabled: boolean
}

export const MODULE_FLAG_MAP: readonly ModuleFlagMapping[] = [
  { moduleCode: 'incidents', flagKey: 'appNavIncidentsEnabled', defaultEnabled: true },
  { moduleCode: 'bookings', flagKey: 'appNavBookingsEnabled', defaultEnabled: true },
  { moduleCode: 'services', flagKey: 'appNavServicesEnabled', defaultEnabled: true },
  { moduleCode: 'pool', flagKey: 'appNavPoolAccessEnabled', defaultEnabled: false },
  { moduleCode: 'parcels', flagKey: 'appNavPaqueteriaEnabled', defaultEnabled: false },
  { moduleCode: 'key_loans', flagKey: 'paqueteriaKeyLoansEnabled', defaultEnabled: false },
  { moduleCode: 'diario', flagKey: 'appNavCuadernoDiarioEnabled', defaultEnabled: false },
  { moduleCode: 'control_entrada', flagKey: 'appNavControlEntradaEnabled', defaultEnabled: false },
] as const

const BY_MODULE = new Map(MODULE_FLAG_MAP.map((m) => [m.moduleCode, m]))
const BY_FLAG = new Map(MODULE_FLAG_MAP.map((m) => [m.flagKey, m]))

export function flagKeyForModule(code: string): BillingFlagKey | null {
  return BY_MODULE.get(code as BillingModuleCode)?.flagKey ?? null
}

export function moduleCodeForFlag(flagKey: string): BillingModuleCode | null {
  return BY_FLAG.get(flagKey as BillingFlagKey)?.moduleCode ?? null
}

export function isKnownBillingModuleCode(code: string): code is BillingModuleCode {
  return BY_MODULE.has(code as BillingModuleCode)
}

/**
 * Evalúa si un flag está activo según la misma semántica que AuthContext / community-config.
 */
export function isFunctionalFlagEnabled(
  flagKey: BillingFlagKey,
  flags: Partial<Record<BillingFlagKey, boolean | null | undefined>>,
): boolean {
  const meta = BY_FLAG.get(flagKey)
  if (!meta) return false
  const raw = flags[flagKey]
  if (meta.defaultEnabled) {
    return raw !== false
  }
  return raw === true
}
