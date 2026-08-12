/**
 * Soporte / Tickets — lógica de negocio + rate limits.
 * createdByUserId siempre del JWT; community/company solo desde DB del usuario.
 */
import { prisma } from './prisma.js'
import { SlidingWindowRateLimiter } from './password-reset.js'
import {
  SUPPORT_BODY_MAX,
  SUPPORT_SUBJECT_MAX,
  isSupportAreaCode,
  isSupportPriority,
  isSupportStatus,
  type SupportAreaCode,
  type SupportPriority,
  type SupportStatus,
} from './support-catalog.js'
import { notifySupportEvents } from './support-notifications.js'
import { canUseSupportSelfService } from './support-access.js'

export class SupportError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'SupportError'
  }
}

const createLimiter = new SlidingWindowRateLimiter()
const messageLimiter = new SlidingWindowRateLimiter()

/** Crear ticket: 8 / hora por usuario. */
export const SUPPORT_CREATE_LIMIT = 8
export const SUPPORT_CREATE_WINDOW_MS = 60 * 60 * 1000
/** Mensajes: 30 / 15 min por usuario. */
export const SUPPORT_MSG_LIMIT = 30
export const SUPPORT_MSG_WINDOW_MS = 15 * 60 * 1000

function clipSubject(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim().replace(/\s+/g, ' ')
  if (!t || t.length > SUPPORT_SUBJECT_MAX) return null
  return t
}

function clipBody(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  if (!t || t.length > SUPPORT_BODY_MAX) return null
  return t
}

export function isStaffUnread(ticket: {
  lastMessageAt: Date
  staffLastReadAt: Date | null
  lastAuthorIsCreator: boolean
}): boolean {
  if (!ticket.lastAuthorIsCreator) return false
  if (!ticket.staffLastReadAt) return true
  return ticket.lastMessageAt.getTime() > ticket.staffLastReadAt.getTime()
}

export function isUserUnread(ticket: {
  lastMessageAt: Date
  userLastReadAt: Date | null
  lastAuthorIsCreator: boolean
}): boolean {
  if (ticket.lastAuthorIsCreator) return false
  if (!ticket.userLastReadAt) return true
  return ticket.lastMessageAt.getTime() > ticket.userLastReadAt.getTime()
}

type AuthorSnap = {
  id: number
  name: string | null
  email: string | null
  role: string
}

function serializeAuthor(u: AuthorSnap) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
  }
}

async function lastAuthorIsCreator(
  ticketId: number,
  createdByUserId: number,
): Promise<boolean> {
  const last = await prisma.supportTicketMessage.findFirst({
    where: { ticketId },
    orderBy: { createdAt: 'desc' },
    select: { authorUserId: true },
  })
  return last?.authorUserId === createdByUserId
}

export async function serializeTicketListItem(
  t: {
    id: number
    area: string
    subject: string
    status: string
    priority: string
    communityId: number | null
    companyId: number | null
    createdByUserId: number
    lastMessageAt: Date
    userLastReadAt: Date | null
    staffLastReadAt: Date | null
    createdAt: Date
    updatedAt: Date
    closedAt: Date | null
    createdBy?: AuthorSnap & { community?: { id: number; name: string } | null }
    community?: { id: number; name: string } | null
    _count?: { messages: number }
  },
  viewer: 'user' | 'staff',
) {
  const lastIsCreator = await lastAuthorIsCreator(t.id, t.createdByUserId)
  const unread =
    viewer === 'staff'
      ? isStaffUnread({
          lastMessageAt: t.lastMessageAt,
          staffLastReadAt: t.staffLastReadAt,
          lastAuthorIsCreator: lastIsCreator,
        })
      : isUserUnread({
          lastMessageAt: t.lastMessageAt,
          userLastReadAt: t.userLastReadAt,
          lastAuthorIsCreator: lastIsCreator,
        })

  return {
    id: t.id,
    area: t.area,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    communityId: t.communityId,
    communityName: t.community?.name ?? t.createdBy?.community?.name ?? null,
    companyId: t.companyId,
    createdByUserId: t.createdByUserId,
    createdBy: t.createdBy
      ? serializeAuthor(t.createdBy)
      : null,
    lastMessageAt: t.lastMessageAt.toISOString(),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    closedAt: t.closedAt?.toISOString() ?? null,
    messageCount: t._count?.messages ?? undefined,
    unread,
  }
}

