import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/require-auth.js'
import { assertStaffOwnsCommunity } from '../lib/community-staff-gate.js'
import { normEmail } from '../lib/community-user-access.js'
import { communityOperationalWhere } from '../lib/community-status.js'
import { parseBool } from '../lib/community-create-parsers.js'
import {
  POOL_ACCESS_QUOTAS_INCOMPLETE_HINT_ES,
  buildPoolQrPayload,
  isCommunityPoolOpen,
  maxAdmitForHousehold,
  parseAccessCountLabel,
  poolAccessQuotasComplete,
} from '../lib/pool-access-logic.js'

export const poolAccessRouter = Router()

/** Lectura de ajustes de piscina (super admin o staff de comunidad) */
poolAccessRouter.get('/community/:communityId/settings', requireAuth, async (req, res) => {
  const communityId = Number(req.params.communityId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido.' })
    return
  }

  const accessCodeQ =
    typeof req.query.accessCode === 'string' ? req.query.accessCode.trim() : undefined
  const accessCodeForGate = accessCodeQ || undefined

  const me = await prisma.vecindarioUser.findUnique({
    where: { id: req.userId! },
    select: { role: true },
  })
  if (!me) {
    res.status(401).json({ error: 'Sesión no válida.' })
    return
  }

  if (me.role !== 'super_admin') {
    const gate = await assertStaffOwnsCommunity(req.userId!, communityId, accessCodeForGate)
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.message })
      return
    }
  }

  const row = await prisma.community.findFirst({
    where: { id: communityId },
    select: {
      id: true,
      name: true,
      poolAccessSystemEnabled: true,
      poolSeasonActive: true,
      poolSeasonStart: true,
      poolSeasonEnd: true,
      poolHoursNote: true,
      poolMaxOccupancy: true,
    },
  })
  if (!row) {
    res.status(404).json({ error: 'Comunidad no encontrada.' })
    return
  }

  res.json({
    ...row,
    poolSeasonStart: row.poolSeasonStart?.toISOString().slice(0, 10) ?? null,
    poolSeasonEnd: row.poolSeasonEnd?.toISOString().slice(0, 10) ?? null,
  })
})

const PASS_TTL_MS = 24 * 60 * 60 * 1000
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomPoolCode(): string {
  const buf = randomBytes(10)
  let s = ''
  for (let i = 0; i < 8; i += 1) {
    s += CODE_CHARS[buf[i]! % CODE_CHARS.length]
  }
  return s
}

function isResidentPoolRole(role: string): boolean {
  return role === 'resident' || role === 'president'
}

async function issueUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomPoolCode()
    const clash = await prisma.poolAccessPass.findUnique({ where: { code }, select: { id: true } })
    if (!clash) return code
  }
  throw new Error('No se pudo generar un código único')
}

function normalizePoolCodeInput(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  let code = t.toUpperCase()
  const lower = t.toLowerCase()
  if (lower.startsWith('vecindario:pool:v1:')) {
    const parts = t.split(':')
    code = (parts[parts.length - 1] || '').trim().toUpperCase()
  }
  if (!/^[A-Z0-9]{6,24}$/.test(code)) return null
  return code
}

async function sumOpenPoolOccupancy(communityId: number): Promise<number> {
  const r = await prisma.poolPresenceSession.aggregate({
    where: { communityId, releasedAt: null },
    _sum: { peopleCount: true },
  })
  return r._sum.peopleCount ?? 0
}

