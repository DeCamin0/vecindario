import { Router } from 'express'
import type { Community, VecindarioUser } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import {
  sendBookingCancelledNotifications,
  sendBookingCreatedNotifications,
} from '../lib/booking-confirmation-mail.js'
import { requireAuth } from '../middleware/require-auth.js'
import { juntaRoleForResident } from '../lib/community-board-junta.js'
import { companyAdminOwnsCommunity, userLinkedToCommunity } from '../lib/community-user-access.js'
import { residentMatchesPresidentUnit } from '../lib/president-by-unit.js'
import { isCommunityOperationalStatus } from '../lib/community-status.js'
import { conciergeEmailMatches } from '../lib/concierge-emails.js'

export const communityBookingsRouter = Router()

function normEmail(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim().toLowerCase()
  return t || null
}

function assertUserMayAccessCommunity(
  user: VecindarioUser,
  comm: Community | null,
): boolean {
  if (!comm || !isCommunityOperationalStatus(comm.status)) return false
  const e = normEmail(user.email)
  if (user.role === 'super_admin') return true
  if (companyAdminOwnsCommunity(user, comm)) return true
  if (user.role === 'community_admin' && normEmail(comm.communityAdminEmail) === e) return true
  if (user.role === 'president' && normEmail(comm.presidentEmail) === e) return true
  if (
    user.role === 'resident' &&
    residentMatchesPresidentUnit(comm, user)
  )
    return true
  if (user.role === 'concierge' && conciergeEmailMatches(comm, e)) return true
  return false
}

/**
 * Actividad / gimnasio / crear reserva como vecino: mismo criterio que en admin «vinculado»
 * (communityId, personal de gestión, o ya hay reservas o registros de gimnasio en esa comunidad).
 */
async function userMayUseCommunityMemberBookingsFeatures(
  user: VecindarioUser,
  comm: Community | null,
): Promise<boolean> {
  if (!comm || !isCommunityOperationalStatus(comm.status)) return false
  if (assertUserMayAccessCommunity(user, comm)) return true
  if (user.communityId != null && user.communityId === comm.id) return true
  return userLinkedToCommunity(
    { id: user.id, email: user.email, role: user.role, communityId: user.communityId },
    comm,
  )
}

/** Conserje, administración, presidente, super_admin y cargos de junta (misma vivienda en ficha): ven toda la actividad de reservas/gimnasio. */
function userSeesCommunityWideBookingActivity(user: VecindarioUser, comm: Community): boolean {
  const juntaFields = {
    presidentPortal: comm.presidentPortal,
    presidentPiso: comm.presidentPiso,
    presidentPuerta: comm.presidentPuerta,
    boardVicePortal: comm.boardVicePortal,
    boardVicePiso: comm.boardVicePiso,
    boardVicePuerta: comm.boardVicePuerta,
    boardVocalsJson: comm.boardVocalsJson,
  }
  if (assertUserMayAccessCommunity(user, comm)) return true
  const portal = user.portal?.trim() ?? ''
  const piso = user.piso?.trim() ?? ''
  const puerta = user.puerta?.trim() ?? ''
  if (!portal || !piso) return false
  return juntaRoleForResident(portal, piso, puerta, juntaFields) != null
}

function parseBookingDate(s: unknown): Date | null {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null
  return new Date(Date.UTC(y, m - 1, d))
}

function parseMinute(n: unknown): number | null {
  const v = typeof n === 'number' ? n : typeof n === 'string' ? Number.parseInt(n, 10) : NaN
  if (!Number.isInteger(v) || v < 0 || v > 1440) return null
  return v
}

function bookedByDisplayName(user: VecindarioUser): string | null {
  const name = user.name?.trim()
  if (name) return name.slice(0, 255)
  const mail = user.email?.trim()
  return mail ? mail.slice(0, 255) : null
}

