import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/require-auth.js'
import { communityOperationalWhere } from '../lib/community-status.js'
import { staffDisplayName } from '../lib/staff-display-name.js'
import { conciergeEmailPrismaSelect } from '../lib/concierge-emails.js'
import {
  controlEntradaAccessForUser,
  type ControlEntradaAccess,
} from '../lib/community-control-entrada-access.js'

export const communityControlEntradaRouter = Router()

const MAX_TEXT = 255
const MAX_MOTIVO = 4000
const CE_SEARCH_MIN = 2
const CE_SEARCH_MAX = 80
const CE_SEARCH_LIMIT = 50

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

function formatMinute(min: number): string {
  const h = Math.floor(min / 60)
  const mi = min % 60
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}

function trimField(s: unknown, max: number): string {
  if (typeof s !== 'string') return ''
  return s.trim().slice(0, max)
}

async function loadCommunity(communityId: number, accessCode: string | undefined) {
  const code = accessCode?.trim().toUpperCase() ?? ''
  return prisma.community.findFirst({
    where: code
      ? { id: communityId, accessCode: code, ...communityOperationalWhere() }
      : { id: communityId, ...communityOperationalWhere() },
    select: {
      id: true,
      name: true,
      status: true,
      appNavControlEntradaEnabled: true,
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
      ...conciergeEmailPrismaSelect,
    },
  })
}

