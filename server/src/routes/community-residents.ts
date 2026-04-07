import { Router, type Request } from 'express'
import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/require-auth.js'
import { normEmail } from '../lib/community-user-access.js'
import {
  computeJuntaUpdate,
  juntaRoleForResident,
  type JuntaAssignBody,
} from '../lib/community-board-junta.js'
import { parseOptionalInstructionEmail } from '../lib/instruction-email.js'
import {
  parseOptionalBodyString,
  parsePuertaField,
  trimDwellingField,
} from '../lib/resident-dwelling-fields.js'
import {
  dwellingTripletKey,
  enumerateStructuredDwellings,
} from '../lib/enumerate-structured-dwellings.js'
import { communityOperationalWhere } from '../lib/community-status.js'
import { assertStaffOwnsCommunity } from '../lib/community-staff-gate.js'

export const communityResidentsRouter = Router()

const MISSING_DWELLINGS_PREVIEW_CAP = 500

type DwellingUnit = { portal: string; piso: string; puerta: string }

type DwellingCoverage = {
  structuredTotal: number
  accountsCoveringStructured: number
  missing: DwellingUnit[]
  missingTotal: number
  previewCapped: boolean
  canBulkCreate: boolean
}

async function structuredAndMissingDwellings(
  communityId: number,
): Promise<{ structured: DwellingUnit[]; missing: DwellingUnit[] } | null> {
  const comm = await prisma.community.findFirst({
    where: { id: communityId, ...communityOperationalWhere() },
    select: {
      portalCount: true,
      portalLabels: true,
      portalDwellingConfig: true,
    },
  })
  if (!comm) return null

  const structured = enumerateStructuredDwellings(
    comm.portalCount,
    comm.portalLabels,
    comm.portalDwellingConfig,
  )

  const rows = await prisma.vecindarioUser.findMany({
    where: { communityId, role: 'resident' },
    select: { portal: true, piso: true, puerta: true },
  })
  const existingKeys = new Set<string>()
  for (const r of rows) {
    const pr = (r.portal ?? '').trim()
    const ps = (r.piso ?? '').trim()
    const pu = (r.puerta ?? '').trim()
    if (!pr || !ps || !pu) continue
    existingKeys.add(dwellingTripletKey(pr, ps, pu))
  }

  const missing = structured.filter(
    (u) => !existingKeys.has(dwellingTripletKey(u.portal, u.piso, u.puerta)),
  )

  return { structured, missing }
}

async function dwellingCoverageForCommunity(communityId: number): Promise<DwellingCoverage | null> {
  const data = await structuredAndMissingDwellings(communityId)
  if (!data) return null
  const { structured, missing } = data
  return {
    structuredTotal: structured.length,
    accountsCoveringStructured: structured.length - missing.length,
    missing: missing.slice(0, MISSING_DWELLINGS_PREVIEW_CAP),
    missingTotal: missing.length,
    previewCapped: missing.length > MISSING_DWELLINGS_PREVIEW_CAP,
    canBulkCreate: structured.length > 0,
  }
}

function parseBody(req: Request) {
  const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? (req.body as Record<string, unknown>)
    : null
  return b
}

