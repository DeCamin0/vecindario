/**
 * Seed idempotente del catálogo comercial Vecindario
 * (planes + módulos + plan_prices + size_tiers).
 *
 * B7.2:
 * - Precios (plan×usageMode y list_price_eur de módulos): create-only / nunca overwrite.
 * B7.3:
 * - includesJson: create-only (solo en create del plan); nunca overwrite en update.
 * - Metadata name/active/sortOrder/flagKey: sí puede actualizarse.
 *
 * Size tiers (T1):
 * - Solo inserta defaults si la tabla está vacía.
 * - Nunca sobrescribe tramos editados desde Super Admin.
 *
 * - NO crea community_billing ni toca comunidades / flags / status / planExpiresOn.
 *
 * Uso:
 *   cd vecindario-app/server && npm run seed:billing-catalog
 */
import { pathToFileURL } from 'node:url'
import { Prisma } from '@prisma/client'
import { prisma } from './lib/prisma.js'
import { INITIAL_PLAN_PRICES } from './lib/billing/usage-mode.js'
import {
  seedModuleUpdateData,
  seedPlanUpdateData,
} from './lib/billing/seed-catalog-fields.js'

/** Defaults iniciales de suplemento por viviendas contractuales (solo si tabla vacía). */
const INITIAL_SIZE_TIERS: Array<{
  fromUnits: number
  toUnits: number | null
  surchargeEur: string
  sortOrder: number
}> = [
  { fromUnits: 0, toUnits: 100, surchargeEur: '0.00', sortOrder: 10 },
  { fromUnits: 101, toUnits: 200, surchargeEur: '15.00', sortOrder: 20 },
  { fromUnits: 201, toUnits: 300, surchargeEur: '30.00', sortOrder: 30 },
  { fromUnits: 301, toUnits: null, surchargeEur: '45.00', sortOrder: 40 },
]

const PLANS: Array<{
  code: string
  name: string
  monthlyPriceEur: string
  includes: string[]
  sortOrder: number
}> = [
  {
    code: 'comunidad',
    name: 'Vecindario Comunidad',
    monthlyPriceEur: '44.00',
    includes: ['incidents', 'bookings'],
    sortOrder: 10,
  },
  {
    code: 'conserjeria',
    name: 'Vecindario Conserjería',
    monthlyPriceEur: '46.00',
    includes: ['parcels', 'key_loans', 'diario', 'control_entrada'],
    sortOrder: 20,
  },
  {
    code: 'completo',
    name: 'Vecindario Completo',
    monthlyPriceEur: '69.00',
    includes: [
      'incidents',
      'bookings',
      'services',
      'pool',
      'parcels',
      'key_loans',
      'diario',
      'control_entrada',
    ],
    sortOrder: 30,
  },
  {
    code: 'a_medida',
    name: 'A medida',
    monthlyPriceEur: '24.00',
    includes: [],
    sortOrder: 40,
  },
]

const MODULES: Array<{
  code: string
  name: string
  listPriceEur: string
  flagKey: string
  sortOrder: number
}> = [
  {
    code: 'incidents',
    name: 'Incidencias',
    listPriceEur: '10.00',
    flagKey: 'appNavIncidentsEnabled',
    sortOrder: 10,
  },
  {
    code: 'bookings',
    name: 'Reservas',
    listPriceEur: '14.00',
    flagKey: 'appNavBookingsEnabled',
    sortOrder: 20,
  },
  {
    code: 'services',
    name: 'Servicios',
    listPriceEur: '7.00',
    flagKey: 'appNavServicesEnabled',
    sortOrder: 30,
  },
  {
    code: 'pool',
    name: 'Acceso piscina',
    listPriceEur: '12.00',
    flagKey: 'appNavPoolAccessEnabled',
    sortOrder: 40,
  },
  {
    code: 'parcels',
    name: 'Paquetería (incluye entrega especial)',
    listPriceEur: '11.00',
    flagKey: 'appNavPaqueteriaEnabled',
    sortOrder: 50,
  },
  {
    code: 'key_loans',
    name: 'Registro de llaves',
    listPriceEur: '4.00',
    flagKey: 'paqueteriaKeyLoansEnabled',
    sortOrder: 60,
  },
  {
    code: 'diario',
    name: 'Cuaderno diario',
    listPriceEur: '5.00',
    flagKey: 'appNavCuadernoDiarioEnabled',
    sortOrder: 70,
  },
  {
    code: 'control_entrada',
    name: 'Control de entrada',
    listPriceEur: '6.00',
    flagKey: 'appNavControlEntradaEnabled',
    sortOrder: 80,
  },
]