/** Vecino / presidente: resumen + pase vigente si existe */
poolAccessRouter.get('/me', requireAuth, async (req, res) => {
  const role = req.userRole!
  if (!isResidentPoolRole(role)) {
    res.status(403).json({ error: 'Solo vecinos pueden consultar su acceso a piscina.' })
    return
  }

  const user = await prisma.vecindarioUser.findUnique({
    where: { id: req.userId! },
    select: {
      id: true,
      name: true,
      email: true,
      portal: true,
      piso: true,
      puerta: true,
      habitaciones: true,
      plazaGaraje: true,
      poolAccessOwner: true,
      poolAccessGuest: true,
      communityId: true,
    },
  })
  if (!user?.communityId) {
    res.status(400).json({ error: 'Tu cuenta no está vinculada a una comunidad.' })
    return
  }

  const comm = await prisma.community.findFirst({
    where: { id: user.communityId },
    select: {
      id: true,
      name: true,
      poolAccessSystemEnabled: true,
      poolSeasonActive: true,
      poolSeasonStart: true,
      poolSeasonEnd: true,
      poolHoursNote: true,
    },
  })
  if (!comm) {
    res.status(404).json({ error: 'Comunidad no encontrada.' })
    return
  }

  const poolOpen = isCommunityPoolOpen(comm)
  const pass = await prisma.poolAccessPass.findFirst({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: 'desc' },
  })

  const ownerL = parseAccessCountLabel(user.poolAccessOwner)
  const guestL = parseAccessCountLabel(user.poolAccessGuest)
  const poolQuotasComplete = poolAccessQuotasComplete(user.poolAccessOwner, user.poolAccessGuest)

  res.json({
    community: { id: comm.id, name: comm.name },
    poolQuotasComplete,
    poolQuotasHint: poolQuotasComplete ? null : POOL_ACCESS_QUOTAS_INCOMPLETE_HINT_ES,
    settings: {
      poolAccessSystemEnabled: comm.poolAccessSystemEnabled,
      poolSeasonActive: comm.poolSeasonActive,
      poolSeasonStart: comm.poolSeasonStart?.toISOString().slice(0, 10) ?? null,
      poolSeasonEnd: comm.poolSeasonEnd?.toISOString().slice(0, 10) ?? null,
      poolHoursNote: comm.poolHoursNote?.trim() || null,
      poolOpen,
    },
    user: {
      id: user.id,
      name: user.name?.trim() || user.email?.split('@')[0] || 'Vecino',
      portal: user.portal?.trim() || null,
      piso: user.piso?.trim() || null,
      puerta: user.puerta?.trim() || null,
      habitaciones: user.habitaciones?.trim() || null,
      plazaGaraje: user.plazaGaraje?.trim() || null,
      poolAccessOwner: ownerL.display,
      poolAccessGuest: guestL.display,
      poolAccessOwnerNumeric: ownerL.numeric,
      poolAccessGuestNumeric: guestL.numeric,
    },
    pass: pass
      ? {
          code: pass.code,
          expiresAt: pass.expiresAt.toISOString(),
          qrPayload: buildPoolQrPayload(comm.id, pass.code),
        }
      : null,
  })
})

/** Conserje / admin comunidad: estado piscina + aforo (sin código personal). */
poolAccessRouter.get('/staff-pool-summary', requireAuth, async (req, res) => {
  const role = req.userRole!
  if (role !== 'concierge' && role !== 'community_admin') {
    res.status(403).json({ error: 'No disponible.' })
    return
  }
  const staff = await prisma.vecindarioUser.findUnique({
    where: { id: req.userId! },
    select: { email: true, communityId: true },
  })
  const e = normEmail(staff?.email)
  if (!e) {
    res.status(403).json({ error: 'Cuenta sin correo válido.' })
    return
  }

  const commSelect = {
    id: true,
    name: true,
    poolAccessSystemEnabled: true,
    poolSeasonActive: true,
    poolSeasonStart: true,
    poolSeasonEnd: true,
    poolHoursNote: true,
    poolMaxOccupancy: true,
    communityAdminEmail: true,
    conciergeEmail: true,
  } as const

  type StaffPoolCommRow = {
    id: number
    name: string
    poolAccessSystemEnabled: boolean
    poolSeasonActive: boolean
    poolSeasonStart: Date | null
    poolSeasonEnd: Date | null
    poolHoursNote: string | null
    poolMaxOccupancy: number | null
    communityAdminEmail: string | null
    conciergeEmail: string | null
  }
  let comm: StaffPoolCommRow | null = null

  if (staff?.communityId != null) {
    const byId = await prisma.community.findFirst({
      where: { id: staff.communityId, ...communityOperationalWhere() },
      select: commSelect,
    })
    if (byId) {
      const okConcierge = role === 'concierge' && normEmail(byId.conciergeEmail) === e
      const okAdmin = role === 'community_admin' && normEmail(byId.communityAdminEmail) === e
      if (okConcierge || okAdmin) comm = byId
    }
  }

  if (!comm) {
    const emailField = role === 'concierge' ? 'conciergeEmail' : 'communityAdminEmail'
    const candidates = await prisma.community.findMany({
      where: {
        ...communityOperationalWhere(),
        [emailField]: { not: null },
      },
      select: commSelect,
    })
    comm =
      role === 'concierge'
        ? candidates.find((c) => normEmail(c.conciergeEmail) === e) ?? null
        : candidates.find((c) => normEmail(c.communityAdminEmail) === e) ?? null
  }

  if (!comm) {
    res.status(404).json({
      error:
        role === 'concierge'
          ? 'No figuras como conserje en ninguna comunidad activa (revisa el correo en la ficha de la comunidad).'
          : 'No figuras como administrador en ninguna comunidad activa (revisa el correo en la ficha).',
    })
    return
  }

  const poolOpen = isCommunityPoolOpen(comm)
  const currentOccupancy = await sumOpenPoolOccupancy(comm.id)
  res.json({
    community: { id: comm.id, name: comm.name },
    settings: {
      poolAccessSystemEnabled: comm.poolAccessSystemEnabled,
      poolSeasonActive: comm.poolSeasonActive,
      poolSeasonStart: comm.poolSeasonStart?.toISOString().slice(0, 10) ?? null,
      poolSeasonEnd: comm.poolSeasonEnd?.toISOString().slice(0, 10) ?? null,
      poolHoursNote: comm.poolHoursNote?.trim() || null,
      poolOpen,
      poolMaxOccupancy: comm.poolMaxOccupancy ?? null,
    },
    currentOccupancy,
  })
})

