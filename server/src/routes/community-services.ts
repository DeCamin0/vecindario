import { Router } from 'express'
import type { VecindarioUser } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/require-auth.js'
import { loadVecindarioUser, userMayManageIncidents } from '../lib/community-incidents-access.js'
import {
  isValidServiceStatus,
  userMayCreateServiceRequest,
  userMayViewServiceRequestAsOwner,
  userMayPostServiceQuoteMessage,
} from '../lib/community-services-access.js'
import { serviceNotifications, logNotifyErr } from '../lib/service-notifications.js'

export const communityServicesRouter = Router()

const CATEGORY_IDS = new Set([
  'plumber',
  'electrician',
  'locksmith',
  'cleaning',
  'renovation',
  'other',
])

const CATEGORY_LABELS_ES: Record<string, string> = {
  plumber: 'Fontanero',
  electrician: 'Electricista',
  locksmith: 'Cerrajero',
  cleaning: 'Limpieza',
  renovation: 'Renovación',
  other: 'Otro',
}

/** Subtipos de limpieza (ids estables para API y BD). */
const CLEANING_SUBTYPE_LABELS: Record<string, string> = {
  cleaning_general: 'Limpieza general',
  cleaning_deep: 'Limpieza profunda',
  cleaning_post_work: 'Limpieza fin de obra',
  cleaning_one_off: 'Limpieza puntual',
}

const CLEANING_SUBTYPE_IDS = new Set(Object.keys(CLEANING_SUBTYPE_LABELS))

function serviceSubtypeLabel(categoryId: string, subtype: string | null | undefined): string | null {
  if (!subtype) return null
  if (categoryId === 'cleaning') return CLEANING_SUBTYPE_LABELS[subtype] ?? null
  return null
}

const MAX_PHOTOS = 4
const MAX_PHOTO_BASE64_CHARS = 2_000_000
const MAX_QUOTE_MESSAGE_CHARS = 4000

function normalizePhotoPayload(
  raw: string,
): { base64: string; mime: string } | null {
  const trimmed = raw.trim()
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(trimmed)
  if (m) {
    const b64 = m[2].replace(/\s/g, '')
    if (b64.length > MAX_PHOTO_BASE64_CHARS) return null
    return { base64: b64, mime: m[1] }
  }
  return null
}

function parsePhotosInput(raw: unknown): { mime: string; base64: string }[] {
  if (!Array.isArray(raw)) return []
  const out: { mime: string; base64: string }[] = []
  for (const item of raw.slice(0, MAX_PHOTOS)) {
    if (typeof item !== 'string') continue
    const n = normalizePhotoPayload(item)
    if (n) out.push(n)
  }
  return out
}

function photosFromDb(json: unknown): string[] {
  if (!Array.isArray(json)) return []
  const out: string[] = []
  for (const row of json) {
    if (!row || typeof row !== 'object') continue
    const mime = (row as { mime?: string }).mime
    const base64 = (row as { base64?: string }).base64
    if (typeof mime === 'string' && typeof base64 === 'string' && mime.startsWith('image/')) {
      out.push(`data:${mime};base64,${base64}`)
    }
  }
  return out
}

type ServiceRequestRow = {
  id: number
  communityId: number
  requesterUserId: number
  categoryId: string
  categoryLabel: string
  serviceSubtype: string | null
  description: string
  preferredDate: Date | null
  photosJson: unknown
  status: string
  priceAmount: { toString(): string } | null
  priceAmountMax?: { toString(): string } | null
  priceNote: string | null
  priceSentAt: Date | null
  acceptedAt: Date | null
  rejectedAt: Date | null
  providerName: string | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
  requester: Pick<VecindarioUser, 'id' | 'email' | 'name' | 'piso' | 'portal'>
  community?: { id: number; name: string }
}

const svc = prisma as unknown as {
  communityServiceRequest: {
    findUnique(args: unknown): Promise<ServiceRequestRow | null>
    findMany(args: unknown): Promise<ServiceRequestRow[]>
    create(args: unknown): Promise<ServiceRequestRow>
    update(args: unknown): Promise<ServiceRequestRow>
    count(args: unknown): Promise<number>
  }
}

