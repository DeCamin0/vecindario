import type { Community, VecindarioUser } from '@prisma/client'
import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { normEmail, userLinkedToCommunity } from '../lib/community-user-access.js'
import { signAccessToken } from '../lib/jwt.js'
import { generateUniqueAccessCode } from '../lib/access-code.js'
import {
  parseInstructionEmail,
  parseOptionalInstructionEmail,
} from '../lib/instruction-email.js'
import { parseLoginSlugField } from '../lib/login-slug.js'
import {
  normalizePortalLabelsFromDb,
  parsePortalLabels,
} from '../lib/portal-labels.js'
import {
  estimateDwellingUnitsFromPortalConfig,
  parsePortalDwellingConfig,
  resizePortalDwellingConfig,
} from '../lib/portal-dwelling-config.js'
import { getCommunityDashboardStatsMap } from '../lib/community-dashboard-stats.js'
import { parseCustomLocations } from '../lib/custom-locations.js'
import { parseBoardVocals } from '../lib/community-board-junta.js'
import {
  padelHHMMToMinutes,
  parseBool,
  parseBoardViceUnit,
  parseCommunityAddress,
  parseNifCif,
  parsePadelCourtCount,
  parsePadelHoursField,
  parsePadelMinAdvanceHours,
  parsePadelWallClock,
  parsePlanExpiresOn,
  parsePortalCount,
  parsePresidentUnit,
  parseResidentSlots,
  parseSalonBookingMode,
} from '../lib/community-create-parsers.js'

export const companyCommunitiesRouter = Router()

companyCommunitiesRouter.get('/', async (req, res) => {
  const companyId = req.companyAdminCompanyId!
  const items = await prisma.community.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  })
  const raw = typeof req.query.includeStats === 'string' ? req.query.includeStats.trim() : ''
  const includeStats = raw === '1' || raw.toLowerCase() === 'true'
  if (!includeStats) {
    res.json(items)
    return
  }
  const statsMap = await getCommunityDashboardStatsMap(items.map((c) => c.id))
  const empty = {
    totalIncidents: 0,
    pendingIncidents: 0,
    resolvedIncidents: 0,
    bookingsToday: 0,
    pendingActions: 0,
    neighborAccountsCount: 0,
    estimatedDwellingCapacity: null as number | null,
  }
  res.json(
    items.map((c) => {
      const base = statsMap.get(c.id) ?? { ...empty }
      return {
        ...c,
        dashboardStats: {
          ...base,
          estimatedDwellingCapacity: estimateDwellingUnitsFromPortalConfig(
            c.portalDwellingConfig,
            c.portalCount,
          ),
        },
      }
    }),
  )
})