/** Alta de vecino sin correo: portal + piso + contraseña dentro de la comunidad. */
communityResidentsRouter.post('/residents', requireAuth, async (req, res) => {
  const body = parseBody(req)
  if (!body) {
    res.status(400).json({ error: 'JSON inválido' })
    return
  }

  const communityId = Number(body.communityId)
  const accessCodeRaw = typeof body.accessCode === 'string' ? body.accessCode.trim() : ''
  const accessCodeForGate = accessCodeRaw || undefined
  const piso = typeof body.piso === 'string' ? body.piso.trim().slice(0, 64) : ''
  const portal = typeof body.portal === 'string' ? body.portal.trim().slice(0, 64) : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 255) : ''
  const puerta = parsePuertaField(body.puerta)
  const emailParsed = parseOptionalInstructionEmail(body.email)
  if (emailParsed.invalidFormat) {
    res.status(400).json({ error: 'El email no tiene un formato válido.' })
    return
  }
  const emailForCreate = emailParsed.value

  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId es obligatorio.' })
    return
  }
  if (!piso || !portal) {
    res.status(400).json({ error: 'Piso y portal son obligatorios.' })
    return
  }
  if (!puerta) {
    res.status(400).json({
      error: 'Puerta obligatoria',
      message:
        'Indica puerta (apartamento / letra): con portal y piso identifican la vivienda (bloque, planta, puerta).',
    })
    return
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' })
    return
  }

  if (emailForCreate) {
    const emailTaken = await prisma.vecindarioUser.findUnique({
      where: { email: emailForCreate },
      select: { id: true },
    })
    if (emailTaken) {
      res.status(409).json({ error: 'Ese email ya está registrado.' })
      return
    }
  }

  const gate = await assertStaffOwnsCommunity(req.userId!, communityId, accessCodeForGate)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message })
    return
  }

  const meta = await prisma.community.findUnique({
    where: { id: communityId },
    select: { residentSlots: true },
  })
  if (meta?.residentSlots != null && meta.residentSlots > 0) {
    const count = await prisma.vecindarioUser.count({
      where: { communityId, role: 'resident' },
    })
    if (count >= meta.residentSlots) {
      res.status(403).json({
        error: 'Cupo de vecinos alcanzado',
        message: `Esta comunidad tiene un máximo de ${meta.residentSlots} cuentas de vecino.`,
      })
      return
    }
  }

  const existing = await prisma.vecindarioUser.findFirst({
    where: {
      role: 'resident',
      communityId,
      piso,
      portal,
      puerta,
    },
    select: { id: true },
  })
  if (existing) {
    res.status(409).json({
      error: 'Ya existe un vecino con ese portal, piso y puerta en esta comunidad.',
    })
    return
  }

  const phone = trimDwellingField(body.phone, 40)
  const habitaciones = trimDwellingField(body.habitaciones, 64)
  const plazaGaraje = trimDwellingField(body.plazaGaraje, 64)
  const poolAccessOwner = trimDwellingField(body.poolAccessOwner, 64)
  const poolAccessGuest = trimDwellingField(body.poolAccessGuest, 64)

  const passwordHash = await bcrypt.hash(password, 12)
  try {
    const created = await prisma.vecindarioUser.create({
      data: {
        email: emailForCreate,
        passwordHash,
        name: name || null,
        phone,
        piso,
        portal,
        puerta,
        habitaciones,
        plazaGaraje,
        poolAccessOwner,
        poolAccessGuest,
        communityId,
        role: 'resident',
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        piso: true,
        portal: true,
        puerta: true,
        habitaciones: true,
        plazaGaraje: true,
        poolAccessOwner: true,
        poolAccessGuest: true,
      },
    })
    res.status(201).json({
      id: created.id,
      name: created.name,
      email: created.email,
      phone: created.phone,
      piso: created.piso,
      portal: created.portal,
      puerta: created.puerta,
      habitaciones: created.habitaciones,
      plazaGaraje: created.plazaGaraje,
      poolAccessOwner: created.poolAccessOwner,
      poolAccessGuest: created.poolAccessGuest,
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'No se pudo crear el usuario.' })
  }
})