type QuoteMessageRow = {
  id: number
  serviceRequestId: number
  authorUserId: number
  body: string
  createdAt: Date
  author: Pick<VecindarioUser, 'id' | 'email' | 'name' | 'role'>
}

const msgSvc = prisma as unknown as {
  communityServiceRequestMessage: {
    findMany(args: unknown): Promise<QuoteMessageRow[]>
    create(args: unknown): Promise<QuoteMessageRow>
  }
}

function mapQuoteMessage(m: QuoteMessageRow, requesterUserId: number) {
  const fromStaff = m.author.role === 'super_admin'
  const label = fromStaff
    ? 'Administración'
    : m.author.name?.trim() || m.author.email?.trim() || 'Vecino'
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    fromStaff,
    fromRequester: m.authorUserId === requesterUserId,
    authorLabel: label,
  }
}

function mapRowList(row: ServiceRequestRow, opts: { isSuper: boolean; viewerUserId: number }) {
  const photos = photosFromDb(row.photosJson)
  const isOwner = row.requesterUserId === opts.viewerUserId
  const base = {
    id: row.id,
    communityId: row.communityId,
    requesterUserId: row.requesterUserId,
    categoryId: row.categoryId,
    categoryLabel: row.categoryLabel,
    serviceSubtype: row.serviceSubtype ?? null,
    serviceSubtypeLabel: serviceSubtypeLabel(row.categoryId, row.serviceSubtype),
    description: row.description,
    preferredDate: row.preferredDate ? row.preferredDate.toISOString().slice(0, 10) : null,
    status: row.status,
    photoCount: photos.length,
    priceAmount: row.priceAmount != null ? String(row.priceAmount) : null,
    priceAmountMax: row.priceAmountMax != null ? String(row.priceAmountMax) : null,
    priceNote: row.priceNote,
    priceSentAt: row.priceSentAt?.toISOString() ?? null,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
    providerName: row.providerName,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
  if (opts.isSuper) {
    return {
      ...base,
      communityName: row.community?.name ?? null,
      requesterEmail: row.requester.email,
      requesterName: row.requester.name,
      requesterPiso: row.requester.piso,
      requesterPortal: row.requester.portal,
    }
  }
  if (isOwner) {
    return {
      ...base,
      requesterEmail: row.requester.email,
      requesterName: row.requester.name,
      requesterPiso: row.requester.piso,
      requesterPortal: row.requester.portal,
    }
  }
  return base
}

function mapRowDetail(row: ServiceRequestRow, opts: { isSuper: boolean; viewerUserId: number }) {
  const list = mapRowList(row, opts)
  const photos = photosFromDb(row.photosJson)
  const isOwner = row.requesterUserId === opts.viewerUserId
  if (opts.isSuper || isOwner) {
    return { ...list, photos }
  }
  return { ...list, photos: [] as string[] }
}

async function loadRequestFull(id: number) {
  return svc.communityServiceRequest.findUnique({
    where: { id },
    include: {
      requester: { select: { id: true, email: true, name: true, piso: true, portal: true } },
      community: { select: { id: true, name: true } },
    },
  })
}

/** GET /api/services/my?communityId= */
communityServicesRouter.get('/my', requireAuth, async (req, res) => {
  const communityId = Number(req.query.communityId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido' })
    return
  }
  const user = await loadVecindarioUser(req.userId!)
  const comm = await prisma.community.findUnique({ where: { id: communityId } })
  if (!user || !comm) {
    res.status(404).json({ error: 'No encontrado' })
    return
  }
  const may = await userMayCreateServiceRequest(user, comm)
  if (!may) {
    res.status(403).json({ error: 'No autorizado' })
    return
  }
  const rows = await svc.communityServiceRequest.findMany({
    where: { communityId, requesterUserId: user.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 200,
    include: {
      requester: { select: { id: true, email: true, name: true, piso: true, portal: true } },
      community: { select: { id: true, name: true } },
    },
  })
  res.json(
    rows.map((r) => mapRowList(r, { isSuper: false, viewerUserId: user.id })),
  )
})

/** GET /api/services/management-metrics?communityId= — staff gestión (conteo solicitudes en revisión) */
communityServicesRouter.get('/management-metrics', requireAuth, async (req, res) => {
  const communityId = Number(req.query.communityId)
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido' })
    return
  }
  const user = await loadVecindarioUser(req.userId!)
  const comm = await prisma.community.findUnique({ where: { id: communityId } })
  if (!user || !comm) {
    res.status(404).json({ error: 'No encontrado' })
    return
  }
  if (!userMayManageIncidents(user, comm)) {
    res.status(403).json({ error: 'No autorizado' })
    return
  }
  if (comm.appNavServicesEnabled === false) {
    res.json({ pendingServiceRequests: 0 })
    return
  }
  const pendingServiceRequests = await svc.communityServiceRequest.count({
    where: { communityId, status: 'pending_review' },
  })
  res.json({ pendingServiceRequests })
})

/** GET /api/services — solo super_admin (todas las comunidades) */
communityServicesRouter.get('/', requireAuth, async (req, res) => {
  const user = await loadVecindarioUser(req.userId!)
  if (!user || user.role !== 'super_admin') {
    res.status(403).json({ error: 'Se requiere super administrador' })
    return
  }
  const communityId = Number(req.query.communityId)
  const status =
    typeof req.query.status === 'string' && isValidServiceStatus(req.query.status)
      ? req.query.status
      : undefined
  const where: { communityId?: number; status?: string } = {}
  if (Number.isInteger(communityId) && communityId >= 1) where.communityId = communityId
  if (status) where.status = status

  const rows = await svc.communityServiceRequest.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 500,
    include: {
      requester: { select: { id: true, email: true, name: true, piso: true, portal: true } },
      community: { select: { id: true, name: true } },
    },
  })
  res.json(rows.map((r) => mapRowList(r, { isSuper: true, viewerUserId: user.id })))
})

