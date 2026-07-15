import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { Prisma } from '@prisma/client'
import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma.js'
import { generateUniqueAccessCode } from '../lib/access-code.js'
import { parseCustomLocations } from '../lib/custom-locations.js'
import {
  normalizePortalLabelsFromDb,
  parsePortalLabels,
} from '../lib/portal-labels.js'
import {
  estimateDwellingUnitsFromPortalConfig,
  parsePortalDwellingConfig,
  resizePortalDwellingConfig,
} from '../lib/portal-dwelling-config.js'
import {
  parseInstructionEmail,
  parseOptionalInstructionEmail,
} from '../lib/instruction-email.js'
import {
  runCommunityOnboarding,
  sendCommunityOnboardingEmails,
} from '../lib/community-onboarding.js'
import {
  demoteOrphanedStaffAfterEmailChange,
  type DemotedStaffEntry,
} from '../lib/community-staff-email-sync.js'
import {
  normalizeConciergeEmailsForDb,
  parseConciergeEmailsFromBody,
  parseConciergeEntries,
  parseConciergeSubstituteEntries,
  conciergeFichaActiveForEmail,
  setConciergeFichaActiveForEmail,
  isConciergeEntryActive,
  conciergeFichaSignature,
  conciergeEmailPrismaSelect,
  parseOptionalStaffLabel,
} from '../lib/concierge-emails.js'
import { parseLoginSlugField } from '../lib/login-slug.js'
import { signAccessToken } from '../lib/jwt.js'
import {
  normEmail,
  staffRoleMatchesSlot,
  userLinkedToCommunity,
} from '../lib/community-user-access.js'
import { resolveStaffUserIdsForCommunity } from '../lib/admin-community-staff-ids.js'
import {
  bulkDeleteResidentAccountsForCommunity,
  collectBulkDeletableResidentUserIds,
} from '../lib/admin-bulk-delete-residents.js'
import { deleteCommunityUserAccount } from '../lib/admin-delete-community-user.js'
import { capturePasswordPlainSnapshot } from '../lib/password-plain-snapshot.js'
import { communityOperationalWhere } from '../lib/community-status.js'
import { getCommunityDashboardStatsMap } from '../lib/community-dashboard-stats.js'
import { getAdminOperationalAggregates } from '../lib/admin-operational-stats.js'
import {
  padelHHMMToMinutes,
  parseBool,
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
import { parseServiceRequestCategoryModesBody } from '../lib/service-request-category-modes.js'
import {
  communityListWhereForAccess,
  isFullSuperAdminAccess,
  loadCommunityForAdminAccess,
  parseOptionalCompanyLinkId,
  validateCompanyKindForLink,
} from '../lib/admin-community-access.js'

const ALLOWED_STATUS = new Set(['active', 'inactive', 'demo', 'pending_approval'])

async function findCommunityForAdminRequest(
  req: import('express').Request,
  id: number,
) {
  const access = req.adminCommunityAccess ?? { mode: 'full' as const }
  return loadCommunityForAdminAccess(access, id)
}

export const adminCommunitiesRouter = Router()

adminCommunitiesRouter.get('/', async (req, res) => {
  const access = req.adminCommunityAccess ?? { mode: 'full' as const }
  const scopeWhere = communityListWhereForAccess(access)
  const items = await prisma.community.findMany({
    where: scopeWhere,
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

/** Código VEC propuesto para alta nueva (único en BD). El cliente puede editarlo o borrarlo antes de guardar. */
adminCommunitiesRouter.get('/suggest-access-code', async (_req, res) => {
  try {
    const accessCode = await generateUniqueAccessCode()
    res.json({ accessCode })
  } catch (e) {
    console.error('[suggest-access-code]', e)
    res.status(500).json({
      error: e instanceof Error ? e.message : 'No se pudo generar un código de acceso',
    })
  }
})

/** Empresas para selectores de ficha (administración / servicios). */
adminCommunitiesRouter.get('/company-options', async (req, res) => {
  const access = req.adminCommunityAccess ?? { mode: 'full' as const }
  const all = await prisma.company.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, kind: true },
  })
  if (isFullSuperAdminAccess(access)) {
    res.json({
      administration: all.filter((c) => c.kind === 'administracion'),
      service: all.filter((c) => c.kind === 'prestacion_servicios'),
    })
    return
  }
  res.json({
    administration: all.filter((c) => c.kind === 'administracion'),
    service:
      access.mode === 'service_provider'
        ? all.filter((c) => c.id === access.companyId)
        : all.filter((c) => c.kind === 'prestacion_servicios'),
  })
})

/** KPIs globales solo en comunidades operativas (active + demo). */
adminCommunitiesRouter.get('/stats-aggregate', async (req, res) => {
  try {
    const access = req.adminCommunityAccess ?? { mode: 'full' as const }
    const scopeWhere = communityListWhereForAccess(access)
    let communityIds: number[] | undefined
    if (scopeWhere) {
      const scoped = await prisma.community.findMany({
        where: scopeWhere,
        select: { id: true },
      })
      communityIds = scoped.map((c) => c.id)
    }
    const aggregates = await getAdminOperationalAggregates(communityIds)
    res.json(aggregates)
  } catch (e) {
    console.error('[stats-aggregate]', e)
    res.status(500).json({
      error: e instanceof Error ? e.message : 'No se pudieron calcular las estadísticas',
    })
  }
})

adminCommunitiesRouter.post('/', async (req, res) => {
  const nameRaw = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 255) : ''
  const name = nameRaw || 'Sin nombre'

  const nifParsed = parseNifCif(req.body?.nifCif)
  if (nifParsed.tooLong) {
    res.status(400).json({ error: 'El NIF/CIF no puede superar 32 caracteres.' })
    return
  }
  const addressParsed = parseCommunityAddress(req.body?.address)
  if (addressParsed.tooLong) {
    res.status(400).json({ error: 'La dirección no puede superar 512 caracteres.' })
    return
  }

  let accessCode: string | null =
    typeof req.body?.accessCode === 'string' ? req.body.accessCode.trim() || null : null
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

  const contactEmail = parseInstructionEmail(req.body?.contactEmail)
  if (!contactEmail) {
    res.status(400).json({
      error:
        'El email de contacto de la comunidad es obligatorio y debe ser válido (avisos a vecinos y comunicación general).',
    })
    return
  }
  const pres = parseOptionalInstructionEmail(req.body?.presidentEmail)
  if (pres.invalidFormat) {
    res.status(400).json({ error: 'El email del presidente no tiene un formato válido.' })
    return
  }
  const adm = parseOptionalInstructionEmail(req.body?.communityAdminEmail)
  if (adm.invalidFormat) {
    res.status(400).json({
      error: 'El email del administrador de comunidad no tiene un formato válido.',
    })
    return
  }
  const poolSt = parseOptionalInstructionEmail(req.body?.poolStaffEmail)
  if (poolSt.invalidFormat) {
    res.status(400).json({ error: 'El email del socorrista no tiene un formato válido.' })
    return
  }
  const conciergeBody = parseConciergeEmailsFromBody({
    ...(Array.isArray(req.body?.conciergeStaff)
      ? { conciergeStaff: req.body.conciergeStaff }
      : Array.isArray(req.body?.conciergeEmails)
        ? { conciergeEmails: req.body.conciergeEmails }
        : typeof req.body?.conciergeEmail === 'string' && req.body.conciergeEmail.trim()
          ? { conciergeEmails: [req.body.conciergeEmail] }
          : { conciergeEmails: [] }),
    ...(Array.isArray(req.body?.conciergeSubstitutes)
      ? { conciergeSubstitutes: req.body.conciergeSubstitutes }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(req.body ?? {}, 'conciergeSubstituteEmail')
      ? { conciergeSubstituteEmail: req.body.conciergeSubstituteEmail }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(req.body ?? {}, 'conciergeSubstituteName')
      ? { conciergeSubstituteName: req.body.conciergeSubstituteName }
      : {}),
  })
  if (!conciergeBody.ok) {
    res.status(400).json({ error: conciergeBody.error })
    return
  }
  const conciergeNorm = normalizeConciergeEmailsForDb(
    conciergeBody.staff,
    conciergeBody.substitutes,
  )
  const presidentEmail = pres.value
  let communityAdminEmail = adm.value
  let communityAdminName = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'communityAdminName')
    ? parseOptionalStaffLabel(req.body.communityAdminName)
    : null
  const poolStaffEmail = poolSt.value

  const presUnit = parsePresidentUnit(req.body?.presidentPortal, req.body?.presidentPiso)
  if (!presUnit.ok) {
    res.status(400).json({ error: presUnit.error })
    return
  }

  const slugParsed = parseLoginSlugField(req.body?.loginSlug)
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

  const status =
    typeof req.body?.status === 'string' && ALLOWED_STATUS.has(req.body.status)
      ? req.body.status
      : 'active'

  let companyId: number | null = null
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'companyId')) {
    const parsed = await parseOptionalCompanyLinkId((req.body as Record<string, unknown>).companyId)
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error })
      return
    }
    companyId = parsed.value
    if (companyId != null) {
      const kindOk = await validateCompanyKindForLink(companyId, 'administracion')
      if (!kindOk.ok) {
        res.status(400).json({ error: kindOk.error })
        return
      }
    }
  }

  const access = req.adminCommunityAccess ?? { mode: 'full' as const }
  let serviceProviderCompanyId: number | null = null
  if (access.mode === 'service_provider') {
    serviceProviderCompanyId = access.companyId
  } else if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'serviceProviderCompanyId')) {
    const parsed = await parseOptionalCompanyLinkId(
      (req.body as Record<string, unknown>).serviceProviderCompanyId,
    )
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error })
      return
    }
    serviceProviderCompanyId = parsed.value
    if (serviceProviderCompanyId != null) {
      const kindOk = await validateCompanyKindForLink(
        serviceProviderCompanyId,
        'prestacion_servicios',
      )
      if (!kindOk.ok) {
        res.status(400).json({ error: kindOk.error })
        return
      }
    }
  }

  if (
    companyId != null &&
    serviceProviderCompanyId != null &&
    companyId === serviceProviderCompanyId
  ) {
    res.status(400).json({
      error: 'La empresa de administración y la de servicios deben ser distintas.',
    })
    return
  }

  if (companyId != null) {
    communityAdminEmail = null
    communityAdminName = null
  }

  let planExpiresOn: Date | null = null
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'planExpiresOn')) {
    const p = parsePlanExpiresOn((req.body as Record<string, unknown>).planExpiresOn)
    if (!p.ok) {
      res.status(400).json({ error: p.error })
      return
    }
    planExpiresOn = p.value
  }

  const portalCount = parsePortalCount(req.body?.portalCount)
  const portalLabels = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'portalLabels')
    ? parsePortalLabels((req.body as Record<string, unknown>).portalLabels, portalCount)
    : parsePortalLabels([], portalCount)
  const residentSlots = parseResidentSlots(req.body?.residentSlots)
  const gymAccessEnabled = parseBool(req.body?.gymAccessEnabled, false)
  const poolAccessSystemEnabled = parseBool(req.body?.poolAccessSystemEnabled, false)
  const poolSeasonActive = parseBool(req.body?.poolSeasonActive, false)
  const poolHoursNoteRaw =
    typeof req.body?.poolHoursNote === 'string' ? req.body.poolHoursNote.trim().slice(0, 255) : ''
  const poolHoursNote = poolHoursNoteRaw || null
  let poolMaxOccupancy: number | null = null
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'poolMaxOccupancy')) {
    const raw = (req.body as Record<string, unknown>).poolMaxOccupancy
    if (raw !== null && raw !== '' && raw !== undefined) {
      const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
      if (!Number.isInteger(n) || n < 1 || n > 5000) {
        res.status(400).json({ error: 'Aforo piscina (poolMaxOccupancy): entero entre 1 y 5000 o vacío.' })
        return
      }
      poolMaxOccupancy = n
    }
  }
  let poolSeasonStart: Date | null = null
  let poolSeasonEnd: Date | null = null
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'poolSeasonStart')) {
    const p = parsePlanExpiresOn((req.body as Record<string, unknown>).poolSeasonStart)
    if (!p.ok) {
      res.status(400).json({ error: p.error })
      return
    }
    poolSeasonStart = p.value
  }
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'poolSeasonEnd')) {
    const p = parsePlanExpiresOn((req.body as Record<string, unknown>).poolSeasonEnd)
    if (!p.ok) {
      res.status(400).json({ error: p.error })
      return
    }
    poolSeasonEnd = p.value
  }
  const appNavServicesEnabled = parseBool(req.body?.appNavServicesEnabled, true)
  const appNavIncidentsEnabled = parseBool(req.body?.appNavIncidentsEnabled, true)
  const appNavBookingsEnabled = parseBool(req.body?.appNavBookingsEnabled, true)
  const appNavPoolAccessEnabled = parseBool(req.body?.appNavPoolAccessEnabled, false)
  const appNavPaqueteriaEnabled = parseBool(req.body?.appNavPaqueteriaEnabled, false)
  const paqueteriaSpecialDeliveryEnabled =
    appNavPaqueteriaEnabled && parseBool(req.body?.paqueteriaSpecialDeliveryEnabled, false)
  const paqueteriaKeyLoansEnabled =
    appNavPaqueteriaEnabled && parseBool(req.body?.paqueteriaKeyLoansEnabled, false)
  const appNavCuadernoDiarioEnabled = parseBool(req.body?.appNavCuadernoDiarioEnabled, false)
  let serviceRequestCategoryModesJson: Prisma.InputJsonValue = {}
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'serviceRequestCategoryModes')) {
    const pm = parseServiceRequestCategoryModesBody(
      (req.body as Record<string, unknown>).serviceRequestCategoryModes,
    )
    if (!pm.ok) {
      res.status(400).json({ error: pm.error })
      return
    }
    serviceRequestCategoryModesJson = pm.value
  }
  const padelCourtCount = parsePadelCourtCount(req.body?.padelCourtCount)
  const customLocations = parseCustomLocations(req.body?.customLocations)
  const padelMaxHoursPerBooking = parsePadelHoursField(req.body?.padelMaxHoursPerBooking, 2)
  let padelMaxHoursPerApartmentPerDay = parsePadelHoursField(
    req.body?.padelMaxHoursPerApartmentPerDay,
    4,
  )
  if (padelMaxHoursPerApartmentPerDay < padelMaxHoursPerBooking) {
    padelMaxHoursPerApartmentPerDay = padelMaxHoursPerBooking
  }

  const padelMinAdvanceHours = parsePadelMinAdvanceHours(req.body?.padelMinAdvanceHours, 24)
  const salonBookingMode = parseSalonBookingMode(req.body?.salonBookingMode, 'slots')
  const padelOpenTime = parsePadelWallClock(req.body?.padelOpenTime, '08:00')
  const padelCloseTime = parsePadelWallClock(req.body?.padelCloseTime, '22:00')
  const openM = padelHHMMToMinutes(padelOpenTime)
  const closeM = padelHHMMToMinutes(padelCloseTime)
  if (openM !== null && closeM !== null && openM >= closeM) {
    res.status(400).json({
      error: 'La hora de apertura de pádel debe ser anterior a la de cierre (mismo día).',
    })
    return
  }

  const row = await prisma.community.create({
    data: {
      name,
      nifCif: nifParsed.value ?? null,
      address: addressParsed.value,
      accessCode,
      loginSlug: slugParsed.value,
      contactEmail,
      presidentEmail,
      presidentPortal: presUnit.presidentPortal,
      presidentPiso: presUnit.presidentPiso,
      communityAdminEmail,
      communityAdminName,
      conciergeEmail: conciergeNorm.conciergeEmail,
      conciergeEmail2: conciergeNorm.conciergeEmail2,
      conciergeEmailsJson: conciergeNorm.conciergeEmailsJson,
      conciergeSubstitutesJson: conciergeNorm.conciergeSubstitutesJson,
      conciergeSubstituteEmail: conciergeNorm.conciergeSubstituteEmail,
      conciergeSubstituteName: conciergeNorm.conciergeSubstituteName,
      poolStaffEmail,
      status,
      planExpiresOn,
      portalCount,
      portalLabels,
      portalDwellingConfig: parsePortalDwellingConfig([], portalCount),
      residentSlots,
      gymAccessEnabled,
      poolAccessSystemEnabled,
      poolSeasonActive,
      poolSeasonStart,
      poolSeasonEnd,
      poolHoursNote,
      poolMaxOccupancy,
      appNavServicesEnabled,
      appNavIncidentsEnabled,
      appNavBookingsEnabled,
      appNavPoolAccessEnabled,
      appNavPaqueteriaEnabled,
      paqueteriaSpecialDeliveryEnabled,
      paqueteriaKeyLoansEnabled,
      appNavCuadernoDiarioEnabled,
      serviceRequestCategoryModesJson,
      padelCourtCount,
      padelMaxHoursPerBooking,
      padelMaxHoursPerApartmentPerDay,
      padelMinAdvanceHours,
      padelOpenTime,
      padelCloseTime,
      salonBookingMode,
      customLocations,
      companyId,
      serviceProviderCompanyId,
    },
  })

  let onboarding
  try {
    onboarding = await runCommunityOnboarding(row, {
      sendEmails: false,
      sendContactSummary: false,
    })
  } catch (e) {
    console.error('[community onboarding]', e)
    onboarding = {
      mailConfigured: false,
      invitations: [],
      contactSummarySent: false,
      errors: [e instanceof Error ? e.message : String(e)],
    }
  }

  res.status(201).json({ ...row, onboarding })
})