/** Genera nuevo código (invalida anteriores del mismo usuario) */
poolAccessRouter.post('/issue-code', requireAuth, async (req, res) => {
  const role = req.userRole!
  if (!isResidentPoolRole(role)) {
    res.status(403).json({ error: 'Solo vecinos pueden obtener código de piscina.' })
    return
  }

  const user = await prisma.vecindarioUser.findUnique({
    where: { id: req.userId! },
    select: {
      id: true,
      communityId: true,
      poolAccessOwner: true,
      poolAccessGuest: true,
    },
  })
  if (!user?.communityId) {
    res.status(400).json({ error: 'Sin comunidad asignada.' })
    return
  }

  if (!poolAccessQuotasComplete(user.poolAccessOwner, user.poolAccessGuest)) {
    res.status(403).json({
      error: 'Cuotas de piscina incompletas',
      message: POOL_ACCESS_QUOTAS_INCOMPLETE_HINT_ES,
      code: 'POOL_QUOTAS_INCOMPLETE',
    })
    return
  }

  const comm = await prisma.community.findFirst({
    where: { id: user.communityId },
    select: {
      id: true,
      poolAccessSystemEnabled: true,
      poolSeasonActive: true,
      poolSeasonStart: true,
      poolSeasonEnd: true,
      poolHoursNote: true,
    },
  })
  if (!comm) {
    res.status(404).json({ error: 'Comunidad no encontrada.' })
    return
  }
  if (!isCommunityPoolOpen(comm)) {
    res.status(403).json({
      error: 'Piscina no disponible',
      message: 'El sistema de acceso está desactivado o la temporada no está abierta.',
    })
    return
  }

  const expiresAt = new Date(Date.now() + PASS_TTL_MS)
  const code = await issueUniqueCode()

  await prisma.$transaction([
    prisma.poolAccessPass.deleteMany({ where: { userId: user.id } }),
    prisma.poolAccessPass.create({
      data: {
        userId: user.id,
        communityId: user.communityId,
        code,
        expiresAt,
      },
    }),
  ])

  res.status(201).json({
    code,
    expiresAt: expiresAt.toISOString(),
    qrPayload: buildPoolQrPayload(comm.id, code),
  })
})

/** Ocupación actual en la instalación (solo socorrista de la comunidad). */
poolAccessRouter.get('/occupancy', requireAuth, async (req, res) => {
  if (req.userRole !== 'pool_staff') {
    res.status(403).json({ error: 'Solo personal de piscina.' })
    return
  }
  const staff = await prisma.vecindarioUser.findUnique({
    where: { id: req.userId! },
    select: { communityId: true },
  })
  if (!staff?.communityId) {
    res.status(403).json({ error: 'Sin comunidad asignada.' })
    return
  }
  const cid = staff.communityId
  const comm = await prisma.community.findFirst({
    where: { id: cid },
    select: { poolMaxOccupancy: true },
  })
  const current = await sumOpenPoolOccupancy(cid)
  const sessions = await prisma.poolPresenceSession.findMany({
    where: { communityId: cid, releasedAt: null },
    orderBy: { admittedAt: 'asc' },
    include: {
      resident: {
        select: { name: true, email: true, portal: true, piso: true, puerta: true },
      },
    },
  })
  res.json({
    currentOccupancy: current,
    poolMaxOccupancy: comm?.poolMaxOccupancy ?? null,
    sessions: sessions.map((s) => ({
      id: s.id,
      peopleCount: s.peopleCount,
      admittedAt: s.admittedAt.toISOString(),
      passCode: s.passCode,
      resident: {
        name: s.resident.name?.trim() || s.resident.email?.split('@')[0] || 'Vecino',
        portal: s.resident.portal?.trim() || null,
        piso: s.resident.piso?.trim() || null,
        puerta: s.resident.puerta?.trim() || null,
      },
    })),
  })
})