/** GET /api/services/:id/messages — dueño o super_admin (antes de /:id por claridad) */
communityServicesRouter.get('/:id/messages', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'id inválido' })
    return
  }
  const user = await loadVecindarioUser(req.userId!)
  const row = await loadRequestFull(id)
  if (!user || !row) {
    res.status(404).json({ error: 'No encontrado' })
    return
  }
  const isSuper = user.role === 'super_admin'
  const isOwner = userMayViewServiceRequestAsOwner(user, row.requesterUserId)
  if (!isSuper && !isOwner) {
    res.status(403).json({ error: 'No autorizado' })
    return
  }
  const rows = await msgSvc.communityServiceRequestMessage.findMany({
    where: { serviceRequestId: id },
    orderBy: { createdAt: 'asc' },
    take: 300,
    include: {
      author: { select: { id: true, email: true, name: true, role: true } },
    },
  })
  res.json(rows.map((m) => mapQuoteMessage(m, row.requesterUserId)))
})

/** POST /api/services/:id/messages — hasta in_progress (no completed/rejected); vecino o super_admin */
communityServicesRouter.post('/:id/messages', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'id inválido' })
    return
  }
  const user = await loadVecindarioUser(req.userId!)
  const row = await loadRequestFull(id)
  if (!user || !row) {
    res.status(404).json({ error: 'No encontrado' })
    return
  }
  const isSuper = user.role === 'super_admin'
  const isOwner = userMayViewServiceRequestAsOwner(user, row.requesterUserId)
  if (!isSuper && !isOwner) {
    res.status(403).json({ error: 'No autorizado' })
    return
  }
  if (!userMayPostServiceQuoteMessage(user, row)) {
    res.status(409).json({
      error:
        'Los mensajes están cerrados (servicio completado, rechazado o estado no válido)',
    })
    return
  }
  const bodyRaw = typeof req.body?.body === 'string' ? req.body.body.trim() : ''
  if (!bodyRaw || bodyRaw.length > MAX_QUOTE_MESSAGE_CHARS) {
    res.status(400).json({ error: `Mensaje obligatorio (máx. ${MAX_QUOTE_MESSAGE_CHARS} caracteres)` })
    return
  }

  const created = await msgSvc.communityServiceRequestMessage.create({
    data: {
      serviceRequestId: id,
      authorUserId: user.id,
      body: bodyRaw,
    },
    include: {
      author: { select: { id: true, email: true, name: true, role: true } },
    },
  })
  if (isSuper) {
    void serviceNotifications
      .adminWrote({
        serviceRequestId: id,
        requesterUserId: row.requesterUserId,
        preview: bodyRaw,
      })
      .catch(logNotifyErr)
  } else {
    void serviceNotifications.neighborWrote({ serviceRequestId: id, preview: bodyRaw }).catch(logNotifyErr)
  }
  res.status(201).json(mapQuoteMessage(created, row.requesterUserId))
})