function mapBookingRowJson(r: {
  id: number
  communityId: number
  facilityId: string
  facilityName: string | null
  bookingDate: Date
  startMinute: number
  endMinute: number
  slotKey: string | null
  slotLabel: string | null
  actorEmail: string | null
  actorPiso: string | null
  actorPortal: string | null
  bookedByUserId: number | null
  bookedByName: string | null
  vecindarioUserId: number | null
  createdAt: Date
  user?: { name: string | null; email: string | null } | null
}) {
  const residentName = r.user?.name?.trim() || null
  const residentEmail = r.user?.email?.trim() || r.actorEmail?.trim() || null
  return {
    id: r.id,
    communityId: r.communityId,
    facilityId: r.facilityId,
    facilityName: r.facilityName,
    bookingDate: r.bookingDate.toISOString().slice(0, 10),
    startMinute: r.startMinute,
    endMinute: r.endMinute,
    slotKey: r.slotKey,
    slotLabel: r.slotLabel,
    actorEmail: r.actorEmail,
    actorPiso: r.actorPiso,
    actorPortal: r.actorPortal,
    residentName,
    residentEmail,
    bookedByUserId: r.bookedByUserId,
    bookedByName: r.bookedByName,
    vecindarioUserId: r.vecindarioUserId,
    createdAt: r.createdAt.toISOString(),
  }
}

/** Propia reserva o conserje de la comunidad. */
function userMayCancelBooking(
  user: VecindarioUser,
  comm: Community,
  row: { communityId: number; vecindarioUserId: number | null; actorEmail: string | null; status: string },
): boolean {
  if (row.status !== 'confirmed' || row.communityId !== comm.id) return false
  if (user.role === 'concierge' && assertUserMayAccessCommunity(user, comm)) return true
  if (row.vecindarioUserId != null && row.vecindarioUserId === user.id) return true
  const actor = normEmail(row.actorEmail)
  const self = normEmail(user.email)
  return Boolean(actor && self && actor === self)
}