/** Historial de entradas/salidas (sesiones; releasedAt = salida). Solo socorrista de la comunidad. */
poolAccessRouter.get('/history', requireAuth, async (req, res) => {
  if (req.userRole !== 'pool_staff') {
    res.status(403).json({ error: 'Solo personal de piscina.' })
    return
  }
  const staff = await prisma.vecindarioUser.findUnique({
    where: { id: req.userId! },
    select: { communityId: true },
  })
  if (!staff?.communityId) {
    res.status(403).json({ error: 'Sin comunidad asignada.' })
    return
  }
  const limRaw = req.query.limit
  let limit = 40
  if (limRaw != null && limRaw !== '') {
    const n = Number.parseInt(String(limRaw), 10)
    if (Number.isInteger(n) && n >= 1 && n <= 100) limit = n
  }
  const rows = await prisma.poolPresenceSession.findMany({
    where: { communityId: staff.communityId },
    orderBy: { admittedAt: 'desc' },
    take: limit,
    include: {
      resident: {
        select: { name: true, email: true, portal: true, piso: true, puerta: true },
      },
      validator: { select: { name: true, email: true } },
    },
  })
  res.json({
    items: rows.map((s) => {
      const src = s.admissionSource ?? 'staff'
      const selfReg = src === 'self'
      return {
        id: s.id,
        peopleCount: s.peopleCount,
        passCode: s.passCode,
        admittedAt: s.admittedAt.toISOString(),
        releasedAt: s.releasedAt?.toISOString() ?? null,
        inside: s.releasedAt == null,
        admissionSource: selfReg ? 'self' : 'staff',
        resident: {
          name: s.resident.name?.trim() || s.resident.email?.split('@')[0] || 'Vecino',
          portal: s.resident.portal?.trim() || null,
          piso: s.resident.piso?.trim() || null,
          puerta: s.resident.puerta?.trim() || null,
        },
        validatorLabel: selfReg
          ? 'Autoregistro (QR / enlace)'
          : s.validator.name?.trim() || s.validator.email?.trim() || '—',
      }
    }),
  })
})

/** Vista previa autoregistro en puerta (vecino logueado + pase vigente). */
poolAccessRouter.get('/self-checkin-preview', requireAuth, async (req, res) => {
  const role = req.userRole!
  if (!isResidentPoolRole(role)) {
    res.status(403).json({ error: 'Solo vecinos o presidentes.' })
    return
  }
  const user = await prisma.vecindarioUser.findUnique({
    where: { id: req.userId! },
    select: {
      id: true,
      communityId: true,
      poolAccessOwner: true,
      poolAccessGuest: true,
    },
  })
  if (!user?.communityId) {
    res.status(400).json({ error: 'Sin comunidad asignada.' })
    return
  }
  const comm = await prisma.community.findFirst({
    where: { id: user.communityId },
    select: {
      poolAccessSystemEnabled: true,
      poolSeasonActive: true,
      poolSeasonStart: true,
      poolSeasonEnd: true,
      poolHoursNote: true,
      poolMaxOccupancy: true,
    },
  })
  const poolOpen = comm ? isCommunityPoolOpen(comm) : false
  const pass = await prisma.poolAccessPass.findFirst({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: 'desc' },
    select: { code: true, expiresAt: true },
  })
  const ownerL = parseAccessCountLabel(user.poolAccessOwner)
  const guestL = parseAccessCountLabel(user.poolAccessGuest)
  const maxAdmit = maxAdmitForHousehold(ownerL.numeric, guestL.numeric)
  const poolQuotasComplete = poolAccessQuotasComplete(user.poolAccessOwner, user.poolAccessGuest)
  const openSession = await prisma.poolPresenceSession.findFirst({
    where: {
      communityId: user.communityId,
      residentUserId: user.id,
      releasedAt: null,
    },
    select: { id: true, peopleCount: true, admittedAt: true, admissionSource: true },
  })
  const currentOcc = await sumOpenPoolOccupancy(user.communityId)
  res.json({
    poolOpen,
    hasValidPass: !!pass,
    passExpiresAt: pass?.expiresAt.toISOString() ?? null,
    passCode: pass?.code ?? null,
    maxAdmit,
    poolQuotasComplete,
    hasOpenSession: !!openSession,
    openSession: openSession
      ? {
          id: openSession.id,
          peopleCount: openSession.peopleCount,
          admittedAt: openSession.admittedAt.toISOString(),
          admissionSource: openSession.admissionSource,
        }
      : null,
    currentOccupancy: currentOcc,
    poolMaxOccupancy: comm?.poolMaxOccupancy ?? null,
  })
})

