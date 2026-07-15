import type { VecindarioRole } from '@prisma/client'
import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/require-auth.js'
import { assertStaffOwnsCommunity } from '../lib/community-staff-gate.js'
import { communityOperationalWhere } from '../lib/community-status.js'
import { pushDelivery } from '../lib/push-delivery.js'
import { sendParcelCreatedNotificationEmail, sendParcelPackageCountUpdatedEmail } from '../lib/parcel-notification-mail.js'
import { staffDisplayName } from '../lib/staff-display-name.js'
import { realtimeHub } from '../lib/realtime-hub.js'

export const communityParcelsRouter = Router()

const MAX_SIGNATURE_CHARS = 600_000
const MAX_PACKAGE_COUNT = 20
const MIN_PACKAGE_COUNT = 1
const MAX_ITEM_DESCRIPTION = 255
/** Recogidos sin filtro de fecha: solo los N más recientes. */
const ARCHIVED_PREVIEW_LIMIT = 5

type ParcelStatusFilter = 'awaiting_pickup' | 'picked_up'

function parseParcelStatusFilter(raw: unknown): ParcelStatusFilter {
  if (raw === 'picked_up' || raw === 'awaiting_pickup') return raw
  return 'awaiting_pickup'
}

/** YYYY-MM-DD → inicio/fin de día UTC para filtro en BD. */
function parseDateQueryBound(raw: unknown, endOfDay: boolean): Date | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null
  const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'
  const d = new Date(`${t}${suffix}`)
  return Number.isNaN(d.getTime()) ? null : d
}

async function queryCommunityParcels(
  communityId: number,
  statusFilter: ParcelStatusFilter,
  dateFrom: Date | null,
  dateTo: Date | null,
  recipientUserId?: number,
) {
  const where: {
    communityId: number
    recipientUserId?: number
    status: ParcelStatusFilter
    pickedUpAt?: { gte?: Date; lte?: Date }
  } = { communityId, status: statusFilter }
  if (recipientUserId != null) where.recipientUserId = recipientUserId
  if (statusFilter === 'picked_up' && (dateFrom || dateTo)) {
    where.pickedUpAt = {}
    if (dateFrom) where.pickedUpAt.gte = dateFrom
    if (dateTo) where.pickedUpAt.lte = dateTo
  }

  const archivedDateSearch = statusFilter === 'picked_up' && Boolean(dateFrom || dateTo)
  const take =
    statusFilter === 'picked_up' && !archivedDateSearch ? ARCHIVED_PREVIEW_LIMIT : 200
  const orderBy =
    statusFilter === 'picked_up'
      ? [{ pickedUpAt: 'desc' as const }, { createdAt: 'desc' as const }]
      : [{ lastPackageAt: 'desc' as const }, { createdAt: 'desc' as const }]

  return prisma.communityConciergeParcel.findMany({ where, orderBy, take })
}

type ParcelDeliveryKind = 'courier' | 'special'

function parseDeliveryKind(raw: unknown): ParcelDeliveryKind {
  const k = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return k === 'special' ? 'special' : 'courier'
}

function parseItemDescription(raw: unknown, kind: ParcelDeliveryKind): string | null {
  if (kind !== 'special') return null
  const t = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : ''
  if (t.length < 2) return null
  return t.slice(0, MAX_ITEM_DESCRIPTION)
}

function parsePackageCount(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(n)) return MIN_PACKAGE_COUNT
  return Math.min(MAX_PACKAGE_COUNT, Math.max(MIN_PACKAGE_COUNT, Math.trunc(n)))
}

function trimDw(s: unknown, max: number): string {
  const t = typeof s === 'string' ? s.trim() : String(s ?? '').trim()
  return t.slice(0, max)
}

/**
 * Variantes de texto para el campo `piso` del vecino cuando guardó planta+puerta junto
 * (p. ej. "3º B") y la paquetería envía piso y puerta separados según la ficha ("3" + "B").
 */