/** Reservas en BD + registros gimnasio solo del usuario actual (Mi actividad). */
communityBookingsRouter.get('/activity', requireAuth, async (req, res) => {
  const communityId = Number(req.query.communityId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido' })
    return
  }

  const user = await prisma.vecindarioUser.findUnique({ where: { id: req.userId! } })
  const comm = await prisma.community.findUnique({ where: { id: communityId } })
  if (!user || !comm || !(await userMayUseCommunityMemberBookingsFeatures(user, comm))) {
    res.status(403).json({ error: 'No autorizado' })
    return
  }

  const communityWide = userSeesCommunityWideBookingActivity(user, comm)
  const bookingWhere = communityWide
    ? { communityId, status: 'confirmed' as const }
    : { communityId, vecindarioUserId: user.id, status: 'confirmed' as const }
  const gymWhere = communityWide
    ? { communityId }
    : { communityId, vecindarioUserId: user.id }
  const takeEach = communityWide ? 200 : 120

  const [bookingRows, gymRows] = await Promise.all([
    prisma.communityBooking.findMany({
      where: bookingWhere,
      orderBy: [{ createdAt: 'desc' }],
      take: takeEach,
      select: {
        id: true,
        facilityId: true,
        facilityName: true,
        bookingDate: true,
        slotKey: true,
        slotLabel: true,
        actorEmail: true,
        actorPiso: true,
        actorPortal: true,
        bookedByUserId: true,
        bookedByName: true,
        vecindarioUserId: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.communityGymAccessLog.findMany({
      where: gymWhere,
      orderBy: { createdAt: 'desc' },
      take: takeEach,
      select: {
        id: true,
        tipo: true,
        actorEmail: true,
        actorPiso: true,
        actorPortal: true,
        createdAt: true,
      },
    }),
  ])

  type Act = {
    kind: 'booking' | 'gym_access'
    id: number
    recordedAt: string
    facilityId?: string
    facilityName?: string | null
    bookingDate?: string
    slotKey?: string | null
    slotLabel?: string | null
    tipo?: string
    actorEmail?: string | null
    actorPiso?: string | null
    actorPortal?: string | null
    bookedByUserId?: number | null
    bookedByName?: string | null
    vecindarioUserId?: number | null
    residentName?: string | null
    residentEmail?: string | null
  }

  const items: Act[] = [
    ...bookingRows.map((r) => ({
      kind: 'booking' as const,
      id: r.id,
      recordedAt: r.createdAt.toISOString(),
      facilityId: r.facilityId,
      facilityName: r.facilityName,
      bookingDate: r.bookingDate.toISOString().slice(0, 10),
      slotKey: r.slotKey,
      slotLabel: r.slotLabel,
      actorEmail: r.actorEmail,
      actorPiso: r.actorPiso,
      actorPortal: r.actorPortal,
      bookedByUserId: r.bookedByUserId,
      bookedByName: r.bookedByName,
      vecindarioUserId: r.vecindarioUserId,
      residentName: r.user?.name?.trim() || null,
      residentEmail: r.user?.email?.trim() || r.actorEmail,
    })),
    ...gymRows.map((r) => ({
      kind: 'gym_access' as const,
      id: r.id,
      recordedAt: r.createdAt.toISOString(),
      tipo: r.tipo,
      actorEmail: r.actorEmail,
      actorPiso: r.actorPiso,
      actorPortal: r.actorPortal,
    })),
  ]

  items.sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))
  res.json({ items, scope: communityWide ? 'community' : 'personal' })
})

/** Vecinos/presidente con community_id (gestión: reservar en su nombre). */
communityBookingsRouter.get('/neighbors', requireAuth, async (req, res) => {
  const communityId = Number(req.query.communityId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido' })
    return
  }

  const user = await prisma.vecindarioUser.findUnique({ where: { id: req.userId! } })
  const comm = await prisma.community.findUnique({ where: { id: communityId } })
  if (!user || !comm || !assertUserMayAccessCommunity(user, comm)) {
    res.status(403).json({ error: 'No autorizado' })
    return
  }
  if (user.role !== 'concierge') {
    res.status(403).json({ error: 'Solo el conserje puede consultar la lista de vecinos para reservas.' })
    return
  }

  const rows = await prisma.vecindarioUser.findMany({
    where: {
      communityId,
      role: { in: ['resident', 'president'] },
    },
    select: {
      id: true,
      email: true,
      name: true,
      piso: true,
      portal: true,
      puerta: true,
      role: true,
    },
    orderBy: [{ portal: 'asc' }, { piso: 'asc' }, { puerta: 'asc' }, { id: 'asc' }],
  })

  res.json({
    neighbors: rows.map((r) => {
      const portal = r.portal?.trim() || ''
      const piso = r.piso?.trim() || ''
      const puerta = r.puerta?.trim() || ''
      const unitCore = portal && piso ? `Portal ${portal} · Piso ${piso}` : portal || piso || ''
      const unit = puerta ? `${unitCore} · Puerta ${puerta}` : unitCore || '—'
      const mail = r.email?.trim() || ''
      return {
        id: r.id,
        email: mail || null,
        name: r.name?.trim() || null,
        piso: piso || null,
        portal: portal || null,
        puerta: puerta || null,
        role: r.role,
        label: mail ? `${unit} · ${mail}` : `${unit}${r.name ? ` · ${r.name}` : ''}`,
      }
    }),
  })
})

communityBookingsRouter.get('/', requireAuth, async (req, res) => {
  const communityId = Number(req.query.communityId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido' })
    return
  }

  const user = await prisma.vecindarioUser.findUnique({ where: { id: req.userId! } })
  const comm = await prisma.community.findUnique({ where: { id: communityId } })
  /** Misma regla que /activity: vecinos vinculados necesitan la lista completa para cupos y «mis reservas». */
  if (!user || !comm || !(await userMayUseCommunityMemberBookingsFeatures(user, comm))) {
    res.status(403).json({ error: 'No autorizado para ver reservas de esta comunidad' })
    return
  }

  const rows = await prisma.communityBooking.findMany({
    where: { communityId, status: 'confirmed' },
    orderBy: [{ bookingDate: 'desc' }, { startMinute: 'desc' }, { id: 'desc' }],
    take: 200,
    include: { user: { select: { name: true, email: true } } },
  })

  res.json(rows.map(mapBookingRowJson))
})

communityBookingsRouter.post('/', requireAuth, async (req, res) => {
  const communityId = Number(req.body?.communityId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido' })
    return
  }

  const user = await prisma.vecindarioUser.findUnique({ where: { id: req.userId! } })
  const comm = await prisma.community.findUnique({ where: { id: communityId } })
  if (!user || !comm || !(await userMayUseCommunityMemberBookingsFeatures(user, comm))) {
    res.status(403).json({ error: 'No autorizado para crear reservas en esta comunidad' })
    return
  }

  const facilityId =
    typeof req.body?.facilityId === 'string' && req.body.facilityId.trim()
      ? req.body.facilityId.trim().slice(0, 120)
      : ''
  if (!facilityId) {
    res.status(400).json({ error: 'facilityId obligatorio' })
    return
  }

  const facilityName =
    typeof req.body?.facilityName === 'string' && req.body.facilityName.trim()
      ? req.body.facilityName.trim().slice(0, 255)
      : null

  const bookingDate = parseBookingDate(req.body?.bookingDate)
  if (!bookingDate) {
    res.status(400).json({ error: 'bookingDate debe ser YYYY-MM-DD' })
    return
  }

  const startMinute = parseMinute(req.body?.startMinute)
  const endMinute = parseMinute(req.body?.endMinute)
  if (startMinute == null || endMinute == null || endMinute <= startMinute) {
    res.status(400).json({ error: 'startMinute y endMinute enteros 0–1440; end > start' })
    return
  }

  const slotKey =
    typeof req.body?.slotKey === 'string' && req.body.slotKey.trim()
      ? req.body.slotKey.trim().slice(0, 128)
      : null
  const slotLabel =
    typeof req.body?.slotLabel === 'string' && req.body.slotLabel.trim()
      ? req.body.slotLabel.trim().slice(0, 255)
      : null
  const rawBehalf = req.body?.onBehalfOfUserId
  const behalfId =
    typeof rawBehalf === 'number'
      ? rawBehalf
      : typeof rawBehalf === 'string'
        ? Number.parseInt(rawBehalf, 10)
        : NaN

  let vecindarioUserId = user.id
  let actorEmail: string | null = user.email
  let actorPiso =
    typeof req.body?.actorPiso === 'string' && req.body.actorPiso.trim()
      ? req.body.actorPiso.trim().slice(0, 64)
      : null
  let actorPortal =
    typeof req.body?.actorPortal === 'string' && req.body.actorPortal.trim()
      ? req.body.actorPortal.trim().slice(0, 64)
      : null
  let bookedByUserId: number | null = null
  let bookedByName: string | null = null

  if (Number.isInteger(behalfId) && behalfId >= 1 && behalfId !== user.id) {
    if (user.role !== 'concierge') {
      res.status(403).json({ error: 'Solo el conserje puede reservar en nombre de un vecino.' })
      return
    }
    const target = await prisma.vecindarioUser.findUnique({ where: { id: behalfId } })
    if (!target || target.communityId !== comm.id) {
      res.status(400).json({ error: 'Vecino no válido para esta comunidad.' })
      return
    }
    if (target.role !== 'resident' && target.role !== 'president') {
      res.status(400).json({ error: 'Solo se puede reservar para cuentas de vecino o presidente.' })
      return
    }
    vecindarioUserId = target.id
    actorEmail = target.email
    actorPiso = target.piso?.trim() ? target.piso.trim().slice(0, 64) : null
    actorPortal = target.portal?.trim() ? target.portal.trim().slice(0, 64) : null
    bookedByUserId = user.id
    bookedByName = bookedByDisplayName(user)
  }

  const slotTaken = await prisma.communityBooking.findFirst({
    where: {
      communityId,
      facilityId,
      bookingDate,
      startMinute,
      status: 'confirmed',
    },
    select: { id: true },
  })
  if (slotTaken) {
    res.status(409).json({ error: 'Ese tramo ya está reservado para esa fecha y espacio.' })
    return
  }

  try {
    const row = await prisma.communityBooking.create({
      data: {
        communityId,
        facilityId,
        facilityName,
        bookingDate,
        startMinute,
        endMinute,
        slotKey,
        slotLabel,
        vecindarioUserId,
        bookedByUserId,
        bookedByName,
        actorEmail,
        actorPiso,
        actorPortal,
        status: 'confirmed',
      },
      include: { user: { select: { name: true, email: true } } },
    })

    sendBookingCreatedNotifications({ row, community: comm }).catch((err) => {
      console.error('[booking-notification-email]', err)
    })

    res.status(201).json(mapBookingRowJson(row))
  } catch (e: unknown) {
    const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: string }).code) : ''
    if (code === 'P2002') {
      res.status(409).json({ error: 'Ese tramo ya está reservado para esa fecha y espacio.' })
      return
    }
    throw e
  }
})