/** Envío manual de correos de alta (presidente / admin / conserje / socorrista / resumen contacto). */
adminCommunitiesRouter.post('/:id/send-onboarding-mails', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }

  const invitePresident = parseBool(req.body?.invitePresident, false)
  const inviteAdmin = parseBool(req.body?.inviteAdmin, false)
  const inviteConcierge = parseBool(req.body?.inviteConcierge, false)
  const invitePoolStaff = parseBool(req.body?.invitePoolStaff, false)
  const contactSummary = parseBool(req.body?.contactSummary, false)

  if (
    !invitePresident &&
    !inviteAdmin &&
    !inviteConcierge &&
    !invitePoolStaff &&
    !contactSummary
  ) {
    res.status(400).json({
      error:
        'Marca al menos un destinatario: presidente, administrador, conserje, socorrista o resumen al email de contacto.',
    })
    return
  }

  const community = await findCommunityForAdminRequest(req, id)
  if (!community) {
    res.status(404).json({ error: 'Comunidad no encontrada' })
    return
  }

  try {
    const result = await sendCommunityOnboardingEmails(community, {
      invitePresident,
      inviteAdmin,
      inviteConcierge,
      invitePoolStaff,
      contactSummary,
    })
    res.json(result)
  } catch (e) {
    console.error('[send-onboarding-mails]', e)
    res.status(500).json({
      error: e instanceof Error ? e.message : 'Error al enviar correos',
    })
  }
})