function compositePisoVariants(piso: string, puerta: string): string[] {
  const p = piso.trim()
  const u = puerta.trim()
  if (!p || !u) return []
  const out = new Set<string>()
  const add = (s: string) => {
    const t = s.replace(/\s+/g, ' ').trim()
    if (t) out.add(t)
  }
  add(`${p} ${u}`)
  add(`${p}${u}`)
  add(`${p}-${u}`)
  add(`${p} · ${u}`)
  add(`${p}º ${u}`)
  add(`${p}º${u}`)
  add(`${p}° ${u}`)
  add(`${p}°${u}`)
  add(`${p}ª ${u}`)
  return [...out]
}

type ParcelRecipientFind =
  | { ok: true; id: number }
  | { ok: false; reason: 'none' | 'ambiguous_legacy_piso' }

async function findParcelRecipient(
  communityId: number,
  portal: string,
  piso: string,
  puerta: string,
): Promise<ParcelRecipientFind> {
  const roleIn: { in: VecindarioRole[] } = { in: ['resident', 'president'] }
  const exact = await prisma.vecindarioUser.findFirst({
    where: {
      communityId,
      role: roleIn,
      portal: { equals: portal },
      piso: { equals: piso },
      puerta: { equals: puerta },
    },
    select: { id: true },
  })
  if (exact) return { ok: true, id: exact.id }

  const variants = compositePisoVariants(piso, puerta)
  if (variants.length) {
    const legacy = await prisma.vecindarioUser.findMany({
      where: {
        communityId,
        role: roleIn,
        portal: { equals: portal },
        OR: [{ puerta: null }, { puerta: '' }],
        piso: { in: variants },
      },
      select: { id: true },
      take: 12,
    })
    if (legacy.length === 1) return { ok: true, id: legacy[0]!.id }
    if (legacy.length > 1) return { ok: false, reason: 'ambiguous_legacy_piso' }
  }

  return { ok: false, reason: 'none' }
}

async function loadCommunityForParcels(
  communityId: number,
  accessCode: string | undefined,
): Promise<
  | { ok: true; row: NonNullable<Awaited<ReturnType<typeof fetchCommunity>>> }
  | { ok: false; status: number; message: string }
> {
  const row = await fetchCommunity(communityId, accessCode)
  if (!row) {
    return {
      ok: false,
      status: 404,
      message: 'Comunidad no encontrada o inactiva.',
    }
  }
  if (row.appNavPaqueteriaEnabled !== true) {
    return {
      ok: false,
      status: 403,
      message: 'La paquetería de conserjería no está activada para esta comunidad.',
    }
  }
  return { ok: true, row }
}

async function fetchCommunity(communityId: number, accessCode: string | undefined) {
  const code = accessCode?.trim().toUpperCase() ?? ''
  return prisma.community.findFirst({
    where: code
      ? { id: communityId, accessCode: code, ...communityOperationalWhere() }
      : { id: communityId, ...communityOperationalWhere() },
    select: {
      id: true,
      name: true,
      appNavPaqueteriaEnabled: true,
      paqueteriaSpecialDeliveryEnabled: true,
    },
  })
}