/** Anular reserva: el vecino la suya; el conserje cualquiera de su comunidad. Libera el tramo al eliminar la fila. */
communityBookingsRouter.delete('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'id inválido' })
    return
  }

  const user = await prisma.vecindarioUser.findUnique({ where: { id: req.userId! } })
  if (!user) {
    res.status(401).json({ error: 'No autorizado' })
    return
  }

  const row = await prisma.communityBooking.findUnique({ where: { id } })
  if (!row || row.status !== 'confirmed') {
    res.status(404).json({ error: 'Reserva no encontrada' })
    return
  }

  const comm = await prisma.community.findUnique({ where: { id: row.communityId } })
  if (!comm || !(await userMayUseCommunityMemberBookingsFeatures(user, comm))) {
    res.status(403).json({ error: 'No autorizado' })
    return
  }

  if (!userMayCancelBooking(user, comm, row)) {
    res.status(403).json({
      error:
        user.role === 'concierge'
          ? 'No puedes cancelar esta reserva.'
          : 'Solo puedes cancelar tus propias reservas. El conserje puede cancelar cualquier reserva de la comunidad.',
    })
    return
  }

  sendBookingCancelledNotifications({ row, community: comm, cancelledBy: user }).catch((err) => {
    console.error('[booking-cancel-email]', err)
  })

  await prisma.communityBooking.delete({ where: { id } })
  res.json({ ok: true, id })
})