companyCommunitiesRouter.post('/', async (req, res) => {
  const companyId = req.companyAdminCompanyId!
  const body = req.body as Record<string, unknown>

  const nameRaw = typeof body?.name === 'string' ? body.name.trim().slice(0, 255) : ''
  const name = nameRaw || 'Sin nombre'

  const nifParsed = parseNifCif(body?.nifCif)
  if (nifParsed.tooLong) {
    res.status(400).json({ error: 'El NIF/CIF no puede superar 32 caracteres.' })
    return
  }
  const addressParsed = parseCommunityAddress(body?.address)
  if (addressParsed.tooLong) {
    res.status(400).json({ error: 'La dirección no puede superar 512 caracteres.' })
    return
  }

  let accessCode: string | null =
    typeof body?.accessCode === 'string' ? body.accessCode.trim() || null : null
  if (!accessCode) {
    accessCode = await generateUniqueAccessCode()
  } else {
    const dup = await prisma.community.findFirst({
      where: { accessCode },
      select: { id: true },
    })
    if (dup) {
      res.status(400).json({ error: 'Ese código de acceso ya está en uso' })
      return
    }
  }

  const contactEmail = parseInstructionEmail(body?.contactEmail)
  if (!contactEmail) {
    res.status(400).json({
      error:
        'El email de contacto de la comunidad es obligatorio y debe ser válido.',
    })
    return
  }

  const slugParsed = parseLoginSlugField(body?.loginSlug)
  if (!slugParsed.ok) {
    res.status(400).json({ error: slugParsed.error })
    return
  }
  if (slugParsed.value) {
    const slugTaken = await prisma.community.findFirst({
      where: { loginSlug: slugParsed.value },
      select: { id: true },
    })
    if (slugTaken) {
      res.status(400).json({ error: 'Ese slug ya está en uso en otra comunidad.' })
      return
    }
  }

  const pres = parseOptionalInstructionEmail(body?.presidentEmail)
  if (pres.invalidFormat) {
    res.status(400).json({ error: 'El email del presidente no tiene un formato válido.' })
    return
  }
  const adm = parseOptionalInstructionEmail(body?.communityAdminEmail)
  if (adm.invalidFormat) {
    res.status(400).json({
      error: 'El email del administrador de comunidad no tiene un formato válido.',
    })
    return
  }
  const con = parseOptionalInstructionEmail(body?.conciergeEmail)
  if (con.invalidFormat) {
    res.status(400).json({ error: 'El email del conserje no tiene un formato válido.' })
    return
  }
  const poolSt = parseOptionalInstructionEmail(body?.poolStaffEmail)
  if (poolSt.invalidFormat) {
    res.status(400).json({ error: 'El email del socorrista no tiene un formato válido.' })
    return
  }

  const presUnit = parsePresidentUnit(body?.presidentPortal, body?.presidentPiso)
  if (!presUnit.ok) {
    res.status(400).json({ error: presUnit.error })
    return
  }

  const viceUnit = parseBoardViceUnit(body?.boardVicePortal, body?.boardVicePiso)
  if (!viceUnit.ok) {
    res.status(400).json({ error: viceUnit.error })
    return
  }

  const planP = parsePlanExpiresOn(body?.planExpiresOn)
  if (!planP.ok) {
    res.status(400).json({ error: planP.error })
    return
  }

  const portalCount = parsePortalCount(body?.portalCount)
  const portalLabels = Object.prototype.hasOwnProperty.call(body ?? {}, 'portalLabels')
    ? parsePortalLabels(body.portalLabels, portalCount)
    : parsePortalLabels([], portalCount)

  const portalDwellingConfig = Object.prototype.hasOwnProperty.call(body ?? {}, 'portalDwellingConfig')
    ? parsePortalDwellingConfig(body.portalDwellingConfig, portalCount)
    : parsePortalDwellingConfig([], portalCount)

  const residentSlots = parseResidentSlots(body?.residentSlots)
  const gymAccessEnabled = parseBool(body?.gymAccessEnabled, false)
  const appNavServicesEnabled = parseBool(body?.appNavServicesEnabled, true)
  const appNavIncidentsEnabled = parseBool(body?.appNavIncidentsEnabled, true)
  const appNavBookingsEnabled = parseBool(body?.appNavBookingsEnabled, true)
  const appNavPoolAccessEnabled = parseBool(body?.appNavPoolAccessEnabled, false)
  const padelCourtCount = parsePadelCourtCount(body?.padelCourtCount)
  const customLocations = parseCustomLocations(body?.customLocations)
  let padelMaxHoursPerBooking = parsePadelHoursField(body?.padelMaxHoursPerBooking, 2)
  let padelMaxHoursPerApartmentPerDay = parsePadelHoursField(body?.padelMaxHoursPerApartmentPerDay, 4)
  if (padelMaxHoursPerApartmentPerDay < padelMaxHoursPerBooking) {
    padelMaxHoursPerApartmentPerDay = padelMaxHoursPerBooking
  }
  const padelMinAdvanceHours = parsePadelMinAdvanceHours(body?.padelMinAdvanceHours, 24)
  const salonBookingMode = parseSalonBookingMode(body?.salonBookingMode, 'slots')
  let padelOpenTime = parsePadelWallClock(body?.padelOpenTime, '08:00')
  let padelCloseTime = parsePadelWallClock(body?.padelCloseTime, '22:00')
  const openM = padelHHMMToMinutes(padelOpenTime)
  const closeM = padelHHMMToMinutes(padelCloseTime)
  if (openM !== null && closeM !== null && openM >= closeM) {
    res.status(400).json({
      error: 'La hora de apertura de pádel debe ser anterior a la de cierre (mismo día).',
    })
    return
  }

  const boardVocalsJson = Object.prototype.hasOwnProperty.call(body ?? {}, 'boardVocalsJson')
    ? parseBoardVocals(body.boardVocalsJson)
    : undefined

  const row = await prisma.community.create({
    data: {
      name,
      nifCif: nifParsed.value ?? null,
      address: addressParsed.value,
      accessCode,
      loginSlug: slugParsed.value,
      contactEmail,
      presidentEmail: pres.value,
      presidentPortal: presUnit.presidentPortal,
      presidentPiso: presUnit.presidentPiso,
      boardVicePortal: viceUnit.boardVicePortal,
      boardVicePiso: viceUnit.boardVicePiso,
      ...(boardVocalsJson !== undefined ? { boardVocalsJson } : {}),
      communityAdminEmail: adm.value,
      conciergeEmail: con.value,
      poolStaffEmail: poolSt.value,
      status: 'pending_approval',
      companyId,
      planExpiresOn: planP.value,
      portalCount,
      portalLabels,
      portalDwellingConfig,
      residentSlots,
      gymAccessEnabled,
      appNavServicesEnabled,
      appNavIncidentsEnabled,
      appNavBookingsEnabled,
      appNavPoolAccessEnabled,
      padelCourtCount,
      padelMaxHoursPerBooking,
      padelMaxHoursPerApartmentPerDay,
      padelMinAdvanceHours,
      padelOpenTime,
      padelCloseTime,
      salonBookingMode,
      customLocations,
    },
  })

  res.status(201).json(row)
})