function generateTemporaryPasswordPlain(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(16)
  let s = ''
  for (let i = 0; i < 14; i += 1) {
    s += alphabet[bytes[i] % alphabet.length]
  }
  return s
}

/** Contexto mínimo para pantalla super admin «Alta de vecinos» (entrega de comunidad). */
adminCommunitiesRouter.get('/:id/alta-vecinos-context', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }

  const community = await findCommunityForAdminRequest(req, id)
  if (!community) {
    res.status(404).json({ error: 'Comunidad no encontrada' })
    return
  }

  const operational = await prisma.community.findFirst({
    where: { id, ...communityOperationalWhere() },
    select: { id: true, name: true, accessCode: true },
  })
  if (!operational) {
    res.status(404).json({ error: 'Comunidad no encontrada o no operativa' })
    return
  }

  res.json({
    id: operational.id,
    name: operational.name,
    accessCode: (operational.accessCode ?? '').trim(),
  })
})

/** Usuarios vinculados a la comunidad (correos de ficha + vecinos por community_id y/o reservas). */
adminCommunitiesRouter.get('/:id/users', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }

  const community = await findCommunityForAdminRequest(req, id)
  if (!community) {
    res.status(404).json({ error: 'Comunidad no encontrada' })
    return
  }

  type SlotDef = {
    label: string
    slot: 'president' | 'community_admin' | 'pool_staff' | 'contact'
  }
  const slotDefs: SlotDef[] = [
    { label: 'Presidente', slot: 'president' },
    { label: 'Administrador', slot: 'community_admin' },
    { label: 'Socorrista (piscina)', slot: 'pool_staff' },
    { label: 'Contacto comunidad', slot: 'contact' },
  ]

  const emailFields: Record<
    'president' | 'community_admin' | 'pool_staff' | 'contact',
    string | null
  > = {
    president: community.presidentEmail,
    community_admin: community.communityAdminEmail,
    pool_staff: community.poolStaffEmail,
    contact: community.contactEmail,
  }

  type StaffSlot = SlotDef['slot'] | 'concierge'

  const merged = new Map<
    string,
    { labels: string[]; slots: StaffSlot[]; email: string; conciergeActive?: boolean }
  >()

  const addStaffEmail = (
    raw: string | null | undefined,
    label: string,
    slot: StaffSlot,
    conciergeEntryActive = true,
  ) => {
    const n = normEmail(raw)
    if (!n) return
    const cur = merged.get(n) ?? { labels: [], slots: [], email: n }
    cur.labels.push(label)
    cur.slots.push(slot)
    if (slot === 'concierge') {
      if (conciergeEntryActive === false) cur.conciergeActive = false
      else if (cur.conciergeActive === undefined) cur.conciergeActive = true
    }
    merged.set(n, cur)
  }

  for (const def of slotDefs) {
    addStaffEmail(emailFields[def.slot], def.label, def.slot)
  }

  for (const entry of parseConciergeEntries(community)) {
    const label = entry.name?.trim()
      ? `Conserje — ${entry.name.trim()}`
      : 'Conserje'
    addStaffEmail(entry.email, label, 'concierge', isConciergeEntryActive(entry))
  }
  for (const entry of parseConciergeSubstituteEntries(community)) {
    const label = entry.name?.trim()
      ? `Conserje suplente — ${entry.name.trim()}`
      : 'Conserje suplente'
    addStaffEmail(entry.email, label, 'concierge', isConciergeEntryActive(entry))
  }

  const staffRows: {
    labels: string[]
    slots: StaffSlot[]
    email: string
    conciergeFichaActive: boolean | null
    user: {
      id: number
      email: string | null
      name: string | null
      role: string
      piso: string | null
      portal: string | null
    } | null
    roleMismatch: boolean
    canImpersonate: boolean
  }[] = []

  for (const row of merged.values()) {
    const user = await prisma.vecindarioUser.findUnique({
      where: { email: row.email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        piso: true,
        portal: true,
        communityId: true,
      },
    })

    let roleMismatch = false
    if (user) {
      for (const sl of row.slots) {
        if (sl === 'contact') continue
        if (!staffRoleMatchesSlot(user, sl)) {
          roleMismatch = true
          break
        }
      }
    }

    const canImpersonate = user
      ? await userLinkedToCommunity(
          {
            id: user.id,
            email: user.email,
            role: user.role,
            communityId: user.communityId,
          },
          community,
        )
      : false

    staffRows.push({
      labels: row.labels,
      slots: row.slots,
      email: row.email,
      conciergeFichaActive: row.slots.includes('concierge')
        ? row.conciergeActive !== false
        : null,
      user: user
        ? {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            piso: user.piso?.trim() || null,
            portal: user.portal?.trim() || null,
          }
        : null,
      roleMismatch,
      canImpersonate,
    })
  }

  staffRows.sort((a, b) => {
    const aConc = a.labels.some((l) => l.startsWith('Conserje'))
    const bConc = b.labels.some((l) => l.startsWith('Conserje'))
    if (aConc !== bConc) return aConc ? -1 : 1
    return a.email.localeCompare(b.email, 'es')
  })

  const bookingGroups = await prisma.communityBooking.groupBy({
    by: ['vecindarioUserId'],
    where: { communityId: id, vecindarioUserId: { not: null } },
    _count: { id: true },
  })

  const staffUserIds = await resolveStaffUserIdsForCommunity(community)

  type ResidentRow = {
    user: {
      id: number
      email: string | null
      name: string | null
      role: string
      piso: string | null
      portal: string | null
    }
    bookingCount: number
    canImpersonate: boolean
  }

  const residentRows: ResidentRow[] = []
  const residentRowUserIds = new Set<number>()

  for (const g of bookingGroups) {
    const uid = g.vecindarioUserId
    if (uid == null || staffUserIds.has(uid)) continue
    const u = await prisma.vecindarioUser.findUnique({
      where: { id: uid },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        piso: true,
        portal: true,
        communityId: true,
      },
    })
    if (!u) continue
    const canImpersonate = await userLinkedToCommunity(
      { id: u.id, email: u.email, role: u.role, communityId: u.communityId },
      community,
    )
    residentRows.push({
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        piso: u.piso?.trim() || null,
        portal: u.portal?.trim() || null,
      },
      bookingCount: g._count.id,
      canImpersonate,
    })
    residentRowUserIds.add(u.id)
  }

  const linkedByCommunity = await prisma.vecindarioUser.findMany({
    where: { communityId: id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      piso: true,
      portal: true,
      communityId: true,
    },
  })

  for (const u of linkedByCommunity) {
    if (staffUserIds.has(u.id) || residentRowUserIds.has(u.id)) continue
    residentRowUserIds.add(u.id)
    const canImpersonate = await userLinkedToCommunity(
      { id: u.id, email: u.email, role: u.role, communityId: u.communityId },
      community,
    )
    residentRows.push({
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        piso: u.piso?.trim() || null,
        portal: u.portal?.trim() || null,
      },
      bookingCount: 0,
      canImpersonate,
    })
  }

  residentRows.sort((a, b) => {
    const ea = (a.user.email || '').toLowerCase()
    const eb = (b.user.email || '').toLowerCase()
    if (ea && eb && ea !== eb) return ea.localeCompare(eb)
    if (ea && !eb) return -1
    if (!ea && eb) return 1
    const pa = `${a.user.portal || ''}\t${a.user.piso || ''}`
    const pb = `${b.user.portal || ''}\t${b.user.piso || ''}`
    return pa.localeCompare(pb) || a.user.id - b.user.id
  })

  res.json({
    community: {
      id: community.id,
      name: community.name,
      accessCode: community.accessCode,
    },
    staff: staffRows,
    residentsFromBookings: residentRows,
    note:
      '«Contraseña temporal» genera una clave nueva (la anterior deja de valer). Cópiala del aviso verde; no se puede recuperar desde el hash guardado en base de datos.',
  })
})

