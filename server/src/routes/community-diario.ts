import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/require-auth.js'
import { communityOperationalWhere } from '../lib/community-status.js'
import { staffDisplayName } from '../lib/staff-display-name.js'
import {
  cuadernoDiarioAccessForUser,
  type CuadernoDiarioAccess,
} from '../lib/community-diario-access.js'

export const communityDiarioRouter = Router()

const MAX_DESCRIPTION = 4000

function parseYmd(s: unknown): Date | null {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) return null
  const [y, m, d] = s.trim().split('-').map(Number)
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null
  return new Date(Date.UTC(y, m - 1, d))
}

function parseYm(s: unknown): { y: number; m: number } | null {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}$/.test(s.trim())) return null
  const [ys, ms] = s.trim().split('-')
  const y = Number(ys)
  const m = Number(ms)
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return null
  return { y, m }
}

function parseMinute(n: unknown): number | null {
  const v = typeof n === 'number' ? n : typeof n === 'string' ? Number.parseInt(n, 10) : NaN
  if (!Number.isInteger(v) || v < 0 || v > 1439) return null
  return v
}

function formatMinuteRange(min: number): string {
  const h = Math.floor(min / 60)
  const mi = min % 60
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}

/** Fecha local del servidor (alineada con la UI web/móvil). */
function localTodayYmd(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function entryYmd(entryDate: Date): string {
  return entryDate.toISOString().slice(0, 10)
}

/** Solo el autor puede editar/borrar, y solo el día de hoy. */
function mutateEntryDenied(
  userId: number,
  existing: { createdByUserId: number; entryDate: Date },
): string | null {
  if (existing.createdByUserId !== userId) {
    return 'Solo puedes modificar tus propias anotaciones.'
  }
  if (entryYmd(existing.entryDate) !== localTodayYmd()) {
    return 'Solo puedes modificar anotaciones del día de hoy.'
  }
  return null
}

async function loadCommunityForDiario(communityId: number, accessCode: string | undefined) {
  const code = accessCode?.trim().toUpperCase() ?? ''
  return prisma.community.findFirst({
    where: code
      ? { id: communityId, accessCode: code, ...communityOperationalWhere() }
      : { id: communityId, ...communityOperationalWhere() },
    select: {
      id: true,
      name: true,
      status: true,
      appNavCuadernoDiarioEnabled: true,
      presidentPortal: true,
      presidentPiso: true,
      presidentPuerta: true,
      boardVicePortal: true,
      boardVicePiso: true,
      boardVicePuerta: true,
      boardVocalsJson: true,
      presidentEmail: true,
      communityAdminEmail: true,
      companyId: true,
      conciergeEmail: true,
      conciergeEmail2: true,
      conciergeSubstituteEmail: true,
      conciergeEmailsJson: true,
    },
  })
}

function mapEntry(row: {
  id: number
  communityId: number
  entryDate: Date
  startMinute: number
  description: string
  createdByUserId: number
  createdByName: string | null
  createdAt: Date
  updatedAt: Date
}) {
  const ymd = row.entryDate.toISOString().slice(0, 10)
  return {
    id: row.id,
    communityId: row.communityId,
    entryDate: ymd,
    startMinute: row.startMinute,
    timeLabel: formatMinuteRange(row.startMinute),
    description: row.description,
    createdByUserId: row.createdByUserId,
    createdByName: row.createdByName?.trim() || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function resolveAccess(
  userId: number,
  communityId: number,
  accessCode: string | undefined,
): Promise<
  | { ok: true; access: CuadernoDiarioAccess; communityId: number }
  | { ok: false; status: number; message: string }
> {
  const user = await prisma.vecindarioUser.findUnique({ where: { id: userId } })
  const comm = await loadCommunityForDiario(communityId, accessCode)
  if (!user || !comm) {
    return { ok: false, status: 404, message: 'Comunidad no encontrada o inactiva.' }
  }
  if (comm.appNavCuadernoDiarioEnabled !== true) {
    return {
      ok: false,
      status: 403,
      message: 'El cuaderno diario no está activado para esta comunidad.',
    }
  }
  const access = cuadernoDiarioAccessForUser(user, comm)
  if (access === 'none') {
    return {
      ok: false,
      status: 403,
      message: 'No tienes permiso para ver el cuaderno diario de esta comunidad.',
    }
  }
  return { ok: true, access, communityId: comm.id }
}

communityDiarioRouter.get('/diario/access', requireAuth, async (req, res) => {
  const communityId = Number(req.query.communityId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido' })
    return
  }
  const accessCode = typeof req.query.accessCode === 'string' ? req.query.accessCode : undefined
  const gate = await resolveAccess(req.userId!, communityId, accessCode)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message })
    return
  }
  res.json({ access: gate.access, canWrite: gate.access === 'write' })
})