function serializeParcel(p: {
  id: number
  communityId: number
  portal: string
  piso: string
  puerta: string
  recipientUserId: number
  createdByUserId: number
  createdByName?: string | null
  photosJson: unknown
  status: string
  packageCount?: number
  deliveryKind?: string
  itemDescription?: string | null
  lastPackageAt?: Date | null
  lastPackageByName?: string | null
  signatureImage: string | null
  pickedUpAt: Date | null
  pickedUpByUserId?: number | null
  pickedUpByName?: string | null
  pickedUpByRole: string | null
  createdAt: Date
  updatedAt: Date
}) {
  const pkg =
    typeof p.packageCount === 'number' && Number.isFinite(p.packageCount)
      ? Math.min(MAX_PACKAGE_COUNT, Math.max(MIN_PACKAGE_COUNT, Math.trunc(p.packageCount)))
      : MIN_PACKAGE_COUNT
  return {
    id: p.id,
    communityId: p.communityId,
    portal: p.portal,
    piso: p.piso,
    puerta: p.puerta,
    recipientUserId: p.recipientUserId,
    createdByUserId: p.createdByUserId,
    createdByName: p.createdByName?.trim() || null,
    packageCount: pkg,
    deliveryKind: p.deliveryKind === 'special' ? 'special' : 'courier',
    itemDescription: p.itemDescription?.trim() || null,
    lastPackageAt: p.lastPackageAt?.toISOString() ?? null,
    lastPackageByName: p.lastPackageByName?.trim() || null,
    photos: Array.isArray(p.photosJson) ? p.photosJson : [],
    status: p.status,
    hasSignature: Boolean(p.signatureImage && String(p.signatureImage).length > 0),
    pickedUpAt: p.pickedUpAt?.toISOString() ?? null,
    pickedUpByUserId: p.pickedUpByUserId ?? null,
    pickedUpByName: p.pickedUpByName?.trim() || null,
    pickedUpByRole: p.pickedUpByRole,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

/** Lista: conserje/admin/presidente (staff) o vecino (solo sus paquetes). */
communityParcelsRouter.get('/parcels', requireAuth, async (req, res) => {
  const communityId = Number(req.query.communityId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido' })
    return
  }
  const accessCode = typeof req.query.accessCode === 'string' ? req.query.accessCode : undefined
  const statusFilter = parseParcelStatusFilter(req.query.status)
  const dateFrom = parseDateQueryBound(req.query.dateFrom, false)
  const dateTo = parseDateQueryBound(req.query.dateTo, true)

  const gate = await loadCommunityForParcels(communityId, accessCode)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message })
    return
  }

  const uid = req.userId!
  const role = req.userRole!

  if (role === 'resident' || role === 'president') {
    const u = await prisma.vecindarioUser.findUnique({
      where: { id: uid },
      select: { communityId: true, role: true },
    })
    if (!u || u.communityId !== communityId) {
      res.status(403).json({ error: 'No perteneces a esta comunidad.' })
      return
    }
    const rows = await queryCommunityParcels(communityId, statusFilter, dateFrom, dateTo, uid)
    res.json({ parcels: rows.map(serializeParcel) })
    return
  }

  if (
    role === 'concierge' ||
    role === 'community_admin' ||
    role === 'company_admin' ||
    role === 'super_admin'
  ) {
    if (role === 'super_admin') {
      const rows = await queryCommunityParcels(communityId, statusFilter, dateFrom, dateTo)
      res.json({ parcels: rows.map(serializeParcel) })
      return
    }
    const staff = await assertStaffOwnsCommunity(uid, communityId, accessCode)
    if (!staff.ok) {
      res.status(staff.status).json({ error: staff.message })
      return
    }
    const rows = await queryCommunityParcels(communityId, statusFilter, dateFrom, dateTo)
    res.json({ parcels: rows.map(serializeParcel) })
    return
  }

  res.status(403).json({ error: 'Rol no autorizado.' })
})

communityParcelsRouter.get('/parcels/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'id inválido' })
    return
  }
  const communityId = Number(req.query.communityId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido' })
    return
  }
  const accessCode = typeof req.query.accessCode === 'string' ? req.query.accessCode : undefined

  const gate = await loadCommunityForParcels(communityId, accessCode)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message })
    return
  }

  const row = await prisma.communityConciergeParcel.findFirst({
    where: { id, communityId },
  })
  if (!row) {
    res.status(404).json({ error: 'Paquete no encontrado' })
    return
  }

  const uid = req.userId!
  const role = req.userRole!

  if (role === 'resident' || role === 'president') {
    const u = await prisma.vecindarioUser.findUnique({
      where: { id: uid },
      select: { communityId: true },
    })
    if (!u || u.communityId !== communityId || row.recipientUserId !== uid) {
      res.status(403).json({ error: 'No autorizado' })
      return
    }
    res.json({
      parcel: {
        ...serializeParcel(row),
        signatureImage: row.signatureImage,
      },
    })
    return
  }

  if (role === 'super_admin') {
    res.json({
      parcel: {
        ...serializeParcel(row),
        signatureImage: row.signatureImage,
      },
    })
    return
  }

  if (role === 'concierge' || role === 'community_admin' || role === 'company_admin') {
    const staff = await assertStaffOwnsCommunity(uid, communityId, accessCode)
    if (!staff.ok) {
      res.status(staff.status).json({ error: staff.message })
      return
    }
    res.json({
      parcel: {
        ...serializeParcel(row),
        signatureImage: row.signatureImage,
      },
    })
    return
  }

  res.status(403).json({ error: 'No autorizado' })
})