/** Autoregistro entrada: mismo cupo que admit socorrista; requiere pase vigente generado en app. */
poolAccessRouter.post('/self-admit', requireAuth, async (req, res) => {
  const role = req.userRole!
  if (!isResidentPoolRole(role)) {
    res.status(403).json({ error: 'Solo vecinos o presidentes.' })
    return
  }
  const peopleRaw = req.body?.peopleCount
  const peopleCount =
    typeof peopleRaw === 'number' && Number.isInteger(peopleRaw)
      ? peopleRaw
      : typeof peopleRaw === 'string'
        ? Number.parseInt(peopleRaw.trim(), 10)
        : NaN
  if (!Number.isInteger(peopleCount) || peopleCount < 1) {
    res.status(400).json({ error: 'Indica cuántas personas entran (número entero ≥ 1).' })
    return
  }

  const me = await prisma.vecindarioUser.findUnique({
    where: { id: req.userId! },
    select: {
      id: true,
      communityId: true,
      role: true,
      poolAccessOwner: true,
      poolAccessGuest: true,
    },
  })
  if (!me?.communityId || !isResidentPoolRole(me.role)) {
    res.status(403).json({ error: 'Cuenta no válida.' })
    return
  }

  const pass = await prisma.poolAccessPass.findFirst({
    where: { userId: me.id, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: 'desc' },
  })
  if (!pass || pass.communityId !== me.communityId) {
    res.status(400).json({
      error: 'No tienes un código de piscina vigente. Genera uno en «Acceso piscina» antes de entrar.',
    })
    return
  }
  const code = pass.code

  const logOutcome = async (outcome: string) => {
    await prisma.poolAccessValidationLog.create({
      data: {
        communityId: me.communityId!,
        residentUserId: me.id,
        validatorUserId: me.id,
        outcome,
      },
    })
  }

  const comm = await prisma.community.findFirst({
    where: { id: me.communityId },
    select: {
      poolAccessSystemEnabled: true,
      poolSeasonActive: true,
      poolSeasonStart: true,
      poolSeasonEnd: true,
      poolHoursNote: true,
      poolMaxOccupancy: true,
    },
  })
  if (!comm || !isCommunityPoolOpen(comm)) {
    await logOutcome('denied_pool_closed_self')
    res.status(403).json({ error: 'Piscina cerrada o temporada inactiva.' })
    return
  }

  const ownerL = parseAccessCountLabel(me.poolAccessOwner)
  const guestL = parseAccessCountLabel(me.poolAccessGuest)
  const maxAdmit = maxAdmitForHousehold(ownerL.numeric, guestL.numeric)
  if (maxAdmit == null) {
    res.status(403).json({
      error: 'Faltan cuotas titular/invitados en ficha; no se puede registrar entrada.',
    })
    return
  }
  if (peopleCount > maxAdmit) {
    res.status(400).json({
      error: `No pueden entrar más de ${maxAdmit} persona(s) según ficha (titular + invitados).`,
    })
    return
  }

  const existingOpen = await prisma.poolPresenceSession.findFirst({
    where: {
      communityId: me.communityId,
      residentUserId: me.id,
      releasedAt: null,
    },
  })
  if (existingOpen) {
    res.status(409).json({
      error:
        'Ya tienes una entrada abierta. Registra la salida antes de una nueva entrada.',
      openSessionId: existingOpen.id,
    })
    return
  }

  const currentOcc = await sumOpenPoolOccupancy(me.communityId)
  const cap = comm.poolMaxOccupancy
  if (cap != null && currentOcc + peopleCount > cap) {
    await logOutcome('denied_full_self')
    res.status(403).json({
      error: `Aforo completo: hay ${currentOcc} persona(s) en piscina; el máximo es ${cap}.`,
      currentOccupancy: currentOcc,
      poolMaxOccupancy: cap,
    })
    return
  }

  const session = await prisma.poolPresenceSession.create({
    data: {
      communityId: me.communityId,
      residentUserId: me.id,
      passCode: code,
      peopleCount,
      validatorUserId: me.id,
      admissionSource: 'self',
    },
  })
  await logOutcome('admitted_self')

  const newOcc = currentOcc + peopleCount
  res.status(201).json({
    ok: true,
    sessionId: session.id,
    peopleAdmitted: peopleCount,
    currentOccupancy: newOcc,
    poolMaxOccupancy: cap,
  })
})

/** Autoregistro salida (cierra la sesión abierta del propio vecino). */
poolAccessRouter.post('/self-release', requireAuth, async (req, res) => {
  const role = req.userRole!
  if (!isResidentPoolRole(role)) {
    res.status(403).json({ error: 'Solo vecinos o presidentes.' })
    return
  }
  const me = await prisma.vecindarioUser.findUnique({
    where: { id: req.userId! },
    select: { id: true, communityId: true },
  })
  if (!me?.communityId) {
    res.status(403).json({ error: 'Sin comunidad asignada.' })
    return
  }
  const row = await prisma.poolPresenceSession.findFirst({
    where: {
      communityId: me.communityId,
      residentUserId: me.id,
      releasedAt: null,
    },
  })
  if (!row) {
    res.status(404).json({ error: 'No tienes una entrada abierta que cerrar.' })
    return
  }
  await prisma.poolPresenceSession.update({
    where: { id: row.id },
    data: { releasedAt: new Date() },
  })
  await prisma.poolAccessValidationLog.create({
    data: {
      communityId: me.communityId,
      residentUserId: me.id,
      validatorUserId: me.id,
      outcome: 'released_self',
    },
  })
  const currentOccupancy = await sumOpenPoolOccupancy(me.communityId)
  res.json({
    ok: true,
    releasedPeople: row.peopleCount,
    currentOccupancy,
  })
})