/** Super admin: activar / desactivar conserje en ficha (sin quitar el correo). */
adminCommunitiesRouter.patch('/:id/concierge-ficha-active', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Invalid community id' })
    return
  }

  const emailRaw = req.body?.email
  const activeRaw = req.body?.active
  if (typeof emailRaw !== 'string' || !emailRaw.trim()) {
    res.status(400).json({ error: 'Indica el email del conserje.' })
    return
  }
  if (typeof activeRaw !== 'boolean') {
    res.status(400).json({ error: 'Indica active: true o false.' })
    return
  }

  const community = await findCommunityForAdminRequest(req, id)
  if (!community) {
    res.status(404).json({ error: 'Comunidad no encontrada' })
    return
  }

  const updated = setConciergeFichaActiveForEmail(community, emailRaw, activeRaw)
  if (!updated) {
    res.status(404).json({
      error: 'No figura como conserje',
      message: 'Ese correo no está en la ficha como conserje titular o suplente.',
    })
    return
  }

  const norm = normalizeConciergeEmailsForDb(updated.staff, updated.substitutes)
  const row = await prisma.community.update({
    where: { id },
    data: {
      conciergeEmailsJson: norm.conciergeEmailsJson,
      conciergeEmail: norm.conciergeEmail,
      conciergeEmail2: norm.conciergeEmail2,
      conciergeSubstitutesJson: norm.conciergeSubstitutesJson,
      conciergeSubstituteEmail: norm.conciergeSubstituteEmail,
      conciergeSubstituteName: norm.conciergeSubstituteName,
    },
    select: { id: true, name: true, ...conciergeEmailPrismaSelect },
  })

  res.json({
    ok: true,
    email: emailRaw.trim(),
    active: conciergeFichaActiveForEmail(row, emailRaw),
    message: activeRaw
      ? 'Conserje activado en la ficha: puede volver a entrar con VEC + correo.'
      : 'Conserje desactivado: no podrá entrar hasta reactivarlo (el correo sigue en la ficha).',
  })
})

/** Super admin: contraseña vigente en claro (alta, reset o último login correcto). */
adminCommunitiesRouter.get('/:id/users/:userId/password-snapshot', async (req, res) => {
  const communityId = Number(req.params.id)
  const targetUserId = Number(req.params.userId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'Invalid community id' })
    return
  }
  if (!Number.isInteger(targetUserId) || targetUserId < 1) {
    res.status(400).json({ error: 'userId inválido' })
    return
  }

  const community = await findCommunityForAdminRequest(req, communityId)
  if (!community) {
    res.status(404).json({ error: 'Comunidad no encontrada' })
    return
  }

  const target = await prisma.vecindarioUser.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      communityId: true,
      passwordPlainSnapshot: true,
    },
  })
  if (!target) {
    res.status(404).json({ error: 'Usuario no encontrado' })
    return
  }

  if (target.role === 'super_admin') {
    res.status(403).json({ error: 'No aplica a super administrador.' })
    return
  }

  const linked = await userLinkedToCommunity(target, community)
  if (!linked) {
    res.status(403).json({ error: 'Este usuario no está vinculado a esta comunidad.' })
    return
  }

  const snapshot = target.passwordPlainSnapshot?.trim() || null
  if (!snapshot) {
    res.json({
      password: null,
      canDecrypt: false,
      message:
        'Aún no hay copia guardada (cuenta antigua). No se puede leer del hash bcrypt. Cuando este usuario inicie sesión en el portal con su contraseña actual, quedará registrada aquí sin cambiarla. Si la tienes del correo de alta, usa «Guardar clave del email».',
    })
    return
  }

  res.json({
    password: snapshot,
    message: 'Contraseña vigente en el portal (alta, reset o último acceso correcto).',
  })
})

/**
 * Super admin: comprueba una contraseña sin cambiarla; si coincide con el hash, la guarda para 👁.
 */
adminCommunitiesRouter.post('/:id/users/:userId/password-snapshot/capture', async (req, res) => {
  const communityId = Number(req.params.id)
  const targetUserId = Number(req.params.userId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'Invalid community id' })
    return
  }
  if (!Number.isInteger(targetUserId) || targetUserId < 1) {
    res.status(400).json({ error: 'userId inválido' })
    return
  }

  const plain =
    typeof req.body?.password === 'string' ? req.body.password.trim() : ''
  if (plain.length < 1) {
    res.status(400).json({ error: 'Indica la contraseña a comprobar' })
    return
  }

  const community = await findCommunityForAdminRequest(req, communityId)
  if (!community) {
    res.status(404).json({ error: 'Comunidad no encontrada' })
    return
  }

  const target = await prisma.vecindarioUser.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      email: true,
      role: true,
      communityId: true,
      passwordHash: true,
    },
  })
  if (!target) {
    res.status(404).json({ error: 'Usuario no encontrado' })
    return
  }
  if (target.role === 'super_admin') {
    res.status(403).json({ error: 'No aplica a super administrador.' })
    return
  }

  const linked = await userLinkedToCommunity(target, community)
  if (!linked) {
    res.status(403).json({ error: 'Este usuario no está vinculado a esta comunidad.' })
    return
  }

  const matches = await bcrypt.compare(plain, target.passwordHash)
  if (!matches) {
    res.status(400).json({
      error: 'La contraseña no coincide con la del usuario',
      message: 'Comprueba el correo de alta o pide al vecino que entre una vez en el portal.',
    })
    return
  }

  await prisma.vecindarioUser.update({
    where: { id: target.id },
    data: { passwordPlainSnapshot: capturePasswordPlainSnapshot(plain) },
  })

  res.json({
    password: plain,
    message: 'Contraseña comprobada y guardada (no se ha cambiado).',
  })
})