companyCommunitiesRouter.patch('/:id', async (req, res) => {
  const companyId = req.companyAdminCompanyId!
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }

  const existing = await prisma.community.findFirst({
    where: { id, companyId },
  })
  if (!existing) {
    res.status(404).json({ error: 'Comunidad no encontrada' })
    return
  }

  const data: Record<string, unknown> = {}

  if (typeof req.body?.name === 'string') {
    const t = req.body.name.trim().slice(0, 255)
    if (t) data.name = t
  }
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'nifCif')) {
    const nifParsed = parseNifCif(req.body?.nifCif)
    if (nifParsed.tooLong) {
      res.status(400).json({ error: 'El NIF/CIF no puede superar 32 caracteres.' })
      return
    }
    data.nifCif = nifParsed.value ?? null
  }
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'address')) {
    const addressParsed = parseCommunityAddress(req.body?.address)
    if (addressParsed.tooLong) {
      res.status(400).json({ error: 'La dirección no puede superar 512 caracteres.' })
      return
    }
    data.address = addressParsed.value
  }
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'contactEmail')) {
    const contactEmail = parseInstructionEmail(req.body?.contactEmail)
    if (!contactEmail) {
      res.status(400).json({ error: 'Email de contacto obligatorio y válido.' })
      return
    }
    data.contactEmail = contactEmail
  }
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'presidentEmail')) {
    const pres = parseOptionalInstructionEmail(req.body?.presidentEmail)
    if (pres.invalidFormat) {
      res.status(400).json({ error: 'El email del presidente no tiene un formato válido.' })
      return
    }
    data.presidentEmail = pres.value
  }
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'communityAdminEmail')) {
    const adm = parseOptionalInstructionEmail(req.body?.communityAdminEmail)
    if (adm.invalidFormat) {
      res.status(400).json({
        error: 'El email del administrador de comunidad no tiene un formato válido.',
      })
      return
    }
    data.communityAdminEmail = adm.value
  }
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'conciergeEmail')) {
    const con = parseOptionalInstructionEmail(req.body?.conciergeEmail)
    if (con.invalidFormat) {
      res.status(400).json({ error: 'El email del conserje no tiene un formato válido.' })
      return
    }
    data.conciergeEmail = con.value
  }
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'poolStaffEmail')) {
    const poolSt = parseOptionalInstructionEmail(req.body?.poolStaffEmail)
    if (poolSt.invalidFormat) {
      res.status(400).json({ error: 'El email del socorrista no tiene un formato válido.' })
      return
    }
    data.poolStaffEmail = poolSt.value
  }
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'loginSlug')) {
    const slugParsed = parseLoginSlugField(req.body?.loginSlug)
    if (!slugParsed.ok) {
      res.status(400).json({ error: slugParsed.error })
      return
    }
    if (slugParsed.value) {
      const slugTaken = await prisma.community.findFirst({
        where: { loginSlug: slugParsed.value, NOT: { id } },
        select: { id: true },
      })
      if (slugTaken) {
        res.status(400).json({ error: 'Ese slug ya está en uso en otra comunidad.' })
        return
      }
    }
    data.loginSlug = slugParsed.value
  }
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'portalCount')) {
    const portalCount = parsePortalCount(req.body?.portalCount)
    data.portalCount = portalCount
    const labelsRaw = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'portalLabels')
      ? (req.body as Record<string, unknown>).portalLabels
      : normalizePortalLabelsFromDb(existing.portalLabels, portalCount)
    data.portalLabels = parsePortalLabels(labelsRaw, portalCount)
    data.portalDwellingConfig = resizePortalDwellingConfig(
      existing.portalDwellingConfig,
      existing.portalCount,
      portalCount,
    )
  } else if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'portalLabels')) {
    const portalCount = existing.portalCount
    data.portalLabels = parsePortalLabels(
      (req.body as Record<string, unknown>).portalLabels,
      portalCount,
    )
  }

  const touchedPortals =
    Object.prototype.hasOwnProperty.call(req.body ?? {}, 'portalCount') ||
    Object.prototype.hasOwnProperty.call(req.body ?? {}, 'portalLabels')
  if (touchedPortals) {
    const nextCount =
      typeof data.portalCount === 'number' ? data.portalCount : existing.portalCount
    const nextDwelling =
      data.portalDwellingConfig !== undefined
        ? data.portalDwellingConfig
        : existing.portalDwellingConfig
    const est = estimateDwellingUnitsFromPortalConfig(nextDwelling, nextCount)
    if (est != null) {
      data.residentSlots = est
    }
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'Nada que actualizar' })
    return
  }

  const row = await prisma.community.update({
    where: { id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: data as any,
  })
  res.json(row)
})