/** GET /api/services/:id */
communityServicesRouter.get('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'id inválido' })
    return
  }
  const user = await loadVecindarioUser(req.userId!)
  const row = await loadRequestFull(id)
  if (!user || !row) {
    res.status(404).json({ error: 'No encontrado' })
    return
  }
  const isSuper = user.role === 'super_admin'
  const isOwner = userMayViewServiceRequestAsOwner(user, row.requesterUserId)
  if (!isSuper && !isOwner) {
    res.status(403).json({ error: 'No autorizado' })
    return
  }
  res.json(mapRowDetail(row, { isSuper, viewerUserId: user.id }))
})

/** POST /api/services */
communityServicesRouter.post('/', requireAuth, async (req, res) => {
  const user = await loadVecindarioUser(req.userId!)
  if (!user || user.role === 'super_admin') {
    res.status(403).json({ error: 'Los super administradores no crean solicitudes desde la app' })
    return
  }
  const communityId = Number(req.body?.communityId)
  const categoryId =
    typeof req.body?.categoryId === 'string' ? req.body.categoryId.trim() : ''
  const description =
    typeof req.body?.description === 'string' ? req.body.description.trim() : ''
  const preferredDateRaw = req.body?.preferredDate

  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido' })
    return
  }
  if (!CATEGORY_IDS.has(categoryId)) {
    res.status(400).json({ error: 'categoryId no válido' })
    return
  }
  if (!description || description.length > 8000) {
    res.status(400).json({ error: 'Descripción obligatoria (máx. 8000 caracteres)' })
    return
  }

  const subtypeRaw =
    typeof req.body?.serviceSubtype === 'string' ? req.body.serviceSubtype.trim() : ''
  let serviceSubtype: string | null = null
  if (categoryId === 'cleaning') {
    if (!CLEANING_SUBTYPE_IDS.has(subtypeRaw)) {
      res.status(400).json({ error: 'Elige un tipo de limpieza.' })
      return
    }
    serviceSubtype = subtypeRaw
  }

  let preferredDate: Date | null = null
  if (preferredDateRaw != null && String(preferredDateRaw).trim() !== '') {
    const d = new Date(String(preferredDateRaw))
    if (Number.isNaN(d.getTime())) {
      res.status(400).json({ error: 'preferredDate no válida' })
      return
    }
    preferredDate = d
  }

  const comm = await prisma.community.findUnique({ where: { id: communityId } })
  if (!comm) {
    res.status(404).json({ error: 'Comunidad no encontrada' })
    return
  }
  const may = await userMayCreateServiceRequest(user, comm)
  if (!may) {
    res.status(403).json({ error: 'No autorizado para servicios en esta comunidad' })
    return
  }

  const photos = parsePhotosInput(req.body?.photos)
  const photosJson = photos.map((p) => ({ mime: p.mime, base64: p.base64 }))

  const created = await svc.communityServiceRequest.create({
    data: {
      communityId,
      requesterUserId: user.id,
      categoryId,
      categoryLabel: CATEGORY_LABELS_ES[categoryId] ?? categoryId,
      serviceSubtype,
      description,
      preferredDate,
      photosJson,
      status: 'pending_review',
    },
    include: {
      requester: { select: { id: true, email: true, name: true, piso: true, portal: true } },
      community: { select: { id: true, name: true } },
    },
  })
  void serviceNotifications
    .newServiceRequest({
      id: created.id,
      communityName: created.community?.name ?? `Comunidad #${created.communityId}`,
      categoryLabel: created.categoryLabel,
    })
    .catch(logNotifyErr)
  res.status(201).json(mapRowDetail(created, { isSuper: false, viewerUserId: user.id }))
})