/** Alta de paquete: conserje (y super_admin). El administrador de comunidad solo consulta la lista. */
communityParcelsRouter.post('/parcels', requireAuth, async (req, res) => {
  const communityId = Number(req.body?.communityId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido' })
    return
  }
  const accessCode = typeof req.body?.accessCode === 'string' ? req.body.accessCode : undefined

  const gate = await loadCommunityForParcels(communityId, accessCode)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message })
    return
  }

  const uid = req.userId!
  const role = req.userRole!

  if (role !== 'concierge' && role !== 'super_admin') {
    res.status(403).json({ error: 'Solo el conserje puede registrar paquetes en conserjería.' })
    return
  }

  if (role !== 'super_admin') {
    const staff = await assertStaffOwnsCommunity(uid, communityId, accessCode)
    if (!staff.ok) {
      res.status(staff.status).json({ error: staff.message })
      return
    }
  }

  const portal = trimDw(req.body?.portal, 64)
  const piso = trimDw(req.body?.piso, 64)
  const puerta = trimDw(req.body?.puerta, 64)
  if (!portal || !piso || !puerta) {
    res.status(400).json({ error: 'Indica portal, piso y puerta.' })
    return
  }

  const deliveryKind = parseDeliveryKind(req.body?.deliveryKind)
  const itemDescription = parseItemDescription(req.body?.itemDescription, deliveryKind)
  if (deliveryKind === 'special' && gate.row.paqueteriaSpecialDeliveryEnabled !== true) {
    res.status(403).json({
      error: 'La entrega especial no está activada para esta comunidad.',
    })
    return
  }
  if (deliveryKind === 'special' && !itemDescription) {
    res.status(400).json({
      error: 'Indica qué se entrega (descripción breve: llaves, sobre, documentación, etc.).',
    })
    return
  }

  const recipientFind = await findParcelRecipient(communityId, portal, piso, puerta)
  if (recipientFind.ok === false) {
    if (recipientFind.reason === 'ambiguous_legacy_piso') {
      res.status(400).json({
        error:
          'Hay más de un vecino con el mismo portal y datos de planta/puerta ambiguos. Pide al administrador que unifique portal, piso y puerta en el perfil de cada vecino.',
      })
      return
    }
    res.status(400).json({
      error:
        'No hay un vecino residente o presidente con esa combinación portal / piso / puerta. Comprueba que coincida exactamente con los datos del perfil del vecino (incluida la puerta del apartamento). Si el vecino solo rellenó «piso» en un único campo (p. ej. «3º B»), debe actualizar su perfil con planta y puerta separados como en la ficha de la comunidad.',
    })
    return
  }
  const recipient = { id: recipientFind.id }

  const packageCount = deliveryKind === 'special' ? 1 : parsePackageCount(req.body?.packageCount)

  const actor = await prisma.vecindarioUser.findUnique({
    where: { id: uid },
    select: { name: true, email: true },
  })
  const createdByName = actor ? staffDisplayName(actor) : null

  const created = await prisma.communityConciergeParcel.create({
    data: {
      communityId,
      portal,
      piso,
      puerta,
      recipientUserId: recipient.id,
      createdByUserId: uid,
      createdByName,
      photosJson: [],
      status: 'awaiting_pickup',
      packageCount,
      deliveryKind,
      itemDescription,
      lastPackageAt: new Date(),
      lastPackageByUserId: uid,
      lastPackageByName: createdByName,
    },
  })

  const isSpecial = deliveryKind === 'special'
  const title = isSpecial ? 'Entrega en conserjería' : packageCount > 1 ? 'Paquetes en conserjería' : 'Paquete en conserjería'
  const body = isSpecial
    ? `Tienes una entrega pendiente (${itemDescription}) · portal ${portal}, piso ${piso}, puerta ${puerta}.`
    : packageCount > 1
      ? `Tienes ${packageCount} paquetes registrados · portal ${portal}, piso ${piso}, puerta ${puerta}.`
      : `Tienes un paquete registrado · portal ${portal}, piso ${piso}, puerta ${puerta}.`
  await prisma.vecindarioNotification.create({
    data: {
      recipientUserId: recipient.id,
      type: 'paqueteria_new',
      title,
      body,
      serviceRequestId: null,
      parcelId: created.id,
    },
  })
  realtimeHub.emitNotificationRefresh([recipient.id])
  void pushDelivery
    .sendToUser(recipient.id, title, body, { parcelId: created.id })
    .catch((e) => console.error('[parcels push]', e))
  void sendParcelCreatedNotificationEmail({
    recipientUserId: recipient.id,
    communityName: gate.row.name,
    portal,
    piso,
    puerta,
    packageCount,
    parcelId: created.id,
    deliveryKind,
    itemDescription,
  }).catch((e) => console.error('[parcels email]', e))

  res.status(201).json({ parcel: serializeParcel(created) })
})

