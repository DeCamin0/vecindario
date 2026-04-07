import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { normalizeLoginSlugInput } from '../lib/login-slug.js'
import { communityPortalSelectOptions } from '../lib/portal-labels.js'
import { buildDwellingByPortalIndex } from '../lib/portal-dwelling-config.js'
import { communityOperationalWhere, isCommunityOperationalStatus } from '../lib/community-status.js'

/** Rutas públicas (sin JWT): validar código de acceso para vecinos. */
export const publicCommunitiesRouter = Router()

function parseCustomLocationsPublic(raw: unknown): { id: string; name: string }[] {
  if (!Array.isArray(raw)) return []
  const out: { id: string; name: string }[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id.trim() : ''
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    if (id && name) out.push({ id, name })
  }
  return out
}

/** Configuración de reservas / espacios (lo definido al crear o editar la comunidad en Super Admin). */
publicCommunitiesRouter.get('/community-config', async (req, res) => {
  const raw = typeof req.query.communityId === 'string' ? req.query.communityId.trim() : ''
  const id = parseInt(raw, 10)
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: 'Falta communityId numérico válido' })
    return
  }

  const row = await prisma.community.findFirst({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      gymAccessEnabled: true,
      padelCourtCount: true,
      padelMaxHoursPerBooking: true,
      padelMaxHoursPerApartmentPerDay: true,
      padelMinAdvanceHours: true,
      padelOpenTime: true,
      padelCloseTime: true,
      salonBookingMode: true,
      customLocations: true,
      appNavServicesEnabled: true,
      appNavIncidentsEnabled: true,
      appNavBookingsEnabled: true,
      appNavPoolAccessEnabled: true,
      portalCount: true,
      portalLabels: true,
      portalDwellingConfig: true,
    },
  })

  if (!row || !isCommunityOperationalStatus(row.status)) {
    res.status(404).json({ error: 'Comunidad no encontrada o inactiva' })
    return
  }

  res.json({
    id: row.id,
    name: row.name,
    gymAccessEnabled: row.gymAccessEnabled,
    padelCourtCount: row.padelCourtCount,
    padelMaxHoursPerBooking: row.padelMaxHoursPerBooking,
    padelMaxHoursPerApartmentPerDay: row.padelMaxHoursPerApartmentPerDay,
    padelMinAdvanceHours: row.padelMinAdvanceHours,
    padelOpenTime: row.padelOpenTime,
    padelCloseTime: row.padelCloseTime,
    salonBookingMode: row.salonBookingMode === 'day' ? 'day' : 'slots',
    customLocations: parseCustomLocationsPublic(row.customLocations),
    appNavServicesEnabled: row.appNavServicesEnabled,
    appNavIncidentsEnabled: row.appNavIncidentsEnabled,
    appNavBookingsEnabled: row.appNavBookingsEnabled,
    appNavPoolAccessEnabled: row.appNavPoolAccessEnabled === true,
    portalSelectOptions: communityPortalSelectOptions(row.portalCount, row.portalLabels),
    dwellingByPortalIndex: buildDwellingByPortalIndex(row.portalCount, row.portalDwellingConfig),
  })
})

publicCommunitiesRouter.get('/community-by-code', async (req, res) => {
  const raw = typeof req.query.code === 'string' ? req.query.code.trim() : ''
  if (!raw) {
    res.status(400).json({ error: 'Falta el parámetro code' })
    return
  }
  const code = raw.toUpperCase()

  const row = await prisma.community.findFirst({
    where: { accessCode: code },
    select: { id: true, name: true, status: true },
  })

  if (!row || !isCommunityOperationalStatus(row.status)) {
    res.status(404).json({ error: 'Código no válido o comunidad inactiva' })
    return
  }

  res.json({ id: row.id, name: row.name, status: row.status })
})

/** Resolución por slug de acceso: /c/{slug}/login — devuelve VEC para portal y login existentes. */
publicCommunitiesRouter.get('/community-by-slug', async (req, res) => {
  const raw = typeof req.query.slug === 'string' ? req.query.slug.trim() : ''
  const slug = normalizeLoginSlugInput(raw)
  if (!slug) {
    res.status(400).json({ error: 'Falta el parámetro slug' })
    return
  }

  const row = await prisma.community.findFirst({
    where: { loginSlug: slug, ...communityOperationalWhere() },
    select: { id: true, name: true, accessCode: true, loginSlug: true, status: true },
  })

  if (!row || !row.accessCode) {
    res.status(404).json({ error: 'Enlace no válido o comunidad inactiva' })
    return
  }

  res.json({
    id: row.id,
    name: row.name,
    loginSlug: row.loginSlug,
    accessCode: row.accessCode,
    status: row.status,
  })
})

/**
 * Lista de portales para desplegable (login / completar piso), si la comunidad los tiene definidos.
 * Mismo criterio que otras rutas públicas: communityId + código VEC deben coincidir.
 */
publicCommunitiesRouter.get('/community-portal-options', async (req, res) => {
  const rawId = typeof req.query.communityId === 'string' ? req.query.communityId.trim() : ''
  const id = parseInt(rawId, 10)
  const rawCode = typeof req.query.code === 'string' ? req.query.code.trim() : ''
  const code = rawCode ? rawCode.toUpperCase() : ''

  if (!Number.isFinite(id) || id < 1 || !code) {
    res.status(400).json({ error: 'communityId y code (VEC) son obligatorios' })
    return
  }

  const row = await prisma.community.findFirst({
    where: { id, accessCode: code, ...communityOperationalWhere() },
    select: { portalCount: true, portalLabels: true, portalDwellingConfig: true },
  })

  if (!row) {
    res.status(404).json({ error: 'Comunidad no encontrada o código no válido' })
    return
  }

  const portals = communityPortalSelectOptions(row.portalCount, row.portalLabels)
  res.json({
    portals,
    dwellingByPortalIndex: buildDwellingByPortalIndex(row.portalCount, row.portalDwellingConfig),
  })
})

/** Reservas confirmadas: mismo shape que GET /api/bookings; requiere communityId + accessCode (VEC). */
publicCommunitiesRouter.get('/community-bookings', async (req, res) => {
  const rawId = typeof req.query.communityId === 'string' ? req.query.communityId.trim() : ''
  const communityId = parseInt(rawId, 10)
  const rawCode = typeof req.query.accessCode === 'string' ? req.query.accessCode.trim() : ''
  const code = rawCode.toUpperCase()
  if (!Number.isFinite(communityId) || communityId < 1 || !code) {
    res.status(400).json({ error: 'communityId y accessCode son obligatorios' })
    return
  }

  const comm = await prisma.community.findFirst({
    where: { id: communityId, accessCode: code, ...communityOperationalWhere() },
    select: { id: true },
  })
  if (!comm) {
    res.status(403).json({ error: 'Código no válido para esta comunidad' })
    return
  }

  const rows = await prisma.communityBooking.findMany({
    where: { communityId, status: 'confirmed' },
    orderBy: [{ bookingDate: 'desc' }, { startMinute: 'desc' }, { id: 'desc' }],
    take: 200,
  })

  res.json(
    rows.map((r) => ({
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
      createdAt: r.createdAt.toISOString(),
    })),
  )
})