function mapEntry(row: {
  id: number
  communityId: number
  entryDate: Date
  nombre: string
  identificacion: string
  horaEntradaMinute: number
  horaSalidaMinute: number | null
  ubicacion: string
  motivo: string | null
  createdByUserId: number
  createdByName: string | null
  salidaByUserId?: number | null
  salidaByName?: string | null
  updatedByUserId?: number | null
  updatedByName?: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: row.id,
    communityId: row.communityId,
    entryDate: row.entryDate.toISOString().slice(0, 10),
    nombre: row.nombre,
    identificacion: row.identificacion,
    horaEntradaMinute: row.horaEntradaMinute,
    horaEntradaLabel: formatMinute(row.horaEntradaMinute),
    horaSalidaMinute: row.horaSalidaMinute,
    horaSalidaLabel: row.horaSalidaMinute != null ? formatMinute(row.horaSalidaMinute) : null,
    ubicacion: row.ubicacion,
    motivo: row.motivo?.trim() || null,
    createdByUserId: row.createdByUserId,
    createdByName: row.createdByName?.trim() || null,
    salidaByUserId: row.salidaByUserId ?? null,
    salidaByName: row.salidaByName?.trim() || null,
    updatedByUserId: row.updatedByUserId ?? null,
    updatedByName: row.updatedByName?.trim() || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function resolveAccess(
  userId: number,
  communityId: number,
  accessCode: string | undefined,
): Promise<
  | { ok: true; access: ControlEntradaAccess; communityId: number }
  | { ok: false; status: number; message: string }
> {
  const user = await prisma.vecindarioUser.findUnique({ where: { id: userId } })
  const comm = await loadCommunity(communityId, accessCode)
  if (!user || !comm) {
    return { ok: false, status: 404, message: 'Comunidad no encontrada o inactiva.' }
  }
  if (comm.appNavControlEntradaEnabled !== true) {
    return {
      ok: false,
      status: 403,
      message: 'El control de entrada no está activado para esta comunidad.',
    }
  }
  const access = controlEntradaAccessForUser(user, comm)
  if (access === 'none') {
    return {
      ok: false,
      status: 403,
      message: 'No tienes permiso para ver el control de entrada de esta comunidad.',
    }
  }
  return { ok: true, access, communityId: comm.id }
}

communityControlEntradaRouter.get('/control-entrada/access', requireAuth, async (req, res) => {
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

/** Lista del mes YYYY-MM, o búsqueda por texto en todo el historial. */
communityControlEntradaRouter.get('/control-entrada', requireAuth, async (req, res) => {
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

  const qRaw = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  if (qRaw) {
    if (qRaw.length < CE_SEARCH_MIN) {
      res.status(400).json({
        error: `Escribe al menos ${CE_SEARCH_MIN} caracteres para buscar.`,
      })
      return
    }
    if (qRaw.length > CE_SEARCH_MAX) {
      res.status(400).json({
        error: `La búsqueda no puede superar ${CE_SEARCH_MAX} caracteres.`,
      })
      return
    }
    const rows = await prisma.communityControlEntradaEntry.findMany({
      where: {
        communityId: gate.communityId,
        OR: [
          { nombre: { contains: qRaw } },
          { identificacion: { contains: qRaw } },
          { ubicacion: { contains: qRaw } },
          { motivo: { contains: qRaw } },
        ],
      },
      orderBy: [{ entryDate: 'desc' }, { horaEntradaMinute: 'desc' }, { id: 'desc' }],
      take: CE_SEARCH_LIMIT + 1,
    })
    const truncated = rows.length > CE_SEARCH_LIMIT
    const page = truncated ? rows.slice(0, CE_SEARCH_LIMIT) : rows
    res.json({
      q: qRaw,
      access: gate.access,
      truncated,
      entries: page.map(mapEntry),
    })
    return
  }

  const month = parseYm(req.query.month)
  if (!month) {
    res.status(400).json({ error: 'Indica month=YYYY-MM o q=texto.' })
    return
  }

  const from = new Date(Date.UTC(month.y, month.m - 1, 1))
  const to = new Date(Date.UTC(month.y, month.m, 0))
  const rows = await prisma.communityControlEntradaEntry.findMany({
    where: {
      communityId: gate.communityId,
      entryDate: { gte: from, lte: to },
    },
    orderBy: [{ entryDate: 'asc' }, { horaEntradaMinute: 'asc' }, { id: 'asc' }],
  })

  res.json({
    month: `${month.y}-${String(month.m).padStart(2, '0')}`,
    access: gate.access,
    entries: rows.map(mapEntry),
  })
})

communityControlEntradaRouter.post('/control-entrada', requireAuth, async (req, res) => {
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
    res.status(403).json({ error: 'Solo el conserje puede registrar entradas.' })
    return
  }

  const entryDate = parseYmd(req.body?.entryDate ?? req.body?.date)
  const horaEntradaMinute = parseMinute(req.body?.horaEntradaMinute ?? req.body?.horaEntrada)
  const salidaRaw = req.body?.horaSalidaMinute ?? req.body?.horaSalida
  const horaSalidaMinute =
    salidaRaw === null || salidaRaw === undefined || salidaRaw === ''
      ? null
      : parseMinute(salidaRaw)
  const nombre = trimField(req.body?.nombre, MAX_TEXT)
  const identificacion = trimField(req.body?.identificacion, MAX_TEXT)
  const ubicacion = trimField(req.body?.ubicacion, MAX_TEXT)
  const motivoRaw = typeof req.body?.motivo === 'string' ? req.body.motivo.trim().slice(0, MAX_MOTIVO) : ''
  const motivo = motivoRaw || null

  if (!entryDate) {
    res.status(400).json({ error: 'entryDate debe ser YYYY-MM-DD.' })
    return
  }
  if (horaEntradaMinute == null) {
    res.status(400).json({ error: 'horaEntradaMinute inválida (0–1439).' })
    return
  }
  if (salidaRaw !== null && salidaRaw !== undefined && salidaRaw !== '' && horaSalidaMinute == null) {
    res.status(400).json({ error: 'horaSalidaMinute inválida (0–1439).' })
    return
  }
  if (horaSalidaMinute != null && horaSalidaMinute < horaEntradaMinute) {
    res.status(400).json({ error: 'La hora de salida no puede ser anterior a la de entrada.' })
    return
  }
  if (!nombre) {
    res.status(400).json({ error: 'El nombre es obligatorio.' })
    return
  }
  if (!identificacion) {
    res.status(400).json({ error: 'La identificación es obligatoria.' })
    return
  }
  if (!ubicacion) {
    res.status(400).json({ error: 'La ubicación es obligatoria.' })
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

  const authorName = staffDisplayName(author)
  const row = await prisma.communityControlEntradaEntry.create({
    data: {
      communityId: gate.communityId,
      entryDate,
      nombre,
      identificacion,
      horaEntradaMinute,
      horaSalidaMinute,
      ubicacion,
      motivo,
      createdByUserId: author.id,
      createdByName: authorName,
      ...(horaSalidaMinute != null
        ? { salidaByUserId: author.id, salidaByName: authorName }
        : {}),
    },
  })
  res.status(201).json(mapEntry(row))
})

communityControlEntradaRouter.patch('/control-entrada/:entryId', requireAuth, async (req, res) => {
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
    res.status(403).json({ error: 'Solo el conserje puede editar registros.' })
    return
  }

  const existing = await prisma.communityControlEntradaEntry.findFirst({
    where: { id: entryId, communityId: gate.communityId },
  })
  if (!existing) {
    res.status(404).json({ error: 'Registro no encontrado.' })
    return
  }

  const data: {
    entryDate?: Date
    nombre?: string
    identificacion?: string
    horaEntradaMinute?: number
    horaSalidaMinute?: number | null
    ubicacion?: string
    motivo?: string | null
    salidaByUserId?: number | null
    salidaByName?: string | null
    updatedByUserId?: number
    updatedByName?: string | null
  } = {}

  if (req.body?.entryDate != null || req.body?.date != null) {
    const d = parseYmd(req.body?.entryDate ?? req.body?.date)
    if (!d) {
      res.status(400).json({ error: 'entryDate inválida.' })
      return
    }
    data.entryDate = d
  }
  if (req.body?.nombre != null) {
    const n = trimField(req.body.nombre, MAX_TEXT)
    if (!n) {
      res.status(400).json({ error: 'El nombre no puede estar vacío.' })
      return
    }
    data.nombre = n
  }
  if (req.body?.identificacion != null) {
    const idf = trimField(req.body.identificacion, MAX_TEXT)
    if (!idf) {
      res.status(400).json({ error: 'La identificación no puede estar vacía.' })
      return
    }
    data.identificacion = idf
  }
  if (req.body?.ubicacion != null) {
    const u = trimField(req.body.ubicacion, MAX_TEXT)
    if (!u) {
      res.status(400).json({ error: 'La ubicación no puede estar vacía.' })
      return
    }
    data.ubicacion = u
  }
  if (typeof req.body?.motivo === 'string') {
    const m = req.body.motivo.trim().slice(0, MAX_MOTIVO)
    data.motivo = m || null
  }
  if (req.body?.horaEntradaMinute != null || req.body?.horaEntrada != null) {
    const m = parseMinute(req.body?.horaEntradaMinute ?? req.body?.horaEntrada)
    if (m == null) {
      res.status(400).json({ error: 'horaEntradaMinute inválida.' })
      return
    }
    data.horaEntradaMinute = m
  }

  let salidaChanged = false
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'horaSalidaMinute') ||
      Object.prototype.hasOwnProperty.call(req.body ?? {}, 'horaSalida')) {
    const salidaRaw = req.body?.horaSalidaMinute ?? req.body?.horaSalida
    if (salidaRaw === null || salidaRaw === '') {
      data.horaSalidaMinute = null
      data.salidaByUserId = null
      data.salidaByName = null
      salidaChanged = true
    } else {
      const m = parseMinute(salidaRaw)
      if (m == null) {
        res.status(400).json({ error: 'horaSalidaMinute inválida.' })
        return
      }
      data.horaSalidaMinute = m
      salidaChanged = true
    }
  }

  const entrada = data.horaEntradaMinute ?? existing.horaEntradaMinute
  const salida =
    data.horaSalidaMinute !== undefined ? data.horaSalidaMinute : existing.horaSalidaMinute
  if (salida != null && salida < entrada) {
    res.status(400).json({ error: 'La hora de salida no puede ser anterior a la de entrada.' })
    return
  }

  const contentKeys = Object.keys(data).filter(
    (k) => k !== 'salidaByUserId' && k !== 'salidaByName',
  )
  if (contentKeys.length === 0) {
    res.status(400).json({ error: 'Sin cambios.' })
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
  if (salidaChanged && data.horaSalidaMinute != null) {
    data.salidaByUserId = author.id
    data.salidaByName = staffDisplayName(author)
  }
  data.updatedByUserId = author.id
  data.updatedByName = staffDisplayName(author)

  const row = await prisma.communityControlEntradaEntry.update({
    where: { id: entryId },
    data,
  })
  res.json(mapEntry(row))
})

communityControlEntradaRouter.delete('/control-entrada/:entryId', requireAuth, async (req, res) => {
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
    res.status(403).json({ error: 'Solo el conserje puede eliminar registros.' })
    return
  }

  const existing = await prisma.communityControlEntradaEntry.findFirst({
    where: { id: entryId, communityId: gate.communityId },
    select: { id: true },
  })
  if (!existing) {
    res.status(404).json({ error: 'Registro no encontrado.' })
    return
  }

  await prisma.communityControlEntradaEntry.delete({ where: { id: entryId } })
  res.json({ ok: true })
})
