/**
 * Notificaciones + email Soporte. Fallos SMTP solo log; no rompen el flujo.
 */
import { prisma } from './prisma.js'
import { isMailConfigured, sendMail } from './mail.js'
import { distributorContactEmail } from './distributor-contact.js'
import { pushDelivery } from './push-delivery.js'
import { realtimeHub } from './realtime-hub.js'
import type { SupportAreaCode } from './support-catalog.js'
import {
  buildSupportNewTicketEmail,
  buildSupportStaffReplyEmail,
  buildSupportUserReplyEmail,
} from './support-mail.js'

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
  supportTicketId: number,
) {
  if (!Number.isInteger(recipientUserId) || recipientUserId < 1) return
  await notifDb.vecindarioNotification.create({
    data: { recipientUserId, type, title, body, supportTicketId },
  })
}

async function notifyMany(
  ids: number[],
  type: string,
  title: string,
  body: string,
  supportTicketId: number,
) {
  const unique = [...new Set(ids)].filter((id) => Number.isInteger(id) && id >= 1)
  if (!unique.length) return
  await notifDb.vecindarioNotification.createMany({
    data: unique.map((recipientUserId) => ({
      recipientUserId,
      type,
      title,
      body,
      supportTicketId,
    })),
  })
}

function queuePush(userIds: number[], title: string, body: string, supportTicketId: number) {
  const ids = [...new Set(userIds)].filter((id) => Number.isInteger(id) && id >= 1)
  if (!ids.length) return
  realtimeHub.emitNotificationRefresh(ids)
  void pushDelivery
    .sendToUsers(ids, title, body, { supportTicketId })
    .catch((e) => console.error('[support push]', e))
}

async function safeSend(to: string, content: { subject: string; text: string; html: string }) {
  if (!isMailConfigured()) return
  try {
    await sendMail({ to, subject: content.subject, text: content.text, html: content.html })
  } catch (e) {
    console.error('[support mail]', e instanceof Error ? e.message : e)
  }
}

export const notifySupportEvents = {
  async ticketCreated(opts: {
    ticketId: number
    subject: string
    area: SupportAreaCode
    creatorName: string | null
    creatorEmail: string | null
    creatorRole: string
    communityName: string | null
  }) {
    const supportTo = distributorContactEmail()
    if (supportTo) {
      await safeSend(supportTo, buildSupportNewTicketEmail(opts))
    }
    const ids = await superAdminIds()
    const title = 'Nuevo ticket de soporte'
    const body = `#${opts.ticketId}: ${clip(opts.subject, 180)}`
    await notifyMany(ids, 'support_ticket_new', title, body, opts.ticketId)
    queuePush(ids, title, body, opts.ticketId)
  },

  async userReplied(opts: { ticketId: number; subject: string; preview: string }) {
    const supportTo = distributorContactEmail()
    if (supportTo) {
      await safeSend(supportTo, buildSupportUserReplyEmail(opts))
    }
    const ids = await superAdminIds()
    const title = 'Respuesta en ticket de soporte'
    const body = `#${opts.ticketId}: ${clip(opts.preview, 200)}`
    await notifyMany(ids, 'support_message_in', title, body, opts.ticketId)
    queuePush(ids, title, body, opts.ticketId)
  },

  async staffReplied(opts: {
    ticketId: number
    subject: string
    preview: string
    requesterUserId: number
    requesterEmail: string | null
    requesterName: string | null
  }) {
    if (opts.requesterEmail) {
      await safeSend(opts.requesterEmail, buildSupportStaffReplyEmail(opts))
    }
    const title = 'Respuesta de soporte'
    const body = `Ticket #${opts.ticketId}: ${clip(opts.preview, 200)}`
    await notifyOne(opts.requesterUserId, 'support_message_out', title, body, opts.ticketId)
    queuePush([opts.requesterUserId], title, body, opts.ticketId)
  },
}