/** Lista mínima de vecinos con cuenta en esta comunidad (sin correos). */
communityResidentsRouter.get('/residents', requireAuth, async (req, res) => {
  const communityId = Number(req.query.communityId)
  const accessCodeRaw = typeof req.query.accessCode === 'string' ? req.query.accessCode.trim() : ''
  const accessCodeForGate = accessCodeRaw || undefined

  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId es obligatorio.' })
    return
  }

  const gate = await assertStaffOwnsCommunity(req.userId!, communityId, accessCodeForGate)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message })
    return
  }

  const [rows, commJunta] = await Promise.all([
    prisma.vecindarioUser.findMany({
      where: { communityId, role: 'resident' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        piso: true,
        portal: true,
        puerta: true,
        habitaciones: true,
        plazaGaraje: true,
        poolAccessOwner: true,
        poolAccessGuest: true,
      },
      orderBy: [{ portal: 'asc' }, { piso: 'asc' }, { puerta: 'asc' }, { id: 'asc' }],
    }),
    prisma.community.findUnique({
      where: { id: communityId },
      select: {
        presidentPortal: true,
        presidentPiso: true,
        boardVicePortal: true,
        boardVicePiso: true,
        boardVocalsJson: true,
      },
    }),
  ])

  const juntaBase = commJunta ?? {
    presidentPortal: null,
    presidentPiso: null,
    boardVicePortal: null,
    boardVicePiso: null,
    boardVocalsJson: [],
  }

  res.json({
    residents: rows.map((r) => {
      const portal = r.portal?.trim() || ''
      const piso = r.piso?.trim() || ''
      const boardRole =
        portal && piso ? juntaRoleForResident(portal, piso, juntaBase) : null
      return {
        id: r.id,
        name: r.name,
        email: r.email?.trim() || null,
        phone: r.phone,
        piso: r.piso,
        portal: r.portal,
        puerta: r.puerta,
        habitaciones: r.habitaciones,
        plazaGaraje: r.plazaGaraje,
        poolAccessOwner: r.poolAccessOwner,
        poolAccessGuest: r.poolAccessGuest,
        hasEmail: Boolean(r.email?.trim()),
        boardRole,
      }
    }),
  })
})

/** Vista previa: viviendas definidas en la ficha vs cuentas existentes (mismo criterio que el alta manual). */
communityResidentsRouter.get('/residents/missing-dwellings-preview', requireAuth, async (req, res) => {
  const communityId = Number(req.query.communityId)
  const accessCodeRaw = typeof req.query.accessCode === 'string' ? req.query.accessCode.trim() : ''
  const accessCodeForGate = accessCodeRaw || undefined

  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId es obligatorio.' })
    return
  }

  const gate = await assertStaffOwnsCommunity(req.userId!, communityId, accessCodeForGate)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message })
    return
  }

  const cov = await dwellingCoverageForCommunity(communityId)
  if (!cov) {
    res.status(404).json({ error: 'Comunidad no encontrada.' })
    return
  }

  res.json({
    structuredTotal: cov.structuredTotal,
    accountsCoveringStructured: cov.accountsCoveringStructured,
    missingTotal: cov.missingTotal,
    missing: cov.missing,
    previewCapped: cov.previewCapped,
    canBulkCreate: cov.canBulkCreate,
    hint:
      cov.structuredTotal === 0
        ? 'Configura portales y estructura (plantas y puertas por planta) en Super Admin para enumerar viviendas.'
        : undefined,
  })
})

/**
 * Crea cuentas de vecino (sin email) para cada vivienda definida en la ficha que aún no tenga cuenta.
 * Misma contraseña inicial para todas las creadas en esta petición.
 */