/** Registrar entrada: código válido + número de personas (no supera ficha ni aforo de instalación). */
poolAccessRouter.post('/admit', requireAuth, async (req, res) => {
  if (req.userRole !== 'pool_staff') {
    res.status(403).json({ error: 'Solo personal de piscina.' })
    return
  }
  const raw =
    typeof req.body?.code === 'string'
      ? req.body.code
      : typeof req.body?.payload === 'string'
        ? req.body.payload
        : ''
  const code = normalizePoolCodeInput(raw)
  if (!code) {
    res.status(400).json({ error: 'Código o payload no válido.' })
    return
  }
  const peopleRaw = req.body?.peopleCount
  const peopleCount =
    typeof peopleRaw === 'number' && Number.isInteger(peopleRaw)
      ? peopleRaw
      : typeof peopleRaw === 'string'
        ? Number.parseInt(peopleRaw.trim(), 10)
        : NaN
  if (!Number.isInteger(peopleCount) || peopleCount < 1) {
    res.status(400).json({ error: 'Indica cuántas personas entran (número entero ≥ 1).' })
    return
  }

  const staff = await prisma.vecindarioUser.findUnique({
    where: { id: req.userId! },
    select: { id: true, communityId: true },
  })
  if (!staff?.communityId) {
    res.status(403).json({ error: 'Sin comunidad asignada.' })
    return
  }

  const pass = await prisma.poolAccessPass.findUnique({
    where: { code },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          portal: true,
          piso: true,
          puerta: true,
          poolAccessOwner: true,
          poolAccessGuest: true,
          communityId: true,
          role: true,
        },
      },
    },
  })

  const logOutcome = async (outcome: string, residentId: number) => {
    await prisma.poolAccessValidationLog.create({
      data: {
        communityId: staff.communityId!,
        residentUserId: residentId,
        validatorUserId: staff.id,
        outcome,
      },
    })
  }

  if (!pass || pass.communityId !== staff.communityId) {
    res.status(400).json({ error: 'Código no válido para esta comunidad.' })
    return
  }
  if (pass.expiresAt <= new Date()) {
    await logOutcome('denied_expired', pass.userId)
    res.status(400).json({ error: 'Código caducado.' })
    return
  }
  const ru = pass.user
  if (ru.communityId !== pass.communityId || !isResidentPoolRole(ru.role)) {
    await logOutcome('denied_user_mismatch', pass.userId)
    res.status(400).json({ error: 'Cuenta de vecino no válida para este pase.' })
    return
  }

  const comm = await prisma.community.findFirst({
    where: { id: pass.communityId },
    select: {
      poolAccessSystemEnabled: true,
      poolSeasonActive: true,
      poolSeasonStart: true,
      poolSeasonEnd: true,
      poolHoursNote: true,
      poolMaxOccupancy: true,
    },
  })
  if (!comm || !isCommunityPoolOpen(comm)) {
    await logOutcome('denied_pool_closed', pass.userId)
    res.status(403).json({ error: 'Piscina cerrada o temporada inactiva.' })
    return
  }

  const ownerL = parseAccessCountLabel(ru.poolAccessOwner)
  const guestL = parseAccessCountLabel(ru.poolAccessGuest)
  const maxAdmit = maxAdmitForHousehold(ownerL.numeric, guestL.numeric)
  if (maxAdmit == null) {
    res.status(403).json({
      error: 'Faltan cuotas titular/invitados en ficha; no se puede registrar entrada.',
    })
    return
  }
  if (peopleCount > maxAdmit) {
    res.status(400).json({
      error: `No pueden entrar más de ${maxAdmit} persona(s) según ficha (titular + invitados).`,
    })
    return
  }

  const existingOpen = await prisma.poolPresenceSession.findFirst({
    where: {
      communityId: staff.communityId,
      residentUserId: pass.userId,
      releasedAt: null,
    },
  })
  if (existingOpen) {
    res.status(409).json({
      error:
        'Esta vivienda ya tiene una entrada abierta. Registra la salida antes de una nueva entrada.',
      openSessionId: existingOpen.id,
    })
    return
  }

  const currentOcc = await sumOpenPoolOccupancy(staff.communityId)
  const cap = comm.poolMaxOccupancy
  if (cap != null && currentOcc + peopleCount > cap) {
    res.status(403).json({
      error: `Aforo completo: hay ${currentOcc} persona(s) en piscina; el máximo es ${cap}.`,
      currentOccupancy: currentOcc,
      poolMaxOccupancy: cap,
    })
    return
  }

  const session = await prisma.poolPresenceSession.create({
    data: {
      communityId: staff.communityId,
      residentUserId: pass.userId,
      passCode: code,
      peopleCount,
      validatorUserId: staff.id,
      admissionSource: 'staff',
    },
  })
  await logOutcome('admitted', pass.userId)

  const newOcc = currentOcc + peopleCount
  res.status(201).json({
    ok: true,
    sessionId: session.id,
    peopleAdmitted: peopleCount,
    currentOccupancy: newOcc,
    poolMaxOccupancy: cap,
  })
})