/** Lista por día o resumen de días con anotaciones en un mes (YYYY-MM). */
communityDiarioRouter.get('/diario', requireAuth, async (req, res) => {
  const communityId = Number(req.query.communityId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido' })
    return
  }
  const accessCode = typeof req.query.accessCode === 'string' ? req.query.accessCode : undefined
  const gate = await resolveAccess(req.userId!, communityId, accessCode)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message })
    return
  }

  const month = parseYm(req.query.month)
  if (month) {
    const from = new Date(Date.UTC(month.y, month.m - 1, 1))
    const to = new Date(Date.UTC(month.y, month.m, 0))
    const rows = await prisma.communityDiarioEntry.findMany({
      where: {
        communityId: gate.communityId,
        entryDate: { gte: from, lte: to },
      },
      select: { entryDate: true },
    })
    const dayCounts: Record<string, number> = {}
    for (const r of rows) {
      const key = r.entryDate.toISOString().slice(0, 10)
      dayCounts[key] = (dayCounts[key] ?? 0) + 1
    }
    res.json({ month: `${month.y}-${String(month.m).padStart(2, '0')}`, dayCounts, access: gate.access })
    return
  }

  const entryDate = parseYmd(req.query.date)
  if (!entryDate) {
    res.status(400).json({ error: 'Indica date=YYYY-MM-DD o month=YYYY-MM.' })
    return
  }

  const rows = await prisma.communityDiarioEntry.findMany({
    where: { communityId: gate.communityId, entryDate },
    orderBy: [{ startMinute: 'asc' }, { id: 'asc' }],
  })
  res.json({
    date: entryDate.toISOString().slice(0, 10),
    access: gate.access,
    entries: rows.map(mapEntry),
  })
})

communityDiarioRouter.post('/diario', requireAuth, async (req, res) => {
  const communityId = Number(req.body?.communityId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido' })
    return
  }
  const accessCode =
    typeof req.body?.accessCode === 'string' ? req.body.accessCode.trim() : undefined
  const gate = await resolveAccess(req.userId!, communityId, accessCode)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message })
    return
  }
  if (gate.access !== 'write') {
    res.status(403).json({ error: 'Solo el conserje puede añadir anotaciones al cuaderno diario.' })
    return
  }

  const entryDate = parseYmd(req.body?.entryDate ?? req.body?.date)
  const startMinute = parseMinute(req.body?.startMinute ?? req.body?.hora)
  const description =
    typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, MAX_DESCRIPTION) : ''

  if (!entryDate) {
    res.status(400).json({ error: 'entryDate debe ser YYYY-MM-DD.' })
    return
  }
  if (startMinute == null) {
    res.status(400).json({ error: 'startMinute debe ser un entero entre 0 y 1439.' })
    return
  }
  if (!description) {
    res.status(400).json({ error: 'La descripción es obligatoria.' })
    return
  }
  if (entryYmd(entryDate) !== localTodayYmd()) {
    res.status(403).json({ error: 'Solo puedes añadir anotaciones para el día de hoy.' })
    return
  }

  const author = await prisma.vecindarioUser.findUnique({
    where: { id: req.userId! },
    select: { id: true, name: true, email: true },
  })
  if (!author) {
    res.status(401).json({ error: 'Sesión no válida.' })
    return
  }

  const row = await prisma.communityDiarioEntry.create({
    data: {
      communityId: gate.communityId,
      entryDate,
      startMinute,
      description,
      createdByUserId: author.id,
      createdByName: staffDisplayName(author),
    },
  })
  res.status(201).json(mapEntry(row))
})

