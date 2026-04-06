import cron from 'node-cron'
import { prisma } from '../lib/prisma.js'

/** Inicio del día UTC (00:00) para comparar con columnas DATE del plan. */
function startOfTodayUtc(): Date {
  const n = new Date()
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
}

/**
 * Comunidades en active con plan_expires_on estrictamente anterior a hoy (UTC) → inactive.
 * El último día de la fecha elegida sigue siendo válido.
 */
export async function runSubscriptionExpiryOnce(): Promise<number> {
  const boundary = startOfTodayUtc()
  const r = await prisma.community.updateMany({
    where: {
      status: 'active',
      planExpiresOn: { not: null, lt: boundary },
    },
    data: { status: 'inactive' },
  })
  return r.count
}

/** Cron diario 03:00 hora local del servidor. Desactivar: SUBSCRIPTION_CRON_DISABLED=1 */
export function scheduleSubscriptionExpiryJob(): void {
  const off = process.env.SUBSCRIPTION_CRON_DISABLED
  if (off === '1' || off === 'true' || off === 'yes') {
    console.log('[subscription-expiry] cron desactivado (SUBSCRIPTION_CRON_DISABLED)')
    return
  }
  cron.schedule('0 3 * * *', async () => {
    try {
      const n = await runSubscriptionExpiryOnce()
      if (n > 0) {
        console.log(`[subscription-expiry] ${n} comunidad(es) pasadas a inactive (plan vencido)`)
      }
    } catch (e) {
      console.error('[subscription-expiry]', e)
    }
  })
  console.log('[subscription-expiry] cron programado: cada día 03:00 (hora local del servidor)')
}