/** Marcar salida de un grupo registrado antes. */
poolAccessRouter.post('/release', requireAuth, async (req, res) => {
  if (req.userRole !== 'pool_staff') {
    res.status(403).json({ error: 'Solo personal de piscina.' })
    return
  }
  const sessionId = Number(req.body?.sessionId)
  if (!Number.isInteger(sessionId) || sessionId < 1) {
    res.status(400).json({ error: 'sessionId inválido.' })
    return
  }
  const staff = await prisma.vecindarioUser.findUnique({
    where: { id: req.userId! },
    select: { id: true, communityId: true },
  })
  if (!staff?.communityId) {
    res.status(403).json({ error: 'Sin comunidad asignada.' })
    return
  }

  const row = await prisma.poolPresenceSession.findFirst({
    where: { id: sessionId, communityId: staff.communityId, releasedAt: null },
    include: { resident: { select: { id: true } } },
  })
  if (!row) {
    res.status(404).json({ error: 'Sesión no encontrada o ya cerrada.' })
    return
  }

  await prisma.poolPresenceSession.update({
    where: { id: sessionId },
    data: { releasedAt: new Date() },
  })
  await prisma.poolAccessValidationLog.create({
    data: {
      communityId: staff.communityId,
      residentUserId: row.residentUserId,
      validatorUserId: staff.id,
      outcome: 'released',
    },
  })

  const currentOccupancy = await sumOpenPoolOccupancy(staff.communityId)
  res.json({
    ok: true,
    releasedPeople: row.peopleCount,
    currentOccupancy,
  })
})

/** Socorrista: comprobar código (sin registrar entrada). Luego usar POST /admit con personas. */
poolAccessRouter.post('/validate', requireAuth, async (req, res) => {
  if (req.userRole !== 'pool_staff') {
    res.status(403).json({ error: 'Solo personal de piscina (socorrista) puede validar.' })
    return
  }

  const raw =
    typeof req.body?.code === 'string'
      ? req.body.code
      : typeof req.body?.payload === 'string'
        ? req.body.payload
        : ''
  const code = normalizePoolCodeInput(raw)
  if (!code) {
    res.status(400).json({ error: 'Indica el código o el payload escaneado.' })
    return
  }

  const staff = await prisma.vecindarioUser.findUnique({
    where: { id: req.userId! },
    select: { id: true, communityId: true },
  })
  if (!staff?.communityId) {
    res.status(403).json({ error: 'Tu cuenta de socorrista no tiene comunidad asignada.' })
    return
  }

  const pass = await prisma.poolAccessPass.findUnique({
    where: { code },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          portal: true,
          piso: true,
          puerta: true,
          poolAccessOwner: true,
          poolAccessGuest: true,
          communityId: true,
          role: true,
        },
      },
    },
  })

  const logOutcome = async (outcome: string, residentId: number) => {
    await prisma.poolAccessValidationLog.create({
      data: {
        communityId: staff.communityId!,
        residentUserId: residentId,
        validatorUserId: staff.id,
        outcome,
      },
    })
  }

  if (!pass || pass.communityId !== staff.communityId) {
    res.json({
      valid: false,
      reason: 'Código no encontrado o no pertenece a esta comunidad.',
    })
    return
  }

  if (pass.expiresAt <= new Date()) {
    await logOutcome('denied_expired', pass.userId)
    res.json({
      valid: false,
      reason: 'Código caducado.',
      resident: { name: pass.user.name, portal: pass.user.portal, piso: pass.user.piso },
    })
    return
  }

  const ru = pass.user
  if (
    ru.communityId !== pass.communityId ||
    !isResidentPoolRole(ru.role)
  ) {
    await logOutcome('denied_user_mismatch', pass.userId)
    res.json({ valid: false, reason: 'Cuenta de vecino no válida para este pase.' })
    return
  }

  const comm = await prisma.community.findFirst({
    where: { id: pass.communityId },
    select: {
      poolAccessSystemEnabled: true,
      poolSeasonActive: true,
      poolSeasonStart: true,
      poolSeasonEnd: true,
      poolHoursNote: true,
      poolMaxOccupancy: true,
    },
  })
  const poolOpen = comm ? isCommunityPoolOpen(comm) : false
  if (!poolOpen) {
    await logOutcome('denied_pool_closed', pass.userId)
    const ownerL = parseAccessCountLabel(ru.poolAccessOwner)
    const guestL = parseAccessCountLabel(ru.poolAccessGuest)
    res.json({
      valid: false,
      reason: 'Piscina cerrada o temporada inactiva.',
      resident: {
        name: ru.name?.trim() || ru.email?.split('@')[0] || 'Vecino',
        portal: ru.portal?.trim(),
        piso: ru.piso?.trim(),
        puerta: ru.puerta?.trim(),
        poolAccessOwner: ownerL.display,
        poolAccessGuest: guestL.display,
      },
    })
    return
  }

  const ownerL = parseAccessCountLabel(ru.poolAccessOwner)
  const guestL = parseAccessCountLabel(ru.poolAccessGuest)
  const maxAdmit = maxAdmitForHousehold(ownerL.numeric, guestL.numeric)
  if (maxAdmit == null) {
    await logOutcome('denied_quotas_incomplete', pass.userId)
    res.json({
      valid: false,
      reason:
        'Faltan en ficha los accesos titular e invitados (números enteros). No se puede registrar entrada hasta completarlos.',
      resident: {
        name: ru.name?.trim() || ru.email?.split('@')[0] || 'Vecino',
        portal: ru.portal?.trim(),
        piso: ru.piso?.trim(),
        puerta: ru.puerta?.trim(),
        poolAccessOwner: ownerL.display,
        poolAccessGuest: guestL.display,
      },
    })
    return
  }
  const currentOcc = await sumOpenPoolOccupancy(staff.communityId!)
  const openSession = await prisma.poolPresenceSession.findFirst({
    where: {
      communityId: staff.communityId!,
      residentUserId: pass.userId,
      releasedAt: null,
    },
    select: { id: true, peopleCount: true, admittedAt: true, passCode: true },
  })

  res.json({
    valid: true,
    normalizedCode: code,
    maxAdmit,
    occupancy: {
      current: currentOcc,
      max: comm?.poolMaxOccupancy ?? null,
    },
    hasOpenSession: !!openSession,
    openSession: openSession
      ? {
          id: openSession.id,
          peopleCount: openSession.peopleCount,
          admittedAt: openSession.admittedAt.toISOString(),
          passCode: openSession.passCode,
        }
      : null,
    resident: {
      name: ru.name?.trim() || ru.email?.split('@')[0] || 'Vecino',
      portal: ru.portal?.trim(),
      piso: ru.piso?.trim(),
      puerta: ru.puerta?.trim(),
      poolAccessOwner: ownerL.display,
      poolAccessGuest: guestL.display,
      poolAccessOwnerNumeric: ownerL.numeric,
      poolAccessGuestNumeric: guestL.numeric,
    },
  })
})