export async function createSupportTicket(opts: {
  userId: number
  area: unknown
  subject: unknown
  body: unknown
}): Promise<{ id: number }> {
  if (!createLimiter.allow(`u:${opts.userId}`, SUPPORT_CREATE_LIMIT, SUPPORT_CREATE_WINDOW_MS)) {
    throw new SupportError(429, 'Demasiados tickets. Espera un rato e inténtalo de nuevo.')
  }
  if (!isSupportAreaCode(opts.area)) {
    throw new SupportError(400, 'Área no válida.')
  }
  const subject = clipSubject(opts.subject)
  const body = clipBody(opts.body)
  if (!subject) throw new SupportError(400, 'El asunto es obligatorio.')
  if (!body) throw new SupportError(400, 'La descripción es obligatoria.')

  const user = await prisma.vecindarioUser.findUnique({
    where: { id: opts.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      communityId: true,
      companyAdminCompanyId: true,
      community: { select: { id: true, name: true } },
    },
  })
  if (!user) throw new SupportError(401, 'Unauthorized')
  if (!canUseSupportSelfService(user.role)) {
    throw new SupportError(
      403,
      'Soporte está disponible para personal y administración, no para vecinos.',
    )
  }

  const now = new Date()
  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.supportTicket.create({
      data: {
        createdByUserId: user.id,
        communityId: user.communityId,
        companyId: user.companyAdminCompanyId,
        area: opts.area as SupportAreaCode,
        subject,
        status: 'open',
        priority: 'normal',
        lastMessageAt: now,
        userLastReadAt: now,
        staffLastReadAt: null,
      },
    })
    await tx.supportTicketMessage.create({
      data: {
        ticketId: created.id,
        authorUserId: user.id,
        body,
      },
    })
    return created
  })

  void notifySupportEvents
    .ticketCreated({
      ticketId: ticket.id,
      subject,
      area: opts.area as SupportAreaCode,
      creatorName: user.name,
      creatorEmail: user.email,
      creatorRole: user.role,
      communityName: user.community?.name ?? null,
    })
    .catch((e) => console.error('[support notify create]', e))

  return { id: ticket.id }
}

export async function listMySupportTickets(userId: number) {
  const rows = await prisma.supportTicket.findMany({
    where: { createdByUserId: userId },
    orderBy: { lastMessageAt: 'desc' },
    include: {
      community: { select: { id: true, name: true } },
      _count: { select: { messages: true } },
    },
  })
  return Promise.all(rows.map((t) => serializeTicketListItem(t, 'user')))
}

async function loadTicketOrThrow(ticketId: number) {
  const t = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          community: { select: { id: true, name: true } },
        },
      },
      community: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: {
          author: { select: { id: true, name: true, email: true, role: true } },
        },
      },
    },
  })
  if (!t) throw new SupportError(404, 'Ticket no encontrado')
  return t
}

export async function getMySupportTicket(userId: number, ticketId: number) {
  const t = await loadTicketOrThrow(ticketId)
  if (t.createdByUserId !== userId) throw new SupportError(403, 'Forbidden')
  const now = new Date()
  await prisma.supportTicket.update({
    where: { id: t.id },
    data: { userLastReadAt: now },
  })
  const list = await serializeTicketListItem({ ...t, userLastReadAt: now }, 'user')
  return {
    ...list,
    messages: t.messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      author: serializeAuthor(m.author),
      fromCreator: m.authorUserId === t.createdByUserId,
    })),
    canReply: t.status !== 'closed',
  }
}

export async function replyMySupportTicket(opts: {
  userId: number
  ticketId: number
  body: unknown
}) {
  if (!messageLimiter.allow(`u:${opts.userId}`, SUPPORT_MSG_LIMIT, SUPPORT_MSG_WINDOW_MS)) {
    throw new SupportError(429, 'Demasiados mensajes. Espera un rato e inténtalo de nuevo.')
  }
  const body = clipBody(opts.body)
  if (!body) throw new SupportError(400, 'El mensaje es obligatorio.')

  const t = await prisma.supportTicket.findUnique({
    where: { id: opts.ticketId },
    select: {
      id: true,
      createdByUserId: true,
      status: true,
      subject: true,
      area: true,
    },
  })
  if (!t) throw new SupportError(404, 'Ticket no encontrado')
  if (t.createdByUserId !== opts.userId) throw new SupportError(403, 'Forbidden')
  if (t.status === 'closed') {
    throw new SupportError(400, 'Este ticket está cerrado. No se pueden enviar más mensajes.')
  }

  const now = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.supportTicketMessage.create({
      data: { ticketId: t.id, authorUserId: opts.userId, body },
    })
    const data: {
      lastMessageAt: Date
      userLastReadAt: Date
      updatedAt: Date
      status?: string
    } = {
      lastMessageAt: now,
      userLastReadAt: now,
      updatedAt: now,
    }
    if (t.status === 'waiting_user' || t.status === 'resolved') {
      data.status = 'open'
    }
    await tx.supportTicket.update({ where: { id: t.id }, data })
  })

  void notifySupportEvents
    .userReplied({ ticketId: t.id, subject: t.subject, preview: body })
    .catch((e) => console.error('[support notify user reply]', e))

  return getMySupportTicket(opts.userId, t.id)
}