/** POST /api/services/:id/send-price — super_admin */
communityServicesRouter.post('/:id/send-price', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'id inválido' })
    return
  }
  const user = await loadVecindarioUser(req.userId!)
  if (!user || user.role !== 'super_admin') {
    res.status(403).json({ error: 'Se requiere super administrador' })
    return
  }
  const priceAmount = Number(req.body?.priceAmount)
  const rawMax = req.body?.priceAmountMax
  const priceAmountMax =
    rawMax === undefined || rawMax === null || rawMax === ''
      ? null
      : Number(rawMax)
  const priceNote =
    typeof req.body?.priceNote === 'string' ? req.body.priceNote.trim().slice(0, 4000) : ''
  if (!Number.isFinite(priceAmount) || priceAmount < 0 || priceAmount > 999999.99) {
    res.status(400).json({ error: 'priceAmount inválido' })
    return
  }
  if (
    priceAmountMax != null &&
    (!Number.isFinite(priceAmountMax) ||
      priceAmountMax < 0 ||
      priceAmountMax > 999999.99 ||
      priceAmountMax < priceAmount)
  ) {
    res.status(400).json({
      error: 'priceAmountMax inválido (debe ser ≥ precio mínimo)',
    })
    return
  }

  const priceMaxStored =
    priceAmountMax != null && priceAmountMax > priceAmount ? priceAmountMax : null

  const row = await svc.communityServiceRequest.findUnique({ where: { id } })
  if (!row) {
    res.status(404).json({ error: 'No encontrado' })
    return
  }
  if (row.status !== 'pending_review') {
    res.status(409).json({ error: 'Solo se puede enviar precio en estado pending_review' })
    return
  }

  const updated = await svc.communityServiceRequest.update({
    where: { id },
    data: {
      status: 'price_sent',
      priceAmount,
      priceAmountMax: priceMaxStored,
      priceNote: priceNote || null,
      priceSentAt: new Date(),
    },
    include: {
      requester: { select: { id: true, email: true, name: true, piso: true, portal: true } },
      community: { select: { id: true, name: true } },
    },
  })
  void serviceNotifications
    .priceSent({ serviceRequestId: id, requesterUserId: row.requesterUserId })
    .catch(logNotifyErr)
  res.json(mapRowDetail(updated, { isSuper: true, viewerUserId: user.id }))
})

/** POST /api/services/:id/assign-provider — super_admin; solo tras accepted */
communityServicesRouter.post('/:id/assign-provider', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'id inválido' })
    return
  }
  const user = await loadVecindarioUser(req.userId!)
  if (!user || user.role !== 'super_admin') {
    res.status(403).json({ error: 'Se requiere super administrador' })
    return
  }
  const providerName =
    typeof req.body?.providerName === 'string' ? req.body.providerName.trim().slice(0, 255) : ''
  if (!providerName) {
    res.status(400).json({ error: 'providerName obligatorio' })
    return
  }

  const row = await svc.communityServiceRequest.findUnique({ where: { id } })
  if (!row) {
    res.status(404).json({ error: 'No encontrado' })
    return
  }
  if (row.status !== 'accepted') {
    res.status(409).json({ error: 'Solo se puede asignar proveedor tras accepted' })
    return
  }

  const updated = await svc.communityServiceRequest.update({
    where: { id },
    data: {
      status: 'in_progress',
      providerName,
    },
    include: {
      requester: { select: { id: true, email: true, name: true, piso: true, portal: true } },
      community: { select: { id: true, name: true } },
    },
  })
  void serviceNotifications
    .inProgress({
      serviceRequestId: id,
      requesterUserId: row.requesterUserId,
      providerName,
    })
    .catch(logNotifyErr)
  res.json(mapRowDetail(updated, { isSuper: true, viewerUserId: user.id }))
})