/**
 * Ajustes de piscina (comunidad): super admin o staff de comunidad (misma regla que alta vecinos).
 */
poolAccessRouter.patch('/community-settings', requireAuth, async (req, res) => {
  const communityId = Number(req.body?.communityId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido.' })
    return
  }

  const accessCodeRaw = typeof req.body?.accessCode === 'string' ? req.body.accessCode.trim() : ''
  const accessCodeForGate = accessCodeRaw || undefined

  const me = await prisma.vecindarioUser.findUnique({
    where: { id: req.userId! },
    select: { role: true },
  })
  if (!me) {
    res.status(401).json({ error: 'Sesión no válida.' })
    return
  }

  if (me.role !== 'super_admin') {
    const gate = await assertStaffOwnsCommunity(req.userId!, communityId, accessCodeForGate)
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.message })
      return
    }
  }

  const data: Record<string, unknown> = {}
  if ('poolAccessSystemEnabled' in req.body) {
    data.poolAccessSystemEnabled = parseBool(req.body.poolAccessSystemEnabled, false)
  }
  if ('poolSeasonActive' in req.body) {
    data.poolSeasonActive = parseBool(req.body.poolSeasonActive, false)
  }
  if ('poolHoursNote' in req.body) {
    const t = typeof req.body.poolHoursNote === 'string' ? req.body.poolHoursNote.trim().slice(0, 255) : ''
    data.poolHoursNote = t || null
  }
  if ('poolMaxOccupancy' in req.body) {
    const raw = (req.body as Record<string, unknown>).poolMaxOccupancy
    if (raw === null || raw === '' || raw === undefined) {
      data.poolMaxOccupancy = null
    } else {
      const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
      if (!Number.isInteger(n) || n < 1 || n > 5000) {
        res.status(400).json({ error: 'poolMaxOccupancy debe ser un entero entre 1 y 5000, o vacío.' })
        return
      }
      data.poolMaxOccupancy = n
    }
  }
  if ('poolSeasonStart' in req.body || 'poolSeasonEnd' in req.body) {
    const parseDate = (raw: unknown): Date | null => {
      if (raw === null || raw === undefined || raw === '') return null
      const s = typeof raw === 'string' ? raw.trim().slice(0, 10) : ''
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
      if (!m) return null
      const y = Number(m[1])
      const mo = Number(m[2])
      const da = Number(m[3])
      const d = new Date(Date.UTC(y, mo - 1, da))
      if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== da) return null
      return d
    }
    if ('poolSeasonStart' in req.body) {
      data.poolSeasonStart = parseDate(req.body.poolSeasonStart)
    }
    if ('poolSeasonEnd' in req.body) {
      data.poolSeasonEnd = parseDate(req.body.poolSeasonEnd)
    }
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'Nada que actualizar.' })
    return
  }

  const row = await prisma.community.update({
    where: { id: communityId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: data as any,
    select: {
      id: true,
      poolAccessSystemEnabled: true,
      poolSeasonActive: true,
      poolSeasonStart: true,
      poolSeasonEnd: true,
      poolHoursNote: true,
      poolMaxOccupancy: true,
    },
  })

  res.json({
    ...row,
    poolSeasonStart: row.poolSeasonStart?.toISOString().slice(0, 10) ?? null,
    poolSeasonEnd: row.poolSeasonEnd?.toISOString().slice(0, 10) ?? null,
  })
})