communityResidentsRouter.post('/residents/create-missing-dwellings', requireAuth, async (req, res) => {
  const body = parseBody(req)
  if (!body) {
    res.status(400).json({ error: 'JSON inválido' })
    return
  }

  const communityId = Number(body.communityId)
  const accessCodeRaw = typeof body.accessCode === 'string' ? body.accessCode.trim() : ''
  const accessCodeForGate = accessCodeRaw || undefined
  const password = typeof body.password === 'string' ? body.password : ''

  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId es obligatorio.' })
    return
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' })
    return
  }

  const gate = await assertStaffOwnsCommunity(req.userId!, communityId, accessCodeForGate)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message })
    return
  }

  const bundle = await structuredAndMissingDwellings(communityId)
  if (!bundle) {
    res.status(404).json({ error: 'Comunidad no encontrada.' })
    return
  }
  const { structured, missing } = bundle
  if (structured.length === 0) {
    res.status(400).json({
      error: 'Sin estructura',
      message:
        'No se pueden enumerar viviendas: falta configuración de portales y plantas/puertas en Super Admin.',
    })
    return
  }
  if (missing.length === 0) {
    res.status(200).json({
      created: [],
      createdCount: 0,
      failures: [],
      skippedDueToCap: 0,
      message: 'Todas las viviendas definidas en la ficha ya tienen cuenta de vecino.',
    })
    return
  }

  const meta = await prisma.community.findUnique({
    where: { id: communityId },
    select: { residentSlots: true },
  })
  let toCreate = missing
  let skippedDueToCap = 0
  if (meta?.residentSlots != null && meta.residentSlots > 0) {
    const currentCount = await prisma.vecindarioUser.count({
      where: { communityId, role: 'resident' },
    })
    const room = meta.residentSlots - currentCount
    if (room <= 0) {
      res.status(403).json({
        error: 'Cupo de vecinos alcanzado',
        message: `Esta comunidad tiene un máximo de ${meta.residentSlots} cuentas de vecino.`,
      })
      return
    }
    if (toCreate.length > room) {
      skippedDueToCap = toCreate.length - room
      toCreate = toCreate.slice(0, room)
    }
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const created: { id: number; portal: string; piso: string; puerta: string }[] = []
  const failures: { portal: string; piso: string; puerta: string; error: string }[] = []

  for (const u of toCreate) {
    const portal = u.portal.trim().slice(0, 64)
    const piso = u.piso.trim().slice(0, 64)
    const puerta = u.puerta.trim().slice(0, 64)
    const label = `Vivienda ${portal} · ${piso} · ${puerta}`.slice(0, 255)
    try {
      const row = await prisma.vecindarioUser.create({
        data: {
          email: null,
          passwordHash,
          name: label,
          piso,
          portal,
          puerta,
          communityId,
          role: 'resident',
        },
        select: { id: true, portal: true, piso: true, puerta: true },
      })
      created.push({
        id: row.id,
        portal: row.portal ?? portal,
        piso: row.piso ?? piso,
        puerta: row.puerta ?? puerta,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      failures.push({ portal, piso, puerta, error: msg })
    }
  }

  res.status(201).json({
    created,
    createdCount: created.length,
    failures,
    skippedDueToCap,
    requestedTotal: missing.length,
  })
})

const JUNTA_ASSIGNS = new Set<JuntaAssignBody>(['none', 'president', 'vice_president', 'vocal'])

/** Actualizar ficha del vecino (datos personales, vivienda, extras). Mismos permisos que el alta. */
communityResidentsRouter.patch('/residents/:residentId', requireAuth, async (req, res) => {
  const residentId = Number(req.params.residentId)
  if (!Number.isInteger(residentId) || residentId < 1) {
    res.status(400).json({ error: 'ID de vecino no válido.' })
    return
  }

  const body = parseBody(req)
  if (!body) {
    res.status(400).json({ error: 'JSON inválido' })
    return
  }

  const communityId = Number(body.communityId)
  const accessCodeRaw = typeof body.accessCode === 'string' ? body.accessCode.trim() : ''
  const accessCodeForGate = accessCodeRaw || undefined

  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId es obligatorio.' })
    return
  }

  const gate = await assertStaffOwnsCommunity(req.userId!, communityId, accessCodeForGate)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message })
    return
  }

  const existing = await prisma.vecindarioUser.findFirst({
    where: { id: residentId, communityId, role: 'resident' },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      piso: true,
      portal: true,
      puerta: true,
      habitaciones: true,
      plazaGaraje: true,
      poolAccessOwner: true,
      poolAccessGuest: true,
    },
  })
  if (!existing) {
    res.status(404).json({ error: 'Vecino no encontrado en esta comunidad.' })
    return
  }

  const data: {
    name?: string | null
    email?: string | null
    phone?: string | null
    piso?: string
    portal?: string
    puerta?: string | null
    habitaciones?: string | null
    plazaGaraje?: string | null
    poolAccessOwner?: string | null
    poolAccessGuest?: string | null
  } = {}

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    data.name =
      typeof body.name === 'string' ? body.name.trim().slice(0, 255) || null : null
  }

  if (Object.prototype.hasOwnProperty.call(body, 'email')) {
    const ep = parseOptionalInstructionEmail(body.email)
    if (ep.invalidFormat) {
      res.status(400).json({ error: 'El email no tiene un formato válido.' })
      return
    }
    const nextE = ep.value
    const prevE = normEmail(existing.email)
    if (nextE && nextE !== prevE) {
      const taken = await prisma.vecindarioUser.findFirst({
        where: { email: nextE, NOT: { id: residentId } },
        select: { id: true },
      })
      if (taken) {
        res.status(409).json({ error: 'Ese email ya está registrado.' })
        return
      }
    }
    data.email = nextE
  }

  const phoneP = parseOptionalBodyString(body, 'phone', 40)
  if (phoneP !== undefined) data.phone = phoneP
  const habP = parseOptionalBodyString(body, 'habitaciones', 64)
  if (habP !== undefined) data.habitaciones = habP
  const pgP = parseOptionalBodyString(body, 'plazaGaraje', 64)
  if (pgP !== undefined) data.plazaGaraje = pgP
  const poP = parseOptionalBodyString(body, 'poolAccessOwner', 64)
  if (poP !== undefined) data.poolAccessOwner = poP
  const pguestP = parseOptionalBodyString(body, 'poolAccessGuest', 64)
  if (pguestP !== undefined) data.poolAccessGuest = pguestP

  if (Object.prototype.hasOwnProperty.call(body, 'portal')) {
    const t = typeof body.portal === 'string' ? body.portal.trim().slice(0, 64) : ''
    if (!t) {
      res.status(400).json({ error: 'Portal no puede estar vacío.' })
      return
    }
    data.portal = t
  }
  if (Object.prototype.hasOwnProperty.call(body, 'piso')) {
    const t = typeof body.piso === 'string' ? body.piso.trim().slice(0, 64) : ''
    if (!t) {
      res.status(400).json({ error: 'Piso no puede estar vacío.' })
      return
    }
    data.piso = t
  }
  if (Object.prototype.hasOwnProperty.call(body, 'puerta')) {
    data.puerta = parsePuertaField(body.puerta)
  }

  const mergedPortal = (data.portal ?? existing.portal)?.trim() || ''
  const mergedPiso = (data.piso ?? existing.piso)?.trim() || ''
  const mergedPuerta = data.puerta !== undefined ? data.puerta : existing.puerta

  if (data.portal !== undefined || data.piso !== undefined || data.puerta !== undefined) {
    if (!mergedPortal || !mergedPiso) {
      res.status(400).json({ error: 'Portal y piso deben quedar definidos.' })
      return
    }
    const puertaOk =
      mergedPuerta != null && String(mergedPuerta).trim().length > 0
    if (!puertaOk) {
      res.status(400).json({
        error: 'Puerta obligatoria',
        message: 'Portal, piso y puerta deben quedar definidos para la vivienda.',
      })
      return
    }
    const dup = await prisma.vecindarioUser.findFirst({
      where: {
        role: 'resident',
        communityId,
        portal: mergedPortal,
        piso: mergedPiso,
        puerta: mergedPuerta,
        NOT: { id: residentId },
      },
      select: { id: true },
    })
    if (dup) {
      res.status(409).json({ error: 'Ya existe otro vecino con esa vivienda.' })
      return
    }
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'Nada que actualizar' })
    return
  }

  const updated = await prisma.vecindarioUser.update({
    where: { id: residentId },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      piso: true,
      portal: true,
      puerta: true,
      habitaciones: true,
      plazaGaraje: true,
      poolAccessOwner: true,
      poolAccessGuest: true,
    },
  })

  res.json(updated)
})

