import { prisma } from './prisma.js'
import { pushDelivery } from './push-delivery.js'
import { realtimeHub } from './realtime-hub.js'

/** Hasta que `prisma generate` actualice el cliente (modelo VecindarioNotification). */
const notifDb = prisma as unknown as {
  vecindarioNotification: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>
    createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }>
  }
}

function clip(s: string, max: number) {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

async function superAdminIds(): Promise<number[]> {
  const rows = await prisma.vecindarioUser.findMany({
    where: { role: 'super_admin' },
    select: { id: true },
  })
  return rows.map((r) => r.id)
}

async function notifyOne(
  recipientUserId: number,
  type: string,
  title: string,
  body: string,
  serviceRequestId?: number | null,
) {
  if (!Number.isInteger(recipientUserId) || recipientUserId < 1) return
  await notifDb.vecindarioNotification.create({
    data: {
      recipientUserId,
      type,
      title,
      body,
      serviceRequestId: serviceRequestId ?? null,
    },
  })
}

async function notifyMany(
  recipientUserIds: number[],
  type: string,
  title: string,
  body: string,
  serviceRequestId?: number | null,
) {
  const unique = [...new Set(recipientUserIds)].filter((id) => Number.isInteger(id) && id >= 1)
  if (!unique.length) return
  await notifDb.vecindarioNotification.createMany({
    data: unique.map((recipientUserId) => ({
      recipientUserId,
      type,
      title,
      body,
      serviceRequestId: serviceRequestId ?? null,
    })),
  })
}

function queueLivePush(
  userIds: number[],
  title: string,
  body: string,
  serviceRequestId?: number | null,
) {
  const ids = [...new Set(userIds)].filter((id) => Number.isInteger(id) && id >= 1)
  if (!ids.length) return
  realtimeHub.emitNotificationRefresh(ids)
  void pushDelivery
    .sendToUsers(ids, title, body, { serviceRequestId: serviceRequestId ?? undefined })
    .catch(logNotifyErr)
}

/** Fire-and-forget helpers: errores solo log. */
export const serviceNotifications = {
  async newServiceRequest(opts: { id: number; communityName: string; categoryLabel: string }) {
    const ids = await superAdminIds()
    const title = 'Nueva solicitud de servicio'
    const body = `${opts.communityName}: ${opts.categoryLabel} · #${opts.id}`
    await notifyMany(ids, 'service_new', title, body, opts.id)
    queueLivePush(ids, title, body, opts.id)
  },

  async neighborWrote(opts: { serviceRequestId: number; preview: string }) {
    const ids = await superAdminIds()
    const title = 'Mensaje del vecino'
    const body = `#${opts.serviceRequestId}: ${clip(opts.preview, 220)}`
    await notifyMany(ids, 'service_message_in', title, body, opts.serviceRequestId)
    queueLivePush(ids, title, body, opts.serviceRequestId)
  },

  async adminWrote(opts: { serviceRequestId: number; requesterUserId: number; preview: string }) {
    const title = 'Mensaje de administración'
    const body = `Solicitud #${opts.serviceRequestId}: ${clip(opts.preview, 220)}`
    await notifyOne(opts.requesterUserId, 'service_message_out', title, body, opts.serviceRequestId)
    queueLivePush([opts.requesterUserId], title, body, opts.serviceRequestId)
  },

  async priceSent(opts: { serviceRequestId: number; requesterUserId: number }) {
    const title = 'Presupuesto enviado'
    const body = `Revisa el precio orientativo en la solicitud #${opts.serviceRequestId}.`
    await notifyOne(opts.requesterUserId, 'service_price_sent', title, body, opts.serviceRequestId)
    queueLivePush([opts.requesterUserId], title, body, opts.serviceRequestId)
  },

  async neighborAccepted(opts: { serviceRequestId: number }) {
    const ids = await superAdminIds()
    const title = 'Presupuesto aceptado'
    const body = `El vecino aceptó la propuesta · solicitud #${opts.serviceRequestId}.`
    await notifyMany(ids, 'service_accepted', title, body, opts.serviceRequestId)
    queueLivePush(ids, title, body, opts.serviceRequestId)
  },

  async neighborRejected(opts: { serviceRequestId: number }) {
    const ids = await superAdminIds()
    const title = 'Presupuesto rechazado'
    const body = `El vecino rechazó la propuesta · solicitud #${opts.serviceRequestId}.`
    await notifyMany(ids, 'service_rejected', title, body, opts.serviceRequestId)
    queueLivePush(ids, title, body, opts.serviceRequestId)
  },

  async inProgress(opts: { serviceRequestId: number; requesterUserId: number; providerName: string }) {
    const title = 'Servicio en curso'
    const body = `Proveedor asignado (${clip(opts.providerName, 80)}) · solicitud #${opts.serviceRequestId}.`
    await notifyOne(opts.requesterUserId, 'service_in_progress', title, body, opts.serviceRequestId)
    queueLivePush([opts.requesterUserId], title, body, opts.serviceRequestId)
  },

  async completedByAdmin(opts: { serviceRequestId: number; requesterUserId: number }) {
    const title = 'Servicio completado'
    const body = `La administración cerró la solicitud #${opts.serviceRequestId}.`
    await notifyOne(opts.requesterUserId, 'service_completed', title, body, opts.serviceRequestId)
    queueLivePush([opts.requesterUserId], title, body, opts.serviceRequestId)
  },

  async completedByNeighbor(opts: { serviceRequestId: number }) {
    const ids = await superAdminIds()
    const title = 'Servicio marcado completado'
    const body = `El vecino marcó como completada la solicitud #${opts.serviceRequestId}.`
    await notifyMany(ids, 'service_completed_neighbor', title, body, opts.serviceRequestId)
    queueLivePush(ids, title, body, opts.serviceRequestId)
  },
}

export function logNotifyErr(err: unknown) {
  console.error('[vecindario-notifications]', err)
}
