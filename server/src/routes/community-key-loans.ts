import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/require-auth.js'
import { assertStaffOwnsCommunity } from '../lib/community-staff-gate.js'
import { communityOperationalWhere } from '../lib/community-status.js'
import { staffDisplayName } from '../lib/staff-display-name.js'

export const communityKeyLoansRouter = Router()

const MAX_KEY_REF = 120
const MAX_BORROWER = 255
const MAX_NOTES = 512
const MAX_DW = 64

function trimField(s: unknown, max: number): string {
  const t = typeof s === 'string' ? s.trim() : String(s ?? '').trim()
  return t.slice(0, max)
}

function parseOptionalDw(s: unknown): string | null {
  const t = trimField(s, MAX_DW)
  return t || null
}

function parseDateTimeInput(dateRaw: unknown, timeRaw: unknown, isoRaw: unknown): Date | null {
  if (typeof isoRaw === 'string' && isoRaw.trim()) {
    const d = new Date(isoRaw.trim())
    if (!Number.isNaN(d.getTime())) return d
  }
  const dateStr = typeof dateRaw === 'string' ? dateRaw.trim() : ''
  const timeStr = typeof timeRaw === 'string' ? timeRaw.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null
  const tm = /^(\d{1,2}):(\d{2})$/.exec(timeStr || '00:00')
  if (!tm) return null
  const h = Number(tm[1])
  const mi = Number(tm[2])
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h > 23 || mi > 59) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d, h, mi, 0, 0)
}

async function fetchCommunity(communityId: number, accessCode: string | undefined) {
  const code = accessCode?.trim().toUpperCase() ?? ''
  return prisma.community.findFirst({
    where: code
      ? { id: communityId, accessCode: code, ...communityOperationalWhere() }
      : { id: communityId, ...communityOperationalWhere() },
    select: {
      id: true,
      appNavPaqueteriaEnabled: true,
      paqueteriaKeyLoansEnabled: true,
    },
  })
}

async function loadCommunityForKeyLoans(
  communityId: number,
  accessCode: string | undefined,
): Promise<
  | { ok: true; row: NonNullable<Awaited<ReturnType<typeof fetchCommunity>>> }
  | { ok: false; status: number; message: string }
> {
  const row = await fetchCommunity(communityId, accessCode)
  if (!row) {
    return { ok: false, status: 404, message: 'Comunidad no encontrada o inactiva.' }
  }
  if (row.appNavPaqueteriaEnabled !== true) {
    return {
      ok: false,
      status: 403,
      message: 'La paquetería de conserjería no está activada para esta comunidad.',
    }
  }
  if (row.paqueteriaKeyLoansEnabled !== true) {
    return {
      ok: false,
      status: 403,
      message: 'El registro de préstamo de llaves no está activado para esta comunidad.',
    }
  }
  return { ok: true, row }
}

function serializeKeyLoan(row: {
  id: number
  communityId: number
  keyReference: string
  borrowerName: string
  handedOutAt: Date
  returnedAt: Date | null
  notes: string | null
  portal: string | null
  piso: string | null
  puerta: string | null
  createdByUserId: number
  createdByName: string | null
  returnedByUserId: number | null
  returnedByName: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: row.id,
    communityId: row.communityId,
    keyReference: row.keyReference,
    borrowerName: row.borrowerName,
    handedOutAt: row.handedOutAt.toISOString(),
    returnedAt: row.returnedAt?.toISOString() ?? null,
    notes: row.notes?.trim() || null,
    portal: row.portal?.trim() || null,
    piso: row.piso?.trim() || null,
    puerta: row.puerta?.trim() || null,
    createdByUserId: row.createdByUserId,
    createdByName: row.createdByName?.trim() || null,
    returnedByUserId: row.returnedByUserId,
    returnedByName: row.returnedByName?.trim() || null,
    status: row.returnedAt ? 'returned' : 'out',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

communityKeyLoansRouter.get('/key-loans', requireAuth, async (req, res) => {
  const communityId = Number(req.query.communityId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido' })
    return
  }
  const accessCode = typeof req.query.accessCode === 'string' ? req.query.accessCode : undefined
  const gate = await loadCommunityForKeyLoans(communityId, accessCode)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message })
    return
  }

  const role = req.userRole!
  const uid = req.userId!
  if (role !== 'concierge' && role !== 'community_admin' && role !== 'super_admin') {
    res.status(403).json({ error: 'No autorizado' })
    return
  }
  if (role !== 'super_admin') {
    const staff = await assertStaffOwnsCommunity(uid, communityId, accessCode)
    if (!staff.ok) {
      res.status(staff.status).json({ error: staff.message })
      return
    }
  }

  const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : ''
  const where: { communityId: number; returnedAt?: null | { not: null } } = { communityId }
  if (statusFilter === 'out') where.returnedAt = null
  if (statusFilter === 'returned') where.returnedAt = { not: null }

  const rows = await prisma.communityKeyLoan.findMany({
    where,
    orderBy: [{ handedOutAt: 'desc' }, { id: 'desc' }],
    take: 300,
  })

  res.json({ keyLoans: rows.map(serializeKeyLoan) })
})

