/**
 * Campos de update del seed de catálogo.
 * B7.2: precios NO.
 * B7.3: includesJson NO (Super Admin = fuente de verdad comercial).
 */
export function seedPlanUpdateData(p: {
  name: string
  sortOrder: number
}) {
  return {
    name: p.name,
    active: true,
    sortOrder: p.sortOrder,
  }
}

export function seedModuleUpdateData(m: {
  name: string
  flagKey: string
  sortOrder: number
}) {
  return {
    name: m.name,
    flagKey: m.flagKey,
    parentCode: null,
    active: true,
    sortOrder: m.sortOrder,
  }
}