/** PATCH /api/services/:id/status — completed desde in_progress: super_admin o vecino titular */
communityServicesRouter.patch('/:id/status', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'id inválido' })
    return
  }
  const user = await loadVecindarioUser(req.userId!)
  if (!user) {
    res.status(404).json({ error: 'No encontrado' })
    return
  }
  const nextStatus =
    typeof req.body?.status === 'string' ? req.body.status.trim() : ''
  if (nextStatus !== 'completed') {
    res.status(400).json({ error: 'Solo se admite status: completed' })
    return
  }

  const row = await svc.communityServiceRequest.findUnique({ where: { id } })
  if (!row) {
    res.status(404).json({ error: 'No encontrado' })
    return
  }
  const isSuper = user.role === 'super_admin'
  const isOwner = userMayViewServiceRequestAsOwner(user, row.requesterUserId)
  if (!isSuper && !isOwner) {
    res.status(403).json({ error: 'No autorizado' })
    return
  }
  if (row.status !== 'in_progress') {
    res.status(409).json({ error: 'Solo se puede completar desde in_progress' })
    return
  }

  const now = new Date()
  const updated = await svc.communityServiceRequest.update({
    where: { id },
    data: {
      status: 'completed',
      completedAt: now,
    },
    include: {
      requester: { select: { id: true, email: true, name: true, piso: true, portal: true } },
      community: { select: { id: true, name: true } },
    },
  })
  if (isSuper) {
    void serviceNotifications
      .completedByAdmin({ serviceRequestId: id, requesterUserId: row.requesterUserId })
      .catch(logNotifyErr)
  } else {
    void serviceNotifications.completedByNeighbor({ serviceRequestId: id }).catch(logNotifyErr)
  }
  res.json(mapRowDetail(updated, { isSuper, viewerUserId: user.id }))
})

/** POST /api/services/:id/accept */
communityServicesRouter.post('/:id/accept', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'id inválido' })
    return
  }
  const user = await loadVecindarioUser(req.userId!)
  const row = await svc.communityServiceRequest.findUnique({ where: { id } })
  if (!user || !row) {
    res.status(404).json({ error: 'No encontrado' })
    return
  }
  if (row.requesterUserId !== user.id) {
    res.status(403).json({ error: 'No autorizado' })
    return
  }
  if (row.status !== 'price_sent') {
    res.status(409).json({ error: 'Solo se puede aceptar cuando hay precio enviado' })
    return
  }

  const updated = await svc.communityServiceRequest.update({
    where: { id },
    data: {
      status: 'accepted',
      acceptedAt: new Date(),
    },
    include: {
      requester: { select: { id: true, email: true, name: true, piso: true, portal: true } },
      community: { select: { id: true, name: true } },
    },
  })
  void serviceNotifications.neighborAccepted({ serviceRequestId: id }).catch(logNotifyErr)
  res.json(mapRowDetail(updated, { isSuper: false, viewerUserId: user.id }))
})

/** POST /api/services/:id/reject */
communityServicesRouter.post('/:id/reject', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'id inválido' })
    return
  }
  const user = await loadVecindarioUser(req.userId!)
  const row = await svc.communityServiceRequest.findUnique({ where: { id } })
  if (!user || !row) {
    res.status(404).json({ error: 'No encontrado' })
    return
  }
  if (row.requesterUserId !== user.id) {
    res.status(403).json({ error: 'No autorizado' })
    return
  }
  if (row.status !== 'price_sent') {
    res.status(409).json({ error: 'Solo se puede rechazar cuando hay precio enviado' })
    return
  }

  const updated = await svc.communityServiceRequest.update({
    where: { id },
    data: {
      status: 'rejected',
      rejectedAt: new Date(),
    },
    include: {
      requester: { select: { id: true, email: true, name: true, piso: true, portal: true } },
      community: { select: { id: true, name: true } },
    },
  })
  void serviceNotifications.neighborRejected({ serviceRequestId: id }).catch(logNotifyErr)
  res.json(mapRowDetail(updated, { isSuper: false, viewerUserId: user.id }))
})