/**
 * Elimina todas las cuentas con rol `resident` vinculadas a la comunidad (misma selección que la tabla de vecinos),
 * excluyendo personal de la ficha. Borra incidencias y solicitudes de servicio de esta comunidad reportadas por
 * esos usuarios (restricción FK). Las reservas pasan a `vecindario_user_id` null (onDelete SetNull).
 */
adminCommunitiesRouter.post('/:id/residents/bulk-delete', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }

  const community = await findCommunityForAdminRequest(req, id)
  if (!community) {
    res.status(404).json({ error: 'Comunidad no encontrada' })
    return
  }

  const bodyName =
    typeof req.body?.confirmCommunityName === 'string' ? req.body.confirmCommunityName.trim() : ''
  const expected = community.name.trim()
  if (!bodyName || bodyName.toLowerCase() !== expected.toLowerCase()) {
    res.status(400).json({
      error:
        'Confirma el nombre de la comunidad en JSON: { "confirmCommunityName": "…" } (el mismo texto que en la ficha; mayúsculas ignoradas).',
    })
    return
  }

  try {
    const ids = await collectBulkDeletableResidentUserIds(community)
    if (ids.length === 0) {
      res.json({ deleted: 0, message: 'No había cuentas de vecino para borrar.' })
      return
    }
    const result = await prisma.$transaction(async (tx) =>
      bulkDeleteResidentAccountsForCommunity(community, { tx, userIds: ids }),
    )
    res.json({
      deleted: result.deleted,
      message:
        result.deleted > 0
          ? `Se eliminaron ${result.deleted} cuenta(s) de vecino. Las reservas siguen en el sistema sin usuario asociado.`
          : 'No se eliminó ninguna cuenta.',
    })
  } catch (e) {
    res.status(500).json({
      error: e instanceof Error ? e.message : 'Error al borrar cuentas de vecinos',
    })
  }
})

/** Eliminar una cuenta vinculada a esta comunidad (ficha staff o vecino de la tabla). */
adminCommunitiesRouter.delete('/:id/users/:userId', async (req, res) => {
  const communityId = Number(req.params.id)
  const targetUserId = Number(req.params.userId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'Invalid community id' })
    return
  }
  if (!Number.isInteger(targetUserId) || targetUserId < 1) {
    res.status(400).json({ error: 'userId inválido' })
    return
  }

  const community = await findCommunityForAdminRequest(req, communityId)
  if (!community) {
    res.status(404).json({ error: 'Comunidad no encontrada' })
    return
  }

  const actorId = req.userId!
  const result = await deleteCommunityUserAccount(community, targetUserId, actorId)
  if (!result.ok) {
    res.status(result.status).json({
      error: result.error,
      ...(result.message ? { message: result.message } : {}),
    })
    return
  }

  res.json({
    ok: true,
    clearedFicha: result.clearedFicha,
    message: result.clearedFicha
      ? 'Cuenta eliminada y correo quitado de la ficha de la comunidad.'
      : 'Cuenta eliminada.',
  })
})