communityDiarioRouter.patch('/diario/:entryId', requireAuth, async (req, res) => {
  const entryId = Number(req.params.entryId)
  if (!Number.isInteger(entryId) || entryId < 1) {
    res.status(400).json({ error: 'ID no válido.' })
    return
  }

  const communityId = Number(req.body?.communityId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido' })
    return
  }
  const accessCode =
    typeof req.body?.accessCode === 'string' ? req.body.accessCode.trim() : undefined
  const gate = await resolveAccess(req.userId!, communityId, accessCode)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message })
    return
  }
  if (gate.access !== 'write') {
    res.status(403).json({ error: 'Solo el conserje puede editar anotaciones.' })
    return
  }

  const existing = await prisma.communityDiarioEntry.findFirst({
    where: { id: entryId, communityId: gate.communityId },
  })
  if (!existing) {
    res.status(404).json({ error: 'Anotación no encontrada.' })
    return
  }

  const denied = mutateEntryDenied(req.userId!, existing)
  if (denied) {
    res.status(403).json({ error: denied })
    return
  }

  const data: {
    startMinute?: number
    description?: string
  } = {}
  if (req.body?.entryDate != null || req.body?.date != null) {
    res.status(400).json({ error: 'No se puede cambiar la fecha de una anotación.' })
    return
  }
  if (req.body?.startMinute != null || req.body?.hora != null) {
    const m = parseMinute(req.body?.startMinute ?? req.body?.hora)
    if (m == null) {
      res.status(400).json({ error: 'startMinute inválido.' })
      return
    }
    data.startMinute = m
  }
  if (typeof req.body?.description === 'string') {
    const t = req.body.description.trim().slice(0, MAX_DESCRIPTION)
    if (!t) {
      res.status(400).json({ error: 'La descripción no puede estar vacía.' })
      return
    }
    data.description = t
  }

  const row = await prisma.communityDiarioEntry.update({
    where: { id: entryId },
    data,
  })
  res.json(mapEntry(row))
})

communityDiarioRouter.delete('/diario/:entryId', requireAuth, async (req, res) => {
  const entryId = Number(req.params.entryId)
  if (!Number.isInteger(entryId) || entryId < 1) {
    res.status(400).json({ error: 'ID no válido.' })
    return
  }

  const communityId = Number(req.body?.communityId ?? req.query.communityId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido' })
    return
  }
  const accessCode =
    typeof req.body?.accessCode === 'string'
      ? req.body.accessCode.trim()
      : typeof req.query.accessCode === 'string'
        ? req.query.accessCode
        : undefined
  const gate = await resolveAccess(req.userId!, communityId, accessCode)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message })
    return
  }
  if (gate.access !== 'write') {
    res.status(403).json({ error: 'Solo el conserje puede eliminar anotaciones.' })
    return
  }

  const existing = await prisma.communityDiarioEntry.findFirst({
    where: { id: entryId, communityId: gate.communityId },
    select: { id: true, createdByUserId: true, entryDate: true },
  })
  if (!existing) {
    res.status(404).json({ error: 'Anotación no encontrada.' })
    return
  }

  const denied = mutateEntryDenied(req.userId!, existing)
  if (denied) {
    res.status(403).json({ error: denied })
    return
  }

  await prisma.communityDiarioEntry.delete({ where: { id: entryId } })
  res.json({ ok: true })
})