/** Fijar nueva contraseña a un vecino (olvido / soporte). Mismos permisos que alta de vecinos. */
communityResidentsRouter.patch('/residents/:residentId/password', requireAuth, async (req, res) => {
  const residentId = Number(req.params.residentId)
  if (!Number.isInteger(residentId) || residentId < 1) {
    res.status(400).json({ error: 'ID de vecino no válido.' })
    return
  }

  const body = parseBody(req)
  if (!body) {
    res.status(400).json({ error: 'JSON inválido' })
    return
  }

  const communityId = Number(body.communityId)
  const accessCodeRaw = typeof body.accessCode === 'string' ? body.accessCode.trim() : ''
  const accessCodeForGate = accessCodeRaw || undefined
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId es obligatorio.' })
    return
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' })
    return
  }

  const gate = await assertStaffOwnsCommunity(req.userId!, communityId, accessCodeForGate)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message })
    return
  }

  const resident = await prisma.vecindarioUser.findFirst({
    where: { id: residentId, communityId, role: 'resident' },
    select: { id: true },
  })
  if (!resident) {
    res.status(404).json({ error: 'Vecino no encontrado en esta comunidad.' })
    return
  }

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.vecindarioUser.update({
    where: { id: residentId },
    data: { passwordHash },
  })

  res.json({ ok: true })
})