export async function adminListSupportTickets(query: {
  status?: string
  priority?: string
  area?: string
  communityId?: string
  q?: string
  unreadOnly?: boolean
}) {
  const where: Record<string, unknown> = {}
  if (query.status && isSupportStatus(query.status)) where.status = query.status
  if (query.priority && isSupportPriority(query.priority)) where.priority = query.priority
  if (query.area && isSupportAreaCode(query.area)) where.area = query.area
  if (query.communityId) {
    const cid = Number.parseInt(String(query.communityId), 10)
    if (Number.isInteger(cid) && cid > 0) where.communityId = cid
  }
  const q = typeof query.q === 'string' ? query.q.trim() : ''
  if (q) {
    where.OR = [
      { subject: { contains: q } },
      { createdBy: { email: { contains: q } } },
      { createdBy: { name: { contains: q } } },
    ]
  }

  const rows = await prisma.supportTicket.findMany({
    where,
    orderBy: { lastMessageAt: 'desc' },
    take: 200,
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          community: { select: { id: true, name: true } },
        },
      },
      community: { select: { id: true, name: true } },
      _count: { select: { messages: true } },
    },
  })

  let items = await Promise.all(rows.map((t) => serializeTicketListItem(t, 'staff')))
  if (query.unreadOnly) {
    items = items.filter((i) => i.unread)
  }
  return items
}

export async function adminUnreadSupportCount(): Promise<number> {
  const rows = await prisma.supportTicket.findMany({
    where: { status: { not: 'closed' } },
    select: {
      id: true,
      createdByUserId: true,
      lastMessageAt: true,
      staffLastReadAt: true,
    },
    take: 500,
  })
  let n = 0
  for (const t of rows) {
    const lastIsCreator = await lastAuthorIsCreator(t.id, t.createdByUserId)
    if (
      isStaffUnread({
        lastMessageAt: t.lastMessageAt,
        staffLastReadAt: t.staffLastReadAt,
        lastAuthorIsCreator: lastIsCreator,
      })
    ) {
      n += 1
    }
  }
  return n
}

export async function getAdminSupportTicket(ticketId: number) {
  const t = await loadTicketOrThrow(ticketId)
  const now = new Date()
  await prisma.supportTicket.update({
    where: { id: t.id },
    data: { staffLastReadAt: now },
  })
  const list = await serializeTicketListItem({ ...t, staffLastReadAt: now }, 'staff')
  return {
    ...list,
    messages: t.messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      author: serializeAuthor(m.author),
      fromCreator: m.authorUserId === t.createdByUserId,
    })),
  }
}

export async function adminReplySupportTicket(opts: {
  staffUserId: number
  ticketId: number
  body: unknown
}) {
  if (!messageLimiter.allow(`s:${opts.staffUserId}`, SUPPORT_MSG_LIMIT, SUPPORT_MSG_WINDOW_MS)) {
    throw new SupportError(429, 'Demasiados mensajes. Espera un rato e inténtalo de nuevo.')
  }
  const body = clipBody(opts.body)
  if (!body) throw new SupportError(400, 'El mensaje es obligatorio.')

  const t = await prisma.supportTicket.findUnique({
    where: { id: opts.ticketId },
    select: {
      id: true,
      createdByUserId: true,
      status: true,
      subject: true,
      createdBy: { select: { email: true, name: true, notifyEmail: true } },
    },
  })
  if (!t) throw new SupportError(404, 'Ticket no encontrado')

  const now = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.supportTicketMessage.create({
      data: { ticketId: t.id, authorUserId: opts.staffUserId, body },
    })
    const data: {
      lastMessageAt: Date
      staffLastReadAt: Date
      updatedAt: Date
      status?: string
      closedAt?: Date | null
    } = {
      lastMessageAt: now,
      staffLastReadAt: now,
      updatedAt: now,
    }
    if (t.status === 'open' || t.status === 'in_progress') {
      data.status = 'waiting_user'
    }
    if (t.status === 'closed') {
      data.status = 'in_progress'
      data.closedAt = null
    }
    await tx.supportTicket.update({ where: { id: t.id }, data })
  })

  void notifySupportEvents
    .staffReplied({
      ticketId: t.id,
      subject: t.subject,
      preview: body,
      requesterUserId: t.createdByUserId,
      requesterEmail: t.createdBy.notifyEmail === false ? null : t.createdBy.email,
      requesterName: t.createdBy.name,
    })
    .catch((e) => console.error('[support notify staff reply]', e))

  return getAdminSupportTicket(t.id)
}

export async function adminPatchSupportTicket(opts: {
  ticketId: number
  status?: unknown
  priority?: unknown
}) {
  const t = await prisma.supportTicket.findUnique({ where: { id: opts.ticketId } })
  if (!t) throw new SupportError(404, 'Ticket no encontrado')

  const data: {
    status?: SupportStatus
    priority?: SupportPriority
    closedAt?: Date | null
  } = {}

  if (opts.status !== undefined) {
    if (!isSupportStatus(opts.status)) throw new SupportError(400, 'Estado no válido.')
    data.status = opts.status
    if (opts.status === 'closed') data.closedAt = new Date()
    else if (t.status === 'closed') data.closedAt = null
  }
  if (opts.priority !== undefined) {
    if (!isSupportPriority(opts.priority)) throw new SupportError(400, 'Prioridad no válida.')
    data.priority = opts.priority
  }
  if (Object.keys(data).length === 0) {
    throw new SupportError(400, 'Nada que actualizar.')
  }

  await prisma.supportTicket.update({ where: { id: t.id }, data })
  return getAdminSupportTicket(t.id)
}

/** Solo tests. */
export function _resetSupportRateLimitersForTests() {
  createLimiter.reset()
  messageLimiter.reset()
}
