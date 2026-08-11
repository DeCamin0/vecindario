/**
 * Resumen comercial / MRR (puro a partir de contratos ya cargados).
 * B8: agregaciones aditivas; MRR = sum(quote.netEur) de billable|promo|legacy.
 */
import { formatMoney, money, roundMoney } from './money.js'
import {
  COMMERCIAL_STATUSES,
  UNCONFIGURED_STATUS,
  isMrrCommercialStatus,
} from './commercial-status.js'
import { quoteFromBillingRow, type CommunityBillingRow } from './read-community.js'
import { USAGE_MODES, type UsageMode } from './usage-mode.js'

const STATUS_LABELS: Record<string, string> = {
  billable: 'Facturable',
  demo: 'Demo',
  courtesy: 'Cortesía',
  promo: 'Promoción',
  legacy: 'Legacy',
  non_billable: 'No facturable',
  unconfigured: 'Sin configurar',
}

const USAGE_LABELS: Record<UsageMode, string> = {
  neighbors_and_staff: 'Vecinos + conserjería',
  staff_only: 'Solo conserjería',
}

export type BillingSummaryResult = {
  /** Alias B3 / B8 */
  mrr: string
  arr: string
  mrrEur: string
  arrEur: string
  billableCommunities: number
  promoCommunities: number
  legacyCommunities: number
  demoCommunities: number
  courtesyCommunities: number
  nonBillableCommunities: number
  unconfiguredCommunities: number
  configuredCommunities: number
  /** Comunidades que entran en MRR (billable+promo+legacy). */
  mrrCommunities: number
  averageMonthlyTicket: string | null
  averageMonthlyTicketEur: string | null
  /** B3 compat: solo planes que aportan MRR. */
  revenueByPlan: Array<{ planCode: string; planName: string; communities: number; mrr: string }>
  /** B3 compat: conteo por moduleCode. */
  contractedModulesCount: Record<string, number>

  communities: {
    total: number
    configured: number
    unconfigured: number
    contributingToMrr: number
    notContributingToMrr: number
  }
  byCommercialStatus: Array<{
    status: string
    label: string
    communityCount: number
  }>
  byUsageMode: Array<{
    usageMode: string
    label: string
    communityCount: number
    mrrEur: string
  }>
  byPlan: Array<{
    planCode: string
    planName: string
    communityCount: number
    mrrEur: string
  }>
  modules: Array<{
    moduleCode: string
    moduleName: string
    contractedCommunityCount: number
    percentageConfigured: number | null
  }>
  negotiatedContractsCount: number
  /** Métricas principales = neto contractual sin IVA. */
  amountsAreNetWithoutVat: true
}