/** Entrada / salida gimnasio persistida en BD (control de acceso). */
communityBookingsRouter.post('/gym-access', requireAuth, async (req, res) => {
  const communityId = Number(req.body?.communityId)
  const tipoRaw = typeof req.body?.tipo === 'string' ? req.body.tipo.trim().toLowerCase() : ''
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido' })
    return
  }
  if (tipoRaw !== 'entrada' && tipoRaw !== 'salida') {
    res.status(400).json({ error: 'tipo debe ser entrada o salida' })
    return
  }

  const user = await prisma.vecindarioUser.findUnique({ where: { id: req.userId! } })
  const comm = await prisma.community.findUnique({ where: { id: communityId } })
  if (!user || !comm || !(await userMayUseCommunityMemberBookingsFeatures(user, comm))) {
    res.status(403).json({ error: 'No autorizado para registrar acceso en esta comunidad' })
    return
  }

  const row = await prisma.communityGymAccessLog.create({
    data: {
      communityId,
      vecindarioUserId: user.id,
      tipo: tipoRaw,
      actorEmail: user.email,
      actorPiso: user.piso?.trim() ? user.piso.trim().slice(0, 64) : null,
      actorPortal: user.portal?.trim() ? user.portal.trim().slice(0, 64) : null,
    },
  })

  res.status(201).json({
    id: row.id,
    tipo: row.tipo,
    createdAt: row.createdAt.toISOString(),
    actorEmail: row.actorEmail,
    actorPiso: row.actorPiso,
    actorPortal: row.actorPortal,
  })
})
