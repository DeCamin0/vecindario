/**
 * Helpers de presentación para Comunidades (V4). Solo display.
 */

export function statusLabel(status) {
  if (status === 'demo') return 'Demo'
  if (status === 'inactive') return 'Inactive'
  if (status === 'pending_approval') return 'Pendiente'
  return 'Active'
}

export function countAppNavFlags(community) {
  const checks = [
    community.appNavServicesEnabled !== false,
    community.appNavIncidentsEnabled !== false,
    community.appNavBookingsEnabled !== false,
    community.appNavPoolAccessEnabled === true,
    community.appNavPaqueteriaEnabled === true,
    community.paqueteriaSpecialDeliveryEnabled === true,
    community.paqueteriaKeyLoansEnabled === true,
    community.appNavCuadernoDiarioEnabled === true,
    community.appNavControlEntradaEnabled === true,
  ]
  const total = checks.length
  const active = checks.filter(Boolean).length
  return { active, total }
}

export function compactOpsStats(community) {
  const s = community.dashboardStats || {}
  const neighborCount = Number(s.neighborAccountsCount) || 0
  const officialCap =
    community.residentSlots != null && Number(community.residentSlots) > 0
      ? Number(community.residentSlots)
      : null
  const estimated =
    s.estimatedDwellingCapacity != null && Number(s.estimatedDwellingCapacity) > 0
      ? Number(s.estimatedDwellingCapacity)
      : null
  const cupo = officialCap ?? estimated
  const openIncidents = Number(s.pendingActions) || 0
  const totalIncidents = Number(s.totalIncidents) || 0
  const bookingsToday = Number(s.bookingsToday) || 0
  return {
    neighborsLabel: cupo != null ? `${neighborCount}/${cupo}` : `${neighborCount}/—`,
    openIncidents,
    totalIncidents,
    bookingsToday,
  }
}

const USAGE_LABELS = {
  neighbors_and_staff: 'Vecinos + conserjería',
  staff_only: 'Solo conserjería',
}

export function usageModeLabel(mode) {
  return USAGE_LABELS[mode] || mode || '—'
}

export function isBillingConfigured(summary) {
  if (!summary) return false
  const st = summary.commercialStatus
  return Boolean(st && st !== 'unconfigured')
}

export function formatBillingNet(summary) {
  if (!summary?.netEur) return null
  const net = String(summary.netEur)
  if (summary.pricingSource === 'negotiated_override') {
    return `${net} €/mes (negociado)`
  }
  return `${net} €/mes`
}

export function commercialStatusLabel(status) {
  const map = {
    unconfigured: 'Sin configurar',
    billable: 'Facturable',
    demo: 'Demo',
    courtesy: 'Cortesía',
    promo: 'Promoción',
    legacy: 'Legacy',
    non_billable: 'No facturable',
  }
  return map[status] || status || 'Sin configurar'
}
