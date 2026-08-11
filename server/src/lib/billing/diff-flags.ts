/**
 * Comparación pura: flags funcionales vs módulos contratados.
 * Nunca modifica flags ni contrato.
 */
import {
  BILLING_MODULE_CODES,
  MODULE_FLAG_MAP,
  SPECIAL_DELIVERY_FLAG_KEY,
  isFunctionalFlagEnabled,
  type BillingFlagKey,
  type BillingModuleCode,
} from './module-flags.js'

export type ModuleDiffStatus = 'ok' | 'active_not_contracted' | 'contracted_not_active'

export type ModuleDiffItem = {
  moduleCode: BillingModuleCode
  flagKey: BillingFlagKey
  functionallyActive: boolean
  commerciallyContracted: boolean
  status: ModuleDiffStatus
}

export type SpecialDeliveryDiff = {
  flagKey: typeof SPECIAL_DELIVERY_FLAG_KEY
  functionallyActive: boolean
  parcelsContracted: boolean
  /**
   * - ok: OFF, o ON con paquetería contratada
   * - info_without_parcels_contract: ON pero parcels no contratado (aviso; no cobro aparte)
   */
  status: 'ok' | 'info_without_parcels_contract'
  note: string
}

export type BillingFlagsDiffResult = {
  modules: ModuleDiffItem[]
  specialDelivery: SpecialDeliveryDiff
  hasWarnings: boolean
}

export type CommunityFlagsInput = Partial<
  Record<BillingFlagKey | typeof SPECIAL_DELIVERY_FLAG_KEY, boolean | null | undefined>
>

/**
 * @param flags — flags actuales de Community (o subset)
 * @param contractedModuleCodes — códigos presentes en líneas del contrato
 */
export function diffBillingModulesAgainstFlags(
  flags: CommunityFlagsInput,
  contractedModuleCodes: Iterable<string>,
): BillingFlagsDiffResult {
  const contracted = new Set(
    [...contractedModuleCodes].filter((c): c is BillingModuleCode =>
      (BILLING_MODULE_CODES as readonly string[]).includes(c),
    ),
  )

  const modules: ModuleDiffItem[] = MODULE_FLAG_MAP.map((m) => {
    const functionallyActive = isFunctionalFlagEnabled(m.flagKey, flags)
    const commerciallyContracted = contracted.has(m.moduleCode)
    let status: ModuleDiffStatus = 'ok'
    if (functionallyActive && !commerciallyContracted) status = 'active_not_contracted'
    else if (!functionallyActive && commerciallyContracted) status = 'contracted_not_active'
    return {
      moduleCode: m.moduleCode,
      flagKey: m.flagKey,
      functionallyActive,
      commerciallyContracted,
      status,
    }
  })

  const specialOn = flags[SPECIAL_DELIVERY_FLAG_KEY] === true
  const parcelsContracted = contracted.has('parcels')
  const specialDelivery: SpecialDeliveryDiff = specialOn && !parcelsContracted
    ? {
        flagKey: SPECIAL_DELIVERY_FLAG_KEY,
        functionallyActive: true,
        parcelsContracted: false,
        status: 'info_without_parcels_contract',
        note: 'Entrega especial activa funcionalmente, pero Paquetería no está contratada. Comercialmente no se cobra aparte; revisar contrato o flags.',
      }
    : {
        flagKey: SPECIAL_DELIVERY_FLAG_KEY,
        functionallyActive: specialOn,
        parcelsContracted,
        status: 'ok',
        note: specialOn
          ? 'Entrega especial incluida comercialmente en Paquetería (sin línea de cobro propia).'
          : 'Entrega especial no activa.',
      }

  const hasWarnings =
    modules.some((m) => m.status !== 'ok') || specialDelivery.status !== 'ok'

  return { modules, specialDelivery, hasWarnings }
}