/** Sesión JWT del usuario objetivo (solo super admin). Requiere vínculo con la comunidad. */
adminCommunitiesRouter.post('/:id/impersonate', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }

  const targetUserId = Number(req.body?.userId)
  if (!Number.isInteger(targetUserId) || targetUserId < 1) {
    res.status(400).json({ error: 'userId inválido' })
    return
  }

  const community = await findCommunityForAdminRequest(req, id)
  if (!community) {
    res.status(404).json({ error: 'Comunidad no encontrada' })
    return
  }

  const target = await prisma.vecindarioUser.findUnique({ where: { id: targetUserId } })
  if (!target) {
    res.status(404).json({ error: 'Usuario no encontrado' })
    return
  }

  const linked = await userLinkedToCommunity(target, community)
  if (!linked) {
    res.status(403).json({
      error: 'Este usuario no está vinculado a esta comunidad (revisa rol y correos en la ficha).',
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
      name: target.name?.trim() || (em ? em.split('@')[0] : 'Vecino'),
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

/** Nueva contraseña en claro una sola vez (solo super admin, usuario vinculado a la comunidad). */
adminCommunitiesRouter.post('/:id/temporary-password', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }

  const targetUserId = Number(req.body?.userId)
  if (!Number.isInteger(targetUserId) || targetUserId < 1) {
    res.status(400).json({ error: 'userId inválido' })
    return
  }

  const community = await findCommunityForAdminRequest(req, id)
  if (!community) {
    res.status(404).json({ error: 'Comunidad no encontrada' })
    return
  }

  const target = await prisma.vecindarioUser.findUnique({ where: { id: targetUserId } })
  if (!target) {
    res.status(404).json({ error: 'Usuario no encontrado' })
    return
  }

  if (target.role === 'super_admin') {
    res.status(403).json({ error: 'No se puede cambiar la contraseña de un super administrador desde aquí.' })
    return
  }

  const linked = await userLinkedToCommunity(target, community)
  if (!linked) {
    res.status(403).json({
      error: 'Este usuario no está vinculado a esta comunidad.',
    })
    return
  }

  const temporaryPassword = generateTemporaryPasswordPlain()
  const passwordHash = await bcrypt.hash(temporaryPassword, 12)
  await prisma.vecindarioUser.update({
    where: { id: target.id },
    data: {
      passwordHash,
      passwordPlainSnapshot: capturePasswordPlainSnapshot(temporaryPassword),
    },
  })

  res.json({
    temporaryPassword,
    message:
      'Copia esta contraseña ahora; no se volverá a mostrar. El usuario debe cambiarla al entrar si lo indicáis.',
  })
})

adminCommunitiesRouter.patch('/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }

  const accessCommunity = await findCommunityForAdminRequest(req, id)
  if (!accessCommunity) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const access = req.adminCommunityAccess ?? { mode: 'full' as const }

  const bodyObj =
    req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : null
  const bodyHas = (key: string) =>
    bodyObj != null && Object.prototype.hasOwnProperty.call(bodyObj, key)

  const data: {
    name?: string
    nifCif?: string | null
    address?: string | null
    accessCode?: string | null
    contactEmail?: string | null
    presidentEmail?: string | null
    presidentPortal?: string | null
    presidentPiso?: string | null
    loginSlug?: string | null
    communityAdminEmail?: string | null
    communityAdminName?: string | null
    conciergeEmail?: string | null
    conciergeEmail2?: string | null
    conciergeEmailsJson?: Prisma.InputJsonValue
    conciergeSubstituteEmail?: string | null
    conciergeSubstituteName?: string | null
    conciergeSubstitutesJson?: Prisma.InputJsonValue
    poolStaffEmail?: string | null
    status?: string
    portalCount?: number
    residentSlots?: number | null
    gymAccessEnabled?: boolean
    poolAccessSystemEnabled?: boolean
    poolSeasonActive?: boolean
    poolSeasonStart?: Date | null
    poolSeasonEnd?: Date | null
    poolHoursNote?: string | null
    poolMaxOccupancy?: number | null
    appNavServicesEnabled?: boolean
    appNavIncidentsEnabled?: boolean
    appNavBookingsEnabled?: boolean
    appNavPoolAccessEnabled?: boolean
    appNavPaqueteriaEnabled?: boolean
    paqueteriaSpecialDeliveryEnabled?: boolean
    paqueteriaKeyLoansEnabled?: boolean
    appNavCuadernoDiarioEnabled?: boolean
    serviceRequestCategoryModesJson?: Prisma.InputJsonValue
    padelCourtCount?: number
    padelMaxHoursPerBooking?: Prisma.Decimal
    padelMaxHoursPerApartmentPerDay?: Prisma.Decimal
    padelMinAdvanceHours?: number
    padelOpenTime?: string
    padelCloseTime?: string
    salonBookingMode?: string
    customLocations?: ReturnType<typeof parseCustomLocations>
    planExpiresOn?: Date | null
    portalLabels?: string[]
    portalDwellingConfig?: ReturnType<typeof parsePortalDwellingConfig>
    companyId?: number | null
    serviceProviderCompanyId?: number | null
  } = {}

  if (typeof req.body?.name === 'string') {
    const n = req.body.name.trim().slice(0, 255)
    data.name = n || 'Sin nombre'
  }

  if ('nifCif' in req.body) {
    const nifParsed = parseNifCif(req.body.nifCif)
    if (nifParsed.tooLong) {
      res.status(400).json({ error: 'El NIF/CIF no puede superar 32 caracteres.' })
      return
    }
    data.nifCif = nifParsed.value
  }

  if ('address' in req.body) {
    const addrParsed = parseCommunityAddress(req.body.address)
    if (addrParsed.tooLong) {
      res.status(400).json({ error: 'La dirección no puede superar 512 caracteres.' })
      return
    }
    data.address = addrParsed.value
  }

  if (req.body?.regenerateAccessCode === true) {
    data.accessCode = await generateUniqueAccessCode()
  } else if ('accessCode' in req.body) {
    const raw = req.body.accessCode
    const trimmed = typeof raw === 'string' ? raw.trim() : ''
    if (!trimmed) {
      data.accessCode = await generateUniqueAccessCode()
    } else {
      const dup = await prisma.community.findFirst({
        where: { accessCode: trimmed, NOT: { id } },
        select: { id: true },
      })
      if (dup) {
        res.status(400).json({ error: 'Ese código de acceso ya está en uso' })
        return
      }
      data.accessCode = trimmed
    }
  }

  if ('contactEmail' in req.body) {
    const v = parseInstructionEmail(req.body.contactEmail)
    if (!v) {
      res.status(400).json({
        error: 'El email de contacto de la comunidad es obligatorio y debe ser válido.',
      })
      return
    }
    data.contactEmail = v
  }
  const touchesRoleEmails = bodyHas('presidentEmail') || bodyHas('communityAdminEmail')
  if (touchesRoleEmails) {
    const existing = await prisma.community.findUnique({
      where: { id },
      select: { presidentEmail: true, communityAdminEmail: true },
    })
    if (!existing) {
      res.status(404).json({ error: 'Not found' })
      return
    }

    let nextPresident = existing.presidentEmail
    let nextAdmin = existing.communityAdminEmail

    if (bodyHas('presidentEmail')) {
      const r = parseOptionalInstructionEmail(bodyObj!.presidentEmail)
      if (r.invalidFormat) {
        res.status(400).json({ error: 'El email del presidente no tiene un formato válido.' })
        return
      }
      nextPresident = r.value
    }
    if (bodyHas('communityAdminEmail')) {
      const r = parseOptionalInstructionEmail(bodyObj!.communityAdminEmail)
      if (r.invalidFormat) {
        res.status(400).json({
          error: 'El email del administrador de comunidad no tiene un formato válido.',
        })
        return
      }
      nextAdmin = r.value
    }

    if (bodyHas('presidentEmail')) data.presidentEmail = nextPresident
    if (bodyHas('communityAdminEmail')) data.communityAdminEmail = nextAdmin
  }
  if (bodyHas('communityAdminName')) {
    data.communityAdminName = parseOptionalStaffLabel(bodyObj!.communityAdminName)
  }
  if (bodyHas('companyId') && data.companyId != null) {
    data.communityAdminEmail = null
    data.communityAdminName = null
  }
  if (bodyHas('communityAdminEmail') || bodyHas('communityAdminName')) {
    const snapCo = await prisma.community.findUnique({
      where: { id },
      select: { companyId: true },
    })
    const effectiveCompanyId = bodyHas('companyId') ? (data.companyId ?? null) : snapCo?.companyId ?? null
    if (effectiveCompanyId != null) {
      res.status(400).json({
        error: 'Administrador de ficha no permitido',
        message:
          'Esta comunidad está ligada a una empresa de administración. Usa los administradores de empresa, no un correo de administrador en la ficha.',
      })
      return
    }
  }
  const hasConciergeStaffBody =
    bodyHas('conciergeStaff') || bodyHas('conciergeEmails') || bodyHas('conciergeEmail')
  const hasConciergeSubstitutesBody =
    bodyHas('conciergeSubstitutes') ||
    bodyHas('conciergeSubstituteEmail') ||
    bodyHas('conciergeSubstituteName')
  if (hasConciergeStaffBody || hasConciergeSubstitutesBody) {
    const parsed = parseConciergeEmailsFromBody({
      ...(bodyHas('conciergeStaff')
        ? { conciergeStaff: bodyObj!.conciergeStaff }
        : bodyHas('conciergeEmails')
          ? { conciergeEmails: bodyObj!.conciergeEmails }
          : bodyHas('conciergeEmail')
            ? { conciergeEmails: [bodyObj!.conciergeEmail] }
            : {}),
      ...(bodyHas('conciergeSubstitutes')
        ? { conciergeSubstitutes: bodyObj!.conciergeSubstitutes }
        : {}),
      ...(bodyHas('conciergeSubstituteEmail')
        ? { conciergeSubstituteEmail: bodyObj!.conciergeSubstituteEmail }
        : {}),
      ...(bodyHas('conciergeSubstituteName')
        ? { conciergeSubstituteName: bodyObj!.conciergeSubstituteName }
        : {}),
    })
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error })
      return
    }
    const snapConcierge = await prisma.community.findUnique({
      where: { id },
      select: {
        conciergeEmail: true,
        conciergeEmail2: true,
        conciergeEmailsJson: true,
        conciergeSubstituteEmail: true,
        conciergeSubstituteName: true,
        conciergeSubstitutesJson: true,
      },
    })
    const staffForNorm = hasConciergeStaffBody
      ? parsed.staff
      : snapConcierge
        ? parseConciergeEntries(snapConcierge)
        : []
    const substitutesForNorm = parsed.hasSubstitutesPayload
      ? parsed.substitutes
      : snapConcierge
        ? parseConciergeSubstituteEntries(snapConcierge)
        : []
    const norm = normalizeConciergeEmailsForDb(staffForNorm, substitutesForNorm)
    data.conciergeEmailsJson = norm.conciergeEmailsJson
    data.conciergeEmail = norm.conciergeEmail
    data.conciergeEmail2 = norm.conciergeEmail2
    data.conciergeSubstitutesJson = norm.conciergeSubstitutesJson
    data.conciergeSubstituteEmail = norm.conciergeSubstituteEmail
    data.conciergeSubstituteName = norm.conciergeSubstituteName
  }
  if (bodyHas('poolStaffEmail')) {
    const r = parseOptionalInstructionEmail(bodyObj!.poolStaffEmail)
    if (r.invalidFormat) {
      res.status(400).json({ error: 'El email del socorrista no tiene un formato válido.' })
      return
    }
    data.poolStaffEmail = r.value
  }
  if (bodyHas('presidentPortal') || bodyHas('presidentPiso')) {
    const exUnit = await prisma.community.findUnique({
      where: { id },
      select: { presidentPortal: true, presidentPiso: true },
    })
    if (!exUnit) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const portalNext = bodyHas('presidentPortal')
      ? bodyObj!.presidentPortal
      : exUnit.presidentPortal
    const pisoNext = bodyHas('presidentPiso') ? bodyObj!.presidentPiso : exUnit.presidentPiso
    const u = parsePresidentUnit(portalNext, pisoNext)
    if (!u.ok) {
      res.status(400).json({ error: u.error })
      return
    }
    data.presidentPortal = u.presidentPortal
    data.presidentPiso = u.presidentPiso
  }
  if (bodyHas('loginSlug')) {
    const slugParsed = parseLoginSlugField(bodyObj!.loginSlug)
    if (!slugParsed.ok) {
      res.status(400).json({ error: slugParsed.error })
      return
    }
    if (slugParsed.value) {
      const taken = await prisma.community.findFirst({
        where: { loginSlug: slugParsed.value, NOT: { id } },
        select: { id: true },
      })
      if (taken) {
        res.status(400).json({ error: 'Ese slug ya está en uso en otra comunidad.' })
        return
      }
    }
    data.loginSlug = slugParsed.value
  }
  if (typeof req.body?.status === 'string' && ALLOWED_STATUS.has(req.body.status)) {
    data.status = req.body.status
  }
  if (bodyHas('companyId')) {
    const parsed = await parseOptionalCompanyLinkId(bodyObj!.companyId)
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error })
      return
    }
    if (parsed.value != null) {
      const kindOk = await validateCompanyKindForLink(parsed.value, 'administracion')
      if (!kindOk.ok) {
        res.status(400).json({ error: kindOk.error })
        return
      }
    }
    data.companyId = parsed.value
  }
  if (bodyHas('serviceProviderCompanyId')) {
    if (access.mode === 'service_provider') {
      if (bodyObj!.serviceProviderCompanyId != null && bodyObj!.serviceProviderCompanyId !== '') {
        const n =
          typeof bodyObj!.serviceProviderCompanyId === 'number'
            ? bodyObj!.serviceProviderCompanyId
            : Number.parseInt(String(bodyObj!.serviceProviderCompanyId), 10)
        if (n !== access.companyId) {
          res.status(403).json({
            error: 'No puedes asignar otra empresa de servicios distinta de la tuya.',
          })
          return
        }
      }
      data.serviceProviderCompanyId = access.companyId
    } else {
      const parsed = await parseOptionalCompanyLinkId(bodyObj!.serviceProviderCompanyId)
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error })
        return
      }
      if (parsed.value != null) {
        const kindOk = await validateCompanyKindForLink(parsed.value, 'prestacion_servicios')
        if (!kindOk.ok) {
          res.status(400).json({ error: kindOk.error })
          return
        }
      }
      data.serviceProviderCompanyId = parsed.value
    }
  }
  const nextAdminCo =
    bodyHas('companyId') ? (data.companyId ?? null) : accessCommunity.companyId
  const nextServiceCo = bodyHas('serviceProviderCompanyId')
    ? (data.serviceProviderCompanyId ?? null)
    : accessCommunity.serviceProviderCompanyId
  if (nextAdminCo != null && nextServiceCo != null && nextAdminCo === nextServiceCo) {
    res.status(400).json({
      error: 'La empresa de administración y la de servicios deben ser distintas.',
    })
    return
  }
  if (bodyHas('planExpiresOn')) {
    const p = parsePlanExpiresOn(bodyObj!.planExpiresOn)
    if (!p.ok) {
      res.status(400).json({ error: p.error })
      return
    }
    data.planExpiresOn = p.value
  }
  if ('portalCount' in req.body) {
    data.portalCount = parsePortalCount(req.body.portalCount)
  }
  if (bodyHas('portalLabels') || 'portalCount' in req.body) {
    const meta = await prisma.community.findUnique({
      where: { id },
      select: { portalCount: true, portalLabels: true, portalDwellingConfig: true },
    })
    if (!meta) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const nextCount = data.portalCount ?? meta.portalCount
    if (bodyHas('portalLabels')) {
      data.portalLabels = parsePortalLabels(bodyObj!.portalLabels, nextCount)
    } else {
      const prev = normalizePortalLabelsFromDb(meta.portalLabels, meta.portalCount)
      data.portalLabels = parsePortalLabels(prev, nextCount)
    }
    if (!bodyHas('portalDwellingConfig')) {
      data.portalDwellingConfig = resizePortalDwellingConfig(
        meta.portalDwellingConfig,
        meta.portalCount,
        nextCount,
      )
    }
  }

  if (bodyHas('portalDwellingConfig')) {
    let cnt: number
    if (data.portalCount != null) {
      cnt = data.portalCount
    } else {
      const cur = await prisma.community.findUnique({
        where: { id },
        select: { portalCount: true },
      })
      if (!cur) {
        res.status(404).json({ error: 'Not found' })
        return
      }
      cnt = cur.portalCount
    }
    data.portalDwellingConfig = parsePortalDwellingConfig(bodyObj!.portalDwellingConfig, cnt)
  }
  if ('residentSlots' in req.body) {
    data.residentSlots = parseResidentSlots(req.body.residentSlots)
  }

  /**
   * Cupo automático solo al guardar «Editar portales» (plantas/puertas o alias), no al editar la ficha general:
   * si el super admin pone Nº vecinos / Nº portales a mano, no se sobrescribe con la estimación.
   */
  if (bodyHas('portalDwellingConfig') || bodyHas('portalLabels')) {
    const cur = await prisma.community.findUnique({
      where: { id },
      select: { portalCount: true, portalDwellingConfig: true },
    })
    if (cur) {
      const nextCount = data.portalCount ?? cur.portalCount
      const nextDwelling =
        data.portalDwellingConfig !== undefined ? data.portalDwellingConfig : cur.portalDwellingConfig
      const est = estimateDwellingUnitsFromPortalConfig(nextDwelling, nextCount)
      if (est != null) {
        data.residentSlots = est
      }
    }
  }

  if ('gymAccessEnabled' in req.body) {
    data.gymAccessEnabled = parseBool(req.body.gymAccessEnabled, false)
  }
  if ('poolAccessSystemEnabled' in req.body) {
    data.poolAccessSystemEnabled = parseBool(req.body.poolAccessSystemEnabled, false)
  }
  if ('poolSeasonActive' in req.body) {
    data.poolSeasonActive = parseBool(req.body.poolSeasonActive, false)
  }
  if ('poolHoursNote' in req.body) {
    const t =
      typeof req.body.poolHoursNote === 'string' ? req.body.poolHoursNote.trim().slice(0, 255) : ''
    data.poolHoursNote = t || null
  }
  if ('poolMaxOccupancy' in req.body) {
    const raw = (req.body as Record<string, unknown>).poolMaxOccupancy
    if (raw === null || raw === '' || raw === undefined) {
      data.poolMaxOccupancy = null
    } else {
      const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
      if (!Number.isInteger(n) || n < 1 || n > 5000) {
        res.status(400).json({ error: 'Aforo piscina: entero entre 1 y 5000, o vacío para sin límite.' })
        return
      }
      data.poolMaxOccupancy = n
    }
  }
  if ('poolSeasonStart' in req.body || 'poolSeasonEnd' in req.body) {
    const parsePoolDate = (raw: unknown): Date | null => {
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
      data.poolSeasonStart = parsePoolDate(req.body.poolSeasonStart)
    }
    if ('poolSeasonEnd' in req.body) {
      data.poolSeasonEnd = parsePoolDate(req.body.poolSeasonEnd)
    }
  }
  if ('appNavServicesEnabled' in req.body) {
    data.appNavServicesEnabled = parseBool(req.body.appNavServicesEnabled, true)
  }
  if ('appNavIncidentsEnabled' in req.body) {
    data.appNavIncidentsEnabled = parseBool(req.body.appNavIncidentsEnabled, true)
  }
  if ('appNavBookingsEnabled' in req.body) {
    data.appNavBookingsEnabled = parseBool(req.body.appNavBookingsEnabled, true)
  }
  if ('appNavPoolAccessEnabled' in req.body) {
    data.appNavPoolAccessEnabled = parseBool(req.body.appNavPoolAccessEnabled, false)
  }
  if ('appNavPaqueteriaEnabled' in req.body) {
    data.appNavPaqueteriaEnabled = parseBool(req.body.appNavPaqueteriaEnabled, false)
    if (data.appNavPaqueteriaEnabled === false) {
      data.paqueteriaSpecialDeliveryEnabled = false
      data.paqueteriaKeyLoansEnabled = false
    }
  }
  if ('paqueteriaSpecialDeliveryEnabled' in req.body) {
    const wantSpecial = parseBool(req.body.paqueteriaSpecialDeliveryEnabled, false)
    if (wantSpecial) {
      const paqueteriaOn =
        'appNavPaqueteriaEnabled' in req.body
          ? parseBool(req.body.appNavPaqueteriaEnabled, false)
          : (
              await prisma.community.findUnique({
                where: { id },
                select: { appNavPaqueteriaEnabled: true },
              })
            )?.appNavPaqueteriaEnabled === true
      if (!paqueteriaOn) {
        res.status(400).json({
          error: 'Activa la pestaña Paquetería antes de habilitar la entrega especial.',
        })
        return
      }
    }
    data.paqueteriaSpecialDeliveryEnabled = wantSpecial
  }
  if ('paqueteriaKeyLoansEnabled' in req.body) {
    const wantKeys = parseBool(req.body.paqueteriaKeyLoansEnabled, false)
    if (wantKeys) {
      const paqueteriaOn =
        'appNavPaqueteriaEnabled' in req.body
          ? parseBool(req.body.appNavPaqueteriaEnabled, false)
          : (
              await prisma.community.findUnique({
                where: { id },
                select: { appNavPaqueteriaEnabled: true },
              })
            )?.appNavPaqueteriaEnabled === true
      if (!paqueteriaOn) {
        res.status(400).json({
          error: 'Activa la pestaña Paquetería antes de habilitar el registro de llaves.',
        })
        return
      }
    }
    data.paqueteriaKeyLoansEnabled = wantKeys
  }
  if ('appNavCuadernoDiarioEnabled' in req.body) {
    data.appNavCuadernoDiarioEnabled = parseBool(req.body.appNavCuadernoDiarioEnabled, false)
  }
  if ('serviceRequestCategoryModes' in req.body) {
    const pm = parseServiceRequestCategoryModesBody(
      (req.body as Record<string, unknown>).serviceRequestCategoryModes,
    )
    if (!pm.ok) {
      res.status(400).json({ error: pm.error })
      return
    }
    data.serviceRequestCategoryModesJson = pm.value
  }
  if ('padelCourtCount' in req.body) {
    data.padelCourtCount = parsePadelCourtCount(req.body.padelCourtCount)
  }
  if ('padelMaxHoursPerBooking' in req.body || 'padelMaxHoursPerApartmentPerDay' in req.body) {
    const existing = await prisma.community.findUnique({
      where: { id },
      select: { padelMaxHoursPerBooking: true, padelMaxHoursPerApartmentPerDay: true },
    })
    if (!existing) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    let hb = parsePadelHoursField(undefined, existing.padelMaxHoursPerBooking)
    let hd = parsePadelHoursField(undefined, existing.padelMaxHoursPerApartmentPerDay)
    if ('padelMaxHoursPerBooking' in req.body) {
      hb = parsePadelHoursField(req.body.padelMaxHoursPerBooking, hb)
    }
    if ('padelMaxHoursPerApartmentPerDay' in req.body) {
      hd = parsePadelHoursField(req.body.padelMaxHoursPerApartmentPerDay, hd)
    }
    if (hd < hb) hd = hb
    data.padelMaxHoursPerBooking = new Prisma.Decimal(hb)
    data.padelMaxHoursPerApartmentPerDay = new Prisma.Decimal(hd)
  }
  if (
    'padelMinAdvanceHours' in req.body ||
    'padelOpenTime' in req.body ||
    'padelCloseTime' in req.body
  ) {
    const existing = await prisma.community.findUnique({
      where: { id },
      select: {
        padelMinAdvanceHours: true,
        padelOpenTime: true,
        padelCloseTime: true,
      },
    })
    if (!existing) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    let nextAdv = existing.padelMinAdvanceHours
    let nextOpen = existing.padelOpenTime
    let nextClose = existing.padelCloseTime
    if ('padelMinAdvanceHours' in req.body) {
      nextAdv = parsePadelMinAdvanceHours(req.body.padelMinAdvanceHours, nextAdv)
    }
    if ('padelOpenTime' in req.body) {
      nextOpen = parsePadelWallClock(req.body.padelOpenTime, nextOpen)
    }
    if ('padelCloseTime' in req.body) {
      nextClose = parsePadelWallClock(req.body.padelCloseTime, nextClose)
    }
    const om = padelHHMMToMinutes(nextOpen)
    const cm = padelHHMMToMinutes(nextClose)
    if (om !== null && cm !== null && om >= cm) {
      res.status(400).json({
        error: 'La hora de apertura de pádel debe ser anterior a la de cierre (mismo día).',
      })
      return
    }
    data.padelMinAdvanceHours = nextAdv
    data.padelOpenTime = nextOpen
    data.padelCloseTime = nextClose
  }
  if ('customLocations' in req.body) {
    data.customLocations = parseCustomLocations(req.body.customLocations)
  }
  if ('salonBookingMode' in req.body) {
    const existing = await prisma.community.findUnique({
      where: { id },
      select: { salonBookingMode: true },
    })
    if (!existing) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    data.salonBookingMode = parseSalonBookingMode(req.body.salonBookingMode, existing.salonBookingMode as 'slots' | 'day')
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'Nada que actualizar' })
    return
  }

  const mayTouchStaffEmails =
    bodyHas('presidentEmail') ||
    bodyHas('communityAdminEmail') ||
    bodyHas('conciergeStaff') ||
    bodyHas('conciergeEmails') ||
    bodyHas('conciergeEmail') ||
    bodyHas('conciergeSubstitutes') ||
    bodyHas('conciergeSubstituteEmail') ||
    bodyHas('poolStaffEmail')

  let beforeStaffEmails: {
    presidentEmail: string | null
    communityAdminEmail: string | null
    conciergeEmail: string | null
    conciergeEmail2: string | null
    conciergeSubstituteEmail: string | null
    conciergeEmailsJson: Prisma.JsonValue
    conciergeSubstitutesJson: Prisma.JsonValue
    poolStaffEmail: string | null
  } | null = null

  if (mayTouchStaffEmails) {
    const snap = await prisma.community.findUnique({
      where: { id },
      select: {
        presidentEmail: true,
        communityAdminEmail: true,
        conciergeEmail: true,
        conciergeEmail2: true,
        conciergeSubstituteEmail: true,
        conciergeEmailsJson: true,
        conciergeSubstitutesJson: true,
        poolStaffEmail: true,
      },
    })
    if (snap) beforeStaffEmails = snap
  }

  try {
    const row = await prisma.community.update({ where: { id }, data })

    let onboarding: Awaited<ReturnType<typeof runCommunityOnboarding>> | undefined
    let staffDemoted: DemotedStaffEntry[] | undefined

    if (mayTouchStaffEmails && beforeStaffEmails) {
      const staffUnchanged =
        normEmail(beforeStaffEmails.presidentEmail) === normEmail(row.presidentEmail) &&
        normEmail(beforeStaffEmails.communityAdminEmail) ===
          normEmail(row.communityAdminEmail) &&
        conciergeFichaSignature(beforeStaffEmails) === conciergeFichaSignature(row) &&
        normEmail(beforeStaffEmails.poolStaffEmail) === normEmail(row.poolStaffEmail)

      if (!staffUnchanged) {
        try {
          onboarding = await runCommunityOnboarding(row, {
            sendEmails: false,
            sendContactSummary: false,
          })
        } catch (e) {
          console.error('[community onboarding after patch]', e)
          onboarding = {
            mailConfigured: false,
            invitations: [],
            contactSummarySent: false,
            errors: [e instanceof Error ? e.message : String(e)],
          }
        }
        try {
          const { demoted } = await demoteOrphanedStaffAfterEmailChange(beforeStaffEmails, row)
          if (demoted.length) staffDemoted = demoted
        } catch (e) {
          console.error('[demote orphaned staff]', e)
        }
      }
    }

    res.json({
      ...row,
      ...(onboarding !== undefined ? { onboarding } : {}),
      ...(staffDemoted?.length ? { staffDemoted } : {}),
    })
  } catch {
    res.status(404).json({ error: 'Not found' })
  }
})

adminCommunitiesRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  const community = await findCommunityForAdminRequest(req, id)
  if (!community) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  try {
    await prisma.community.delete({ where: { id: community.id } })
    res.status(204).end()
  } catch {
    res.status(404).json({ error: 'Not found' })
  }
})