communityKeyLoansRouter.post('/key-loans', requireAuth, async (req, res) => {
  const communityId = Number(req.body?.communityId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido' })
    return
  }
  const accessCode = typeof req.body?.accessCode === 'string' ? req.body.accessCode : undefined
  const gate = await loadCommunityForKeyLoans(communityId, accessCode)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message })
    return
  }

  const role = req.userRole!
  const uid = req.userId!
  if (role !== 'concierge' && role !== 'super_admin') {
    res.status(403).json({ error: 'Solo el conserje puede registrar préstamos de llaves.' })
    return
  }
  if (role !== 'super_admin') {
    const staff = await assertStaffOwnsCommunity(uid, communityId, accessCode)
    if (!staff.ok) {
      res.status(staff.status).json({ error: staff.message })
      return
    }
  }

  const keyReference = trimField(req.body?.keyReference, MAX_KEY_REF)
  const borrowerName = trimField(req.body?.borrowerName, MAX_BORROWER).replace(/\s+/g, ' ')
  if (keyReference.length < 1) {
    res.status(400).json({ error: 'Indica la referencia de llaves (nº / ref.).' })
    return
  }
  if (borrowerName.length < 2) {
    res.status(400).json({ error: 'Indica el nombre de la persona que recibe las llaves.' })
    return
  }

  const handedOutAt =
    parseDateTimeInput(req.body?.handedOutDate, req.body?.handedOutTime, req.body?.handedOutAt) ??
    new Date()
  if (Number.isNaN(handedOutAt.getTime())) {
    res.status(400).json({ error: 'Fecha u hora de entrega no válida.' })
    return
  }

  const notesRaw = trimField(req.body?.notes, MAX_NOTES)
  const notes = notesRaw || null
  const portal = parseOptionalDw(req.body?.portal)
  const piso = parseOptionalDw(req.body?.piso)
  const puerta = parseOptionalDw(req.body?.puerta)

  const actor = await prisma.vecindarioUser.findUnique({
    where: { id: uid },
    select: { name: true, email: true },
  })
  const createdByName = actor ? staffDisplayName(actor) : null

  const created = await prisma.communityKeyLoan.create({
    data: {
      communityId,
      keyReference,
      borrowerName,
      handedOutAt,
      notes,
      portal,
      piso,
      puerta,
      createdByUserId: uid,
      createdByName,
    },
  })

  res.status(201).json({ keyLoan: serializeKeyLoan(created) })
})

communityKeyLoansRouter.patch('/key-loans/:id/return', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'id inválido' })
    return
  }
  const communityId = Number(req.body?.communityId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido' })
    return
  }
  const accessCode = typeof req.body?.accessCode === 'string' ? req.body.accessCode : undefined
  const gate = await loadCommunityForKeyLoans(communityId, accessCode)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message })
    return
  }

  const role = req.userRole!
  const uid = req.userId!
  if (role !== 'concierge' && role !== 'super_admin') {
    res.status(403).json({ error: 'Solo el conserje puede registrar la devolución de llaves.' })
    return
  }
  if (role !== 'super_admin') {
    const staff = await assertStaffOwnsCommunity(uid, communityId, accessCode)
    if (!staff.ok) {
      res.status(staff.status).json({ error: staff.message })
      return
    }
  }

  const existing = await prisma.communityKeyLoan.findFirst({
    where: { id, communityId },
  })
  if (!existing) {
    res.status(404).json({ error: 'Registro no encontrado.' })
    return
  }
  if (existing.returnedAt) {
    res.status(400).json({ error: 'Estas llaves ya constan como devueltas.' })
    return
  }

  const returnedAt =
    parseDateTimeInput(req.body?.returnedDate, req.body?.returnedTime, req.body?.returnedAt) ??
    new Date()
  if (Number.isNaN(returnedAt.getTime())) {
    res.status(400).json({ error: 'Fecha u hora de devolución no válida.' })
    return
  }
  if (returnedAt.getTime() < existing.handedOutAt.getTime()) {
    res.status(400).json({ error: 'La devolución no puede ser anterior a la entrega.' })
    return
  }

  const actor = await prisma.vecindarioUser.findUnique({
    where: { id: uid },
    select: { name: true, email: true },
  })
  const returnedByName = actor ? staffDisplayName(actor) : null

  const updated = await prisma.communityKeyLoan.update({
    where: { id },
    data: {
      returnedAt,
      returnedByUserId: uid,
      returnedByName,
    },
  })

  res.json({ keyLoan: serializeKeyLoan(updated) })
})