const STAFF_MANAGEMENT_SLOTS: ReadonlyArray<{
  emailField: keyof Pick<Community, 'communityAdminEmail' | 'presidentEmail' | 'conciergeEmail'>
  role: 'community_admin' | 'president' | 'concierge'
}> = [
  { emailField: 'communityAdminEmail', role: 'community_admin' },
  { emailField: 'presidentEmail', role: 'president' },
  { emailField: 'conciergeEmail', role: 'concierge' },
]

async function pickStaffUserForCommunityManagement(
  community: Community,
): Promise<VecindarioUser | null> {
  for (const { emailField, role } of STAFF_MANAGEMENT_SLOTS) {
    const raw = community[emailField]
    if (typeof raw !== 'string') continue
    const t = raw.trim()
    if (!t) continue
    const needle = normEmail(t)
    if (!needle) continue

    const emailsTry = [...new Set([t, needle])]
    let user = await prisma.vecindarioUser.findFirst({
      where: { role, email: { in: emailsTry } },
    })
    if (!user) {
      const more = await prisma.vecindarioUser.findMany({ where: { role } })
      user = more.find((u) => normEmail(u.email) === needle) ?? null
    }
    if (!user) continue
    if (await userLinkedToCommunity(user, community)) return user
  }
  return null
}

/**
 * JWT del primer usuario de gestión vinculado a la ficha (admin comunidad → presidente → conserje).
 * Solo administradores de empresa de la misma compañía que la comunidad.
 */
companyCommunitiesRouter.post('/:id/staff-session', async (req, res) => {
  const companyId = req.companyAdminCompanyId!
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }

  const community = await prisma.community.findFirst({
    where: { id, companyId },
  })
  if (!community) {
    res.status(404).json({ error: 'Comunidad no encontrada' })
    return
  }

  if (community.status === 'pending_approval') {
    res.status(403).json({
      error: 'Comunidad pendiente',
      message:
        'La comunidad aún no está activa. Cuando un super administrador la apruebe podrás abrir el panel de gestión.',
    })
    return
  }
  if (community.status === 'inactive') {
    res.status(403).json({
      error: 'Comunidad inactiva',
      message: 'Esta comunidad está inactiva; no se puede abrir el panel de gestión.',
    })
    return
  }

  const target = await pickStaffUserForCommunityManagement(community)
  if (!target) {
    res.status(404).json({
      error: 'Sin cuenta de gestión',
      message:
        'No hay una cuenta de usuario vinculada como administrador de comunidad, presidente o conserje en la ficha. El super administrador debe dar de alta esos correos con el rol correspondiente en esta comunidad.',
    })
    return
  }

  const accessToken = signAccessToken({
    sub: String(target.id),
    email: target.email || '',
    role: target.role,
    companyId: target.companyAdminCompanyId,
  })

  const p = target.piso?.trim()
  const po = target.portal?.trim()
  const pt = target.puerta?.trim()
  const em = target.email?.trim()
  res.json({
    accessToken,
    user: {
      id: target.id,
      ...(em ? { email: em } : {}),
      name: target.name?.trim() || (em ? em.split('@')[0] : 'Usuario'),
      role: target.role,
      ...(p ? { piso: p } : {}),
      ...(po ? { portal: po } : {}),
      ...(pt ? { puerta: pt } : {}),
    },
    community: {
      id: community.id,
      name: community.name,
      accessCode: community.accessCode,
    },
  })
})
