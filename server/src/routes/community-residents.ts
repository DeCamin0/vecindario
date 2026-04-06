import { Router, type Request } from 'express'
import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/require-auth.js'
import { normEmail } from '../lib/community-user-access.js'
import { residentMatchesPresidentUnit } from '../lib/president-by-unit.js'
import {
  computeJuntaUpdate,
  juntaRoleForResident,
  type JuntaAssignBody,
} from '../lib/community-board-junta.js'

export const communityResidentsRouter = Router()

function parseBody(req: Request) {
  const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? (req.body as Record<string, unknown>)
    : null
  return b
}

async function assertStaffOwnsCommunity(
  staffUserId: number,
  communityId: number,
  accessCode: string,
): Promise<{ ok: true; community: { id: number; name: string } } | { ok: false; status: number; message: string }> {
  const code = accessCode.trim().toUpperCase()
  const comm = await prisma.community.findFirst({
    where: { id: communityId, accessCode: code, status: { not: 'inactive' } },
    select: {
      id: true,
      name: true,
      presidentEmail: true,
      presidentPortal: true,
      presidentPiso: true,
      communityAdminEmail: true,
      conciergeEmail: true,
      residentSlots: true,
    },
  })
  if (!comm) {
    return { ok: false, status: 403, message: 'Código VEC no válido para esta comunidad.' }
  }

  const staff = await prisma.vecindarioUser.findUnique({
    where: { id: staffUserId },
    select: { email: true, role: true, communityId: true, portal: true, piso: true },
  })
  if (!staff) {
    return { ok: false, status: 401, message: 'Sesión no válida.' }
  }
  const e = normEmail(staff.email)
  if (staff.role === 'president') {
    if (normEmail(comm.presidentEmail) !== e) {
      return { ok: false, status: 403, message: 'No eres presidente de esta comunidad.' }
    }
  } else if (staff.role === 'resident') {
    if (!residentMatchesPresidentUnit(comm, staff)) {
      return {
        ok: false,
        status: 403,
        message:
          'Solo el presidente (vivienda designada en la ficha), el administrador o el conserje pueden dar de alta vecinos.',
      }
    }
  } else if (staff.role === 'community_admin') {
    if (normEmail(comm.communityAdminEmail) !== e) {
      return { ok: false, status: 403, message: 'No eres administrador de esta comunidad.' }
    }
  } else if (staff.role === 'concierge') {
    if (normEmail(comm.conciergeEmail) !== e) {
      return { ok: false, status: 403, message: 'No eres conserje de esta comunidad.' }
    }
  } else {
    return {
      ok: false,
      status: 403,
      message: 'Solo presidente, vivienda de presidente, administrador o conserje pueden dar de alta vecinos.',
    }
  }

  return { ok: true, community: { id: comm.id, name: comm.name } }
}

/** Alta de vecino sin correo: portal + piso + contraseña dentro de la comunidad. */
communityResidentsRouter.post('/residents', requireAuth, async (req, res) => {
  const body = parseBody(req)
  if (!body) {
    res.status(400).json({ error: 'JSON inválido' })
    return
  }

  const communityId = Number(body.communityId)
  const accessCode = typeof body.accessCode === 'string' ? body.accessCode.trim() : ''
  const piso = typeof body.piso === 'string' ? body.piso.trim().slice(0, 64) : ''
  const portal = typeof body.portal === 'string' ? body.portal.trim().slice(0, 64) : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 255) : ''

  if (!Number.isInteger(communityId) || communityId < 1 || !accessCode) {
    res.status(400).json({ error: 'communityId y accessCode son obligatorios.' })
    return
  }
  if (!piso || !portal) {
    res.status(400).json({ error: 'Piso y portal son obligatorios.' })
    return
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' })
    return
  }

  const gate = await assertStaffOwnsCommunity(req.userId!, communityId, accessCode)
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
    },
    select: { id: true },
  })
  if (existing) {
    res.status(409).json({
      error: 'Ya existe un vecino con ese portal y piso en esta comunidad.',
    })
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)
  try {
    const created = await prisma.vecindarioUser.create({
      data: {
        email: null,
        passwordHash,
        name: name || null,
        piso,
        portal,
        communityId,
        role: 'resident',
      },
      select: { id: true, name: true, piso: true, portal: true },
    })
    res.status(201).json({
      id: created.id,
      name: created.name,
      piso: created.piso,
      portal: created.portal,
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'No se pudo crear el usuario.' })
  }
})

/** Lista mínima de vecinos con cuenta en esta comunidad (sin correos). */
communityResidentsRouter.get('/residents', requireAuth, async (req, res) => {
  const communityId = Number(req.query.communityId)
  const accessCode = typeof req.query.accessCode === 'string' ? req.query.accessCode.trim() : ''

  if (!Number.isInteger(communityId) || communityId < 1 || !accessCode) {
    res.status(400).json({ error: 'communityId y accessCode son obligatorios.' })
    return
  }

  const gate = await assertStaffOwnsCommunity(req.userId!, communityId, accessCode)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message })
    return
  }

  const [rows, commJunta] = await Promise.all([
    prisma.vecindarioUser.findMany({
      where: { communityId, role: 'resident' },
      select: { id: true, name: true, piso: true, portal: true, email: true },
      orderBy: [{ portal: 'asc' }, { piso: 'asc' }],
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
        piso: r.piso,
        portal: r.portal,
        hasEmail: Boolean(r.email?.trim()),
        boardRole,
      }
    }),
  })
})

const JUNTA_ASSIGNS = new Set<JuntaAssignBody>(['none', 'president', 'vice_president', 'vocal'])

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
  const accessCode = typeof body.accessCode === 'string' ? body.accessCode.trim() : ''
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

  if (!Number.isInteger(communityId) || communityId < 1 || !accessCode) {
    res.status(400).json({ error: 'communityId y accessCode son obligatorios.' })
    return
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' })
    return
  }

  const gate = await assertStaffOwnsCommunity(req.userId!, communityId, accessCode)
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
  const accessCode = typeof body.accessCode === 'string' ? body.accessCode.trim() : ''
  const boardRoleRaw = typeof body.boardRole === 'string' ? body.boardRole.trim() : ''

  if (!Number.isInteger(communityId) || communityId < 1 || !accessCode) {
    res.status(400).json({ error: 'communityId y accessCode son obligatorios.' })
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

  const gate = await assertStaffOwnsCommunity(req.userId!, communityId, accessCode)
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