async function main() {
  const billingBefore = await prisma.communityBilling.count()
  const linesBefore = await prisma.communityBillingLine.count()

  for (const p of PLANS) {
    await prisma.billingCatalogPlan.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        name: p.name,
        monthlyPriceEur: new Prisma.Decimal(p.monthlyPriceEur),
        includesJson: p.includes,
        active: true,
        sortOrder: p.sortOrder,
      },
      update: seedPlanUpdateData(p),
    })
  }

  for (const m of MODULES) {
    await prisma.billingCatalogModule.upsert({
      where: { code: m.code },
      create: {
        code: m.code,
        name: m.name,
        listPriceEur: new Prisma.Decimal(m.listPriceEur),
        flagKey: m.flagKey,
        parentCode: null,
        active: true,
        sortOrder: m.sortOrder,
      },
      update: seedModuleUpdateData(m),
    })
  }

  // Precios plan×usageMode: create-only (skipDuplicates). Nunca sobrescribe editados.
  await prisma.billingCatalogPlanPrice.createMany({
    data: INITIAL_PLAN_PRICES.map((row) => ({
      planCode: row.planCode,
      usageMode: row.usageMode,
      monthlyPriceEur: new Prisma.Decimal(row.monthlyPriceEur),
    })),
    skipDuplicates: true,
  })

  // Tramos por tamaño: solo si vacío. Nunca overwrite de UI Super Admin.
  const sizeTierBefore = await prisma.billingCatalogSizeTier.count()
  let sizeTiersSeeded = 0
  if (sizeTierBefore === 0) {
    const created = await prisma.billingCatalogSizeTier.createMany({
      data: INITIAL_SIZE_TIERS.map((t) => ({
        fromUnits: t.fromUnits,
        toUnits: t.toUnits,
        surchargeEur: new Prisma.Decimal(t.surchargeEur),
        sortOrder: t.sortOrder,
        active: true,
      })),
    })
    sizeTiersSeeded = created.count
  }

  const planCount = await prisma.billingCatalogPlan.count()
  const moduleCount = await prisma.billingCatalogModule.count()
  const planPriceCount = await prisma.billingCatalogPlanPrice.count()
  const sizeTierCount = await prisma.billingCatalogSizeTier.count()
  const billingAfter = await prisma.communityBilling.count()
  const linesAfter = await prisma.communityBillingLine.count()

  console.log(
    `[seed-billing-catalog] OK — planes=${planCount}, módulos=${moduleCount}, plan_prices=${planPriceCount}, size_tiers=${sizeTierCount} (seeded=${sizeTiersSeeded})`,
  )
  console.log(
    `[seed-billing-catalog] community_billing before=${billingBefore} after=${billingAfter} (intactos)`,
  )
  console.log(
    `[seed-billing-catalog] community_billing_lines before=${linesBefore} after=${linesAfter} (intactos)`,
  )
  if (billingBefore !== billingAfter || linesBefore !== linesAfter) {
    console.error('[seed-billing-catalog] ALERTA: cambió el número de filas de contratos')
    process.exitCode = 1
  }
}

const isEntrypoint =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]!).href

if (isEntrypoint) {
  main()
    .catch((e) => {
      console.error('[seed-billing-catalog]', e)
      process.exitCode = 1
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