/** Asignar cargo de junta por vivienda (presidente → mismos derechos que presidentPortal/Piso al iniciar sesión). */
communityResidentsRouter.patch('/residents/:residentId/junta', requireAuth, async (req, res) => {
  const residentId = Number(req.params.residentId)
  if (!Number.isInteger(residentId) || residentId < 1) {
    res.status(400).json({ error: 'ID de vecino no válido.' })
    return
  }

  const body = parseBody(req)
  if (!body) {
    res.status(400).json({ error: 'JSON inválido' })
    return
  }

  const communityId = Number(body.communityId)
  const accessCodeRaw = typeof body.accessCode === 'string' ? body.accessCode.trim() : ''
  const accessCodeForGate = accessCodeRaw || undefined
  const boardRoleRaw = typeof body.boardRole === 'string' ? body.boardRole.trim() : ''

  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId es obligatorio.' })
    return
  }

  const boardRole = boardRoleRaw as JuntaAssignBody
  if (!JUNTA_ASSIGNS.has(boardRole)) {
    res.status(400).json({
      error: 'boardRole inválido',
      message: 'Usa: none, president, vice_president o vocal.',
    })
    return
  }

  const gate = await assertStaffOwnsCommunity(req.userId!, communityId, accessCodeForGate)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message })
    return
  }

  const resident = await prisma.vecindarioUser.findFirst({
    where: { id: residentId, communityId, role: 'resident' },
    select: { id: true, portal: true, piso: true },
  })
  if (!resident) {
    res.status(404).json({ error: 'Vecino no encontrado en esta comunidad.' })
    return
  }
  const rp = resident.portal?.trim() || ''
  const rs = resident.piso?.trim() || ''
  if (!rp || !rs) {
    res.status(400).json({ error: 'El vecino debe tener portal y piso definidos.' })
    return
  }

  const comm = await prisma.community.findUnique({
    where: { id: communityId },
    select: {
      presidentPortal: true,
      presidentPiso: true,
      boardVicePortal: true,
      boardVicePiso: true,
      boardVocalsJson: true,
    },
  })
  if (!comm) {
    res.status(404).json({ error: 'Comunidad no encontrada.' })
    return
  }

  const next = computeJuntaUpdate(comm, rp, rs, boardRole)

  await prisma.community.update({
    where: { id: communityId },
    data: {
      presidentPortal: next.presidentPortal,
      presidentPiso: next.presidentPiso,
      boardVicePortal: next.boardVicePortal,
      boardVicePiso: next.boardVicePiso,
      boardVocalsJson: next.boardVocalsJson,
    },
  })

  const boardRoleOut = juntaRoleForResident(rp, rs, {
    presidentPortal: next.presidentPortal,
    presidentPiso: next.presidentPiso,
    boardVicePortal: next.boardVicePortal,
    boardVicePiso: next.boardVicePiso,
    boardVocalsJson: next.boardVocalsJson,
  })

  res.json({ ok: true, boardRole: boardRoleOut })
})