export function buildBillingSummary(input: {
  totalCommunities: number
  billings: CommunityBillingRow[]
}): BillingSummaryResult {
  const counts = {
    billable: 0,
    promo: 0,
    legacy: 0,
    demo: 0,
    courtesy: 0,
    non_billable: 0,
  }

  let mrrSum = money(0)
  let mrrCommunities = 0
  let negotiatedContractsCount = 0

  const planAgg = new Map<
    string,
    { planName: string; communities: number; mrr: ReturnType<typeof money> }
  >()
  const planAllAgg = new Map<
    string,
    { planName: string; communities: number; mrr: ReturnType<typeof money> }
  >()
  const usageAgg = new Map<
    string,
    { communities: number; mrr: ReturnType<typeof money> }
  >()
  for (const mode of USAGE_MODES) {
    usageAgg.set(mode, { communities: 0, mrr: money(0) })
  }

  const moduleCounts = new Map<string, { name: string; count: number }>()

  for (const b of input.billings) {
    const st = b.commercialStatus
    if (st in counts) {
      counts[st as keyof typeof counts] += 1
    }

    if (b.negotiatedTotalEur != null && String(b.negotiatedTotalEur).trim() !== '') {
      negotiatedContractsCount += 1
    }

    for (const line of b.lines) {
      const prev = moduleCounts.get(line.moduleCode)
      if (prev) {
        prev.count += 1
        if (line.moduleName) prev.name = String(line.moduleName)
      } else {
        moduleCounts.set(line.moduleCode, {
          name: String(line.moduleName || line.moduleCode),
          count: 1,
        })
      }
    }

    const usageKey = b.usageMode
    if (!usageAgg.has(usageKey)) {
      usageAgg.set(usageKey, { communities: 0, mrr: money(0) })
    }
    const u = usageAgg.get(usageKey)!
    u.communities += 1

    const planRow = planAllAgg.get(b.planCode) ?? {
      planName: b.planName,
      communities: 0,
      mrr: money(0),
    }
    planRow.communities += 1
    planRow.planName = b.planName
    planAllAgg.set(b.planCode, planRow)

    if (!isMrrCommercialStatus(st)) continue

    const quote = quoteFromBillingRow(b)
    const net = money(quote.netEur)
    mrrSum = mrrSum.plus(net)
    mrrCommunities += 1
    u.mrr = u.mrr.plus(net)
    planRow.mrr = planRow.mrr.plus(net)

    const prev = planAgg.get(b.planCode) ?? {
      planName: b.planName,
      communities: 0,
      mrr: money(0),
    }
    prev.communities += 1
    prev.mrr = prev.mrr.plus(net)
    prev.planName = b.planName
    planAgg.set(b.planCode, prev)
  }

  const configured = input.billings.length
  const unconfigured = Math.max(0, input.totalCommunities - configured)
  const mrr = roundMoney(mrrSum)
  const arr = roundMoney(mrr.times(12))
  const averageMonthlyTicket =
    mrrCommunities === 0 ? null : formatMoney(mrr.dividedBy(mrrCommunities))
  const mrrStr = formatMoney(mrr)
  const arrStr = formatMoney(arr)

  const revenueByPlan = [...planAgg.entries()]
    .map(([planCode, v]) => ({
      planCode,
      planName: v.planName,
      communities: v.communities,
      mrr: formatMoney(v.mrr),
    }))
    .sort((a, b) => a.planCode.localeCompare(b.planCode))

  const contractedModulesCount: Record<string, number> = {}
  for (const [code, v] of moduleCounts) {
    contractedModulesCount[code] = v.count
  }

  const byCommercialStatus = [
    ...COMMERCIAL_STATUSES.map((status) => ({
      status,
      label: STATUS_LABELS[status] || status,
      communityCount: counts[status as keyof typeof counts] ?? 0,
    })),
    {
      status: UNCONFIGURED_STATUS,
      label: STATUS_LABELS.unconfigured,
      communityCount: unconfigured,
    },
  ]

  const byUsageMode = [...usageAgg.entries()]
    .map(([usageMode, v]) => ({
      usageMode,
      label: USAGE_LABELS[usageMode as UsageMode] || usageMode,
      communityCount: v.communities,
      mrrEur: formatMoney(v.mrr),
    }))
    .sort((a, b) => {
      const order = USAGE_MODES as readonly string[]
      const ia = order.indexOf(a.usageMode)
      const ib = order.indexOf(b.usageMode)
      if (ia === -1 && ib === -1) return a.usageMode.localeCompare(b.usageMode)
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })

  const byPlan = [...planAllAgg.entries()]
    .map(([planCode, v]) => ({
      planCode,
      planName: v.planName,
      communityCount: v.communities,
      mrrEur: formatMoney(v.mrr),
    }))
    .sort((a, b) => a.planCode.localeCompare(b.planCode))

  const modules = [...moduleCounts.entries()]
    .map(([moduleCode, v]) => ({
      moduleCode,
      moduleName: v.name,
      contractedCommunityCount: v.count,
      percentageConfigured:
        configured === 0 ? null : Math.round((v.count / configured) * 1000) / 10,
    }))
    .sort(
      (a, b) =>
        b.contractedCommunityCount - a.contractedCommunityCount ||
        a.moduleCode.localeCompare(b.moduleCode),
    )

  return {
    mrr: mrrStr,
    arr: arrStr,
    mrrEur: mrrStr,
    arrEur: arrStr,
    billableCommunities: counts.billable,
    promoCommunities: counts.promo,
    legacyCommunities: counts.legacy,
    demoCommunities: counts.demo,
    courtesyCommunities: counts.courtesy,
    nonBillableCommunities: counts.non_billable,
    unconfiguredCommunities: unconfigured,
    configuredCommunities: configured,
    mrrCommunities,
    averageMonthlyTicket,
    averageMonthlyTicketEur: averageMonthlyTicket,
    revenueByPlan,
    contractedModulesCount,
    communities: {
      total: input.totalCommunities,
      configured,
      unconfigured,
      contributingToMrr: mrrCommunities,
      notContributingToMrr: Math.max(0, configured - mrrCommunities),
    },
    byCommercialStatus,
    byUsageMode,
    byPlan,
    modules,
    negotiatedContractsCount,
    amountsAreNetWithoutVat: true,
  }
}