/** Actualizar número de bultos (conserje): añadir o corregir mientras pendiente de recogida. */
communityParcelsRouter.patch('/parcels/:id/package-count', requireAuth, async (req, res) => {
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

  const gate = await loadCommunityForParcels(communityId, accessCode)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message })
    return
  }

  const uid = req.userId!
  const role = req.userRole!

  if (role !== 'concierge' && role !== 'super_admin') {
    res.status(403).json({ error: 'Solo el conserje puede actualizar el número de bultos.' })
    return
  }

  if (role !== 'super_admin') {
    const staff = await assertStaffOwnsCommunity(uid, communityId, accessCode)
    if (!staff.ok) {
      res.status(staff.status).json({ error: staff.message })
      return
    }
  }

  const row = await prisma.communityConciergeParcel.findFirst({
    where: { id, communityId },
  })
  if (!row) {
    res.status(404).json({ error: 'Paquete no encontrado' })
    return
  }
  if (row.status !== 'awaiting_pickup') {
    res.status(400).json({ error: 'Solo se pueden modificar bultos en registros pendientes de recogida.' })
    return
  }
  if (row.deliveryKind === 'special') {
    res.status(400).json({ error: 'Las entregas especiales no admiten cambio de bultos.' })
    return
  }

  const previousCount = parsePackageCount(row.packageCount)
  let nextCount = previousCount

  if (parseBoolField(req.body?.addOne)) {
    nextCount = Math.min(MAX_PACKAGE_COUNT, previousCount + 1)
  } else if (req.body?.packageCount !== undefined && req.body?.packageCount !== null) {
    nextCount = parsePackageCount(req.body.packageCount)
  } else {
    res.status(400).json({ error: 'Indica packageCount o addOne.' })
    return
  }

  if (nextCount === previousCount) {
    res.json({ parcel: serializeParcel(row) })
    return
  }

  const actor = await prisma.vecindarioUser.findUnique({
    where: { id: uid },
    select: { name: true, email: true },
  })
  const lastPackageByName = actor ? staffDisplayName(actor) : null
  const now = new Date()

  const updated = await prisma.communityConciergeParcel.update({
    where: { id: row.id },
    data: {
      packageCount: nextCount,
      lastPackageAt: now,
      lastPackageByUserId: uid,
      lastPackageByName,
    },
  })

  if (nextCount > previousCount) {
    const title =
      nextCount > 1 ? 'Bultos actualizados en conserjería' : 'Bulto añadido en conserjería'
    const body =
      nextCount > 1
        ? `Ahora tienes ${nextCount} bultos pendientes · portal ${row.portal}, piso ${row.piso}, puerta ${row.puerta}.`
        : `Se ha añadido un bulto a tu registro · portal ${row.portal}, piso ${row.piso}, puerta ${row.puerta}.`
    await prisma.vecindarioNotification.create({
      data: {
        recipientUserId: row.recipientUserId,
        type: 'paqueteria_new',
        title,
        body,
        serviceRequestId: null,
        parcelId: row.id,
      },
    })
    realtimeHub.emitNotificationRefresh([row.recipientUserId])
    void pushDelivery
      .sendToUser(row.recipientUserId, title, body, { parcelId: row.id })
      .catch((e) => console.error('[parcels push bulto-update]', e))
    void sendParcelPackageCountUpdatedEmail({
      recipientUserId: row.recipientUserId,
      communityName: gate.row.name,
      portal: row.portal,
      piso: row.piso,
      puerta: row.puerta,
      packageCount: nextCount,
      previousCount,
      parcelId: row.id,
    }).catch((e) => console.error('[parcels email bulto-update]', e))
  }

  res.json({ parcel: serializeParcel(updated) })
})

/** Eliminar registro de paquete (conserje): error de registro o duplicado. */
communityParcelsRouter.delete('/parcels/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'id inválido' })
    return
  }
  const communityId = Number(req.query.communityId ?? req.body?.communityId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido' })
    return
  }
  const accessCode =
    typeof req.query.accessCode === 'string'
      ? req.query.accessCode
      : typeof req.body?.accessCode === 'string'
        ? req.body.accessCode
        : undefined

  const gate = await loadCommunityForParcels(communityId, accessCode)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message })
    return
  }

  const uid = req.userId!
  const role = req.userRole!

  if (role !== 'concierge' && role !== 'super_admin') {
    res.status(403).json({ error: 'Solo el conserje puede eliminar registros de paquetería.' })
    return
  }

  if (role !== 'super_admin') {
    const staff = await assertStaffOwnsCommunity(uid, communityId, accessCode)
    if (!staff.ok) {
      res.status(staff.status).json({ error: staff.message })
      return
    }
  }

  const row = await prisma.communityConciergeParcel.findFirst({
    where: { id, communityId },
  })
  if (!row) {
    res.status(404).json({ error: 'Paquete no encontrado' })
    return
  }

  await prisma.vecindarioNotification.updateMany({
    where: { parcelId: id },
    data: { parcelId: null },
  })
  await prisma.communityConciergeParcel.delete({ where: { id: row.id } })

  res.json({ ok: true, deletedId: id })
})

function parseBoolField(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === '1'
}

/** Marcar recogido + firma: solo personal de conserjería / admin (entrega presencial en conserjería). */
communityParcelsRouter.patch('/parcels/:id/pickup', requireAuth, async (req, res) => {
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

  const gate = await loadCommunityForParcels(communityId, accessCode)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message })
    return
  }

  const sig = typeof req.body?.signatureDataUrl === 'string' ? req.body.signatureDataUrl.trim() : ''
  if (!sig.startsWith('data:image/') || sig.length > MAX_SIGNATURE_CHARS) {
    res.status(400).json({ error: 'signatureDataUrl debe ser una imagen data URL (PNG/JPEG).' })
    return
  }

  const row = await prisma.communityConciergeParcel.findFirst({
    where: { id, communityId },
  })
  if (!row) {
    res.status(404).json({ error: 'Paquete no encontrado' })
    return
  }
  if (row.status === 'picked_up') {
    res.status(400).json({ error: 'Este paquete ya consta como recogido.' })
    return
  }

  const uid = req.userId!
  const role = req.userRole!

  if (role === 'resident' || role === 'president') {
    res.status(403).json({
      error:
        'La recogida con firma la registra el personal de conserjería en la entrega presencial. Desde la app del vecino solo puedes consultar el estado.',
    })
    return
  }

  let pickedUpByRole: 'concierge' | null = null
  if (role === 'concierge') {
    const staff = await assertStaffOwnsCommunity(uid, communityId, accessCode)
    if (!staff.ok) {
      res.status(staff.status).json({ error: staff.message })
      return
    }
    pickedUpByRole = 'concierge'
  } else if (role === 'super_admin') {
    pickedUpByRole = 'concierge'
  } else {
    res.status(403).json({ error: 'No autorizado' })
    return
  }

  const actor = await prisma.vecindarioUser.findUnique({
    where: { id: uid },
    select: { name: true, email: true },
  })
  const pickedUpByName = actor ? staffDisplayName(actor) : null

  const updated = await prisma.communityConciergeParcel.update({
    where: { id: row.id },
    data: {
      status: 'picked_up',
      signatureImage: sig,
      pickedUpAt: new Date(),
      pickedUpByRole,
      pickedUpByUserId: uid,
      pickedUpByName,
    },
  })

  res.json({ parcel: { ...serializeParcel(updated), signatureImage: updated.signatureImage } })
})
