import { Router } from 'express'
import type { VecindarioUser } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/require-auth.js'
import { communityPortalSelectOptions } from '../lib/portal-labels.js'
import {
  loadVecindarioUser,
  userMayLockIncidentComments,
  userMayManageIncidents,
  userMayUseCommunityIncidents,
} from '../lib/community-incidents-access.js'

export const communityIncidentsRouter = Router()

const CATEGORY_IDS = new Set([
  'water-leak',
  'electricity',
  'noise',
  'cleaning',
  'damage',
  'other',
])

const CATEGORY_LABELS_ES: Record<string, string> = {
  'water-leak': 'Fuga de agua',
  electricity: 'Problema eléctrico',
  noise: 'Ruidos',
  cleaning: 'Limpieza',
  damage: 'Daños',
  other: 'Otro',
}

const MAX_PHOTO_BASE64_CHARS = 2_800_000
const MAX_COMMENT_CHARS = 2000

function normalizePhotoPayload(
  raw: string | null,
  mimeIn: string | null,
): { base64: string | null; mime: string | null } {
  if (!raw) return { base64: null, mime: null }
  const trimmed = raw.trim()
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(trimmed)
  if (m) {
    return { base64: m[2].replace(/\s/g, ''), mime: m[1] }
  }
  return {
    base64: trimmed.replace(/\s/g, ''),
    mime: mimeIn && mimeIn.startsWith('image/') ? mimeIn : 'image/jpeg',
  }
}

type IncidentWithReporter = {
  id: number
  communityId: number
  reporterUserId: number
  categoryId: string
  categoryLabel: string
  description: string
  locationText: string
  portalLabel: string | null
  urgency: string
  status: string
  resolvedAt: Date | null
  photoMime: string | null
  photoBase64: string | null
  createdAt: Date
  commentsLocked: boolean
  reporter: Pick<VecindarioUser, 'email' | 'piso' | 'portal' | 'name'>
  community?: import('@prisma/client').Community
  _count?: { comments: number }
}

type IncidentListViewer = { userId: number; mayManageIncidents: boolean }

type CommentWithAuthor = {
  id: number
  incidentId: number
  authorUserId: number
  body: string
  createdAt: Date
  author: Pick<VecindarioUser, 'email' | 'piso' | 'portal' | 'name'>
}

const incidentDb = prisma as unknown as {
  communityIncident: {
    findMany(args: object): Promise<IncidentWithReporter[]>
    findUnique(args: object): Promise<IncidentWithReporter | null>
    create(args: object): Promise<IncidentWithReporter>
    update(args: object): Promise<IncidentWithReporter>
  }
}

const commentDb = prisma as unknown as {
  communityIncidentComment: {
    findMany(args: object): Promise<CommentWithAuthor[]>
    create(args: object): Promise<CommentWithAuthor>
  }
}

function mapIncidentListRow(row: IncidentWithReporter, viewer: IncidentListViewer) {
  const commentCount = row._count?.comments ?? 0
  const showReporter = viewer.mayManageIncidents || viewer.userId === row.reporterUserId
  const base = {
    id: row.id,
    communityId: row.communityId,
    reporterUserId: row.reporterUserId,
    categoryId: row.categoryId,
    categoryLabel: row.categoryLabel,
    description: row.description,
    locationText: row.locationText,
    portalLabel: row.portalLabel,
    urgency: row.urgency,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    hasPhoto: Boolean(row.photoBase64 && row.photoBase64.length > 0),
    commentCount,
    commentsLocked: row.commentsLocked,
  }
  if (!showReporter) {
    return {
      ...base,
      reporterEmail: null,
      reporterPiso: null,
      reporterPortal: null,
      reporterName: null,
    }
  }
  return {
    ...base,
    reporterEmail: row.reporter.email,
    reporterPiso: row.reporter.piso,
    reporterPortal: row.reporter.portal,
    reporterName: row.reporter.name,
  }
}

function mapCommentRow(row: CommentWithAuthor) {
  return {
    id: row.id,
    incidentId: row.incidentId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    authorEmail: row.author.email,
    authorName: row.author.name,
    authorPiso: row.author.piso,
    authorPortal: row.author.portal,
  }
}

communityIncidentsRouter.get('/', requireAuth, async (req, res) => {
  const communityId = Number(req.query.communityId)
  const statusFilter =
    typeof req.query.status === 'string' && (req.query.status === 'pendiente' || req.query.status === 'resuelta')
      ? req.query.status
      : undefined

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

  const mayUse = await userMayUseCommunityIncidents(user, comm)
  if (!mayUse) {
    res.status(403).json({ error: 'No autorizado para incidencias en esta comunidad' })
    return
  }

  const mayManage = userMayManageIncidents(user, comm)
  const viewer: IncidentListViewer = { userId: user.id, mayManageIncidents: mayManage }

  const where: { communityId: number; status?: string } = { communityId }
  if (statusFilter) where.status = statusFilter

  const rows = await incidentDb.communityIncident.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 200,
    include: {
      reporter: { select: { email: true, piso: true, portal: true, name: true } },
      _count: { select: { comments: true } },
    },
  })

  res.json(rows.map((r) => mapIncidentListRow(r, viewer)))
})

/** Comentarios: cualquier miembro con acceso a la comunidad puede leer y escribir. */
communityIncidentsRouter.get('/:id/comments', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'id inválido' })
    return
  }

  const user = await loadVecindarioUser(req.userId!)
  const row = await incidentDb.communityIncident.findUnique({
    where: { id },
    include: { community: true },
  })

  if (!user || !row?.community) {
    res.status(404).json({ error: 'No encontrado' })
    return
  }

  const mayUse = await userMayUseCommunityIncidents(user, row.community)
  if (!mayUse) {
    res.status(403).json({ error: 'No autorizado' })
    return
  }

  const comments = await commentDb.communityIncidentComment.findMany({
    where: { incidentId: id },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 500,
    include: {
      author: { select: { email: true, piso: true, portal: true, name: true } },
    },
  })

  res.json(comments.map(mapCommentRow))
})

communityIncidentsRouter.post('/:id/comments', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  const bodyRaw = typeof req.body?.body === 'string' ? req.body.body.trim() : ''

  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'id inválido' })
    return
  }
  if (!bodyRaw || bodyRaw.length > MAX_COMMENT_CHARS) {
    res.status(400).json({ error: `Comentario obligatorio (máx. ${MAX_COMMENT_CHARS} caracteres)` })
    return
  }

  const user = await loadVecindarioUser(req.userId!)
  const row = await incidentDb.communityIncident.findUnique({
    where: { id },
    include: { community: true },
  })

  if (!user || !row?.community) {
    res.status(404).json({ error: 'No encontrado' })
    return
  }

  const mayUse = await userMayUseCommunityIncidents(user, row.community)
  if (!mayUse) {
    res.status(403).json({ error: 'No autorizado' })
    return
  }

  if (row.commentsLocked && !userMayManageIncidents(user, row.community)) {
    res.status(403).json({ error: 'Los comentarios están cerrados en esta incidencia.' })
    return
  }

  const created = await commentDb.communityIncidentComment.create({
    data: {
      incidentId: id,
      authorUserId: user.id,
      body: bodyRaw.slice(0, MAX_COMMENT_CHARS),
    },
    include: {
      author: { select: { email: true, piso: true, portal: true, name: true } },
    },
  })

  res.status(201).json(mapCommentRow(created))
})

communityIncidentsRouter.get('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'id inválido' })
    return
  }

  const user = await loadVecindarioUser(req.userId!)
  const row = await incidentDb.communityIncident.findUnique({
    where: { id },
    include: {
      reporter: { select: { email: true, piso: true, portal: true, name: true } },
      community: true,
      _count: { select: { comments: true } },
    },
  })

  if (!user || !row || !row.community) {
    res.status(404).json({ error: 'No encontrado' })
    return
  }

  const mayUse = await userMayUseCommunityIncidents(user, row.community)
  if (!mayUse) {
    res.status(403).json({ error: 'No autorizado' })
    return
  }

  const mayManage = userMayManageIncidents(user, row.community)
  const viewer: IncidentListViewer = { userId: user.id, mayManageIncidents: mayManage }

  res.json({
    ...mapIncidentListRow(row, viewer),
    photoMime: row.photoMime,
    photoBase64: row.photoBase64,
  })
})

communityIncidentsRouter.post('/', requireAuth, async (req, res) => {
  const user = await loadVecindarioUser(req.userId!)
  const communityId = Number(req.body?.communityId)
  const categoryId =
    typeof req.body?.categoryId === 'string' ? req.body.categoryId.trim().slice(0, 64) : ''
  const description =
    typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 8000) : ''
  const locationText =
    typeof req.body?.locationText === 'string' ? req.body.locationText.trim().slice(0, 512) : ''
  const portalLabelRaw =
    typeof req.body?.portalLabel === 'string' ? req.body.portalLabel.trim().slice(0, 128) : ''
  const urgencyRaw = typeof req.body?.urgency === 'string' ? req.body.urgency.trim() : 'medium'
  const urgency = ['low', 'medium', 'high'].includes(urgencyRaw) ? urgencyRaw : 'medium'
  const photoMimeRaw =
    typeof req.body?.photoMime === 'string' ? req.body.photoMime.trim().slice(0, 64) : null
  const rawPhoto =
    typeof req.body?.photoBase64 === 'string' ? req.body.photoBase64.trim() : null
  const normalized = normalizePhotoPayload(rawPhoto, photoMimeRaw)
  let photoBase64 = normalized.base64
  const photoMime = normalized.mime

  if (!user) {
    res.status(401).json({ error: 'Usuario no encontrado' })
    return
  }
  if (!Number.isInteger(communityId) || communityId < 1) {
    res.status(400).json({ error: 'communityId inválido' })
    return
  }
  if (!CATEGORY_IDS.has(categoryId)) {
    res.status(400).json({ error: 'Categoría no válida' })
    return
  }
  if (!description) {
    res.status(400).json({ error: 'La descripción es obligatoria' })
    return
  }
  if (!locationText) {
    res.status(400).json({ error: 'La ubicación es obligatoria' })
    return
  }

  const comm = await prisma.community.findUnique({ where: { id: communityId } })
  if (!comm) {
    res.status(404).json({ error: 'Comunidad no encontrada' })
    return
  }

  const mayUse = await userMayUseCommunityIncidents(user, comm)
  if (!mayUse) {
    res.status(403).json({ error: 'No autorizado' })
    return
  }

  const portalOptions = communityPortalSelectOptions(comm.portalCount, comm.portalLabels)
  let portalLabel: string | null = portalLabelRaw || null
  if (portalOptions != null) {
    if (!portalLabelRaw || !portalOptions.includes(portalLabelRaw)) {
      res.status(400).json({ error: 'Debes elegir un portal de la lista' })
      return
    }
  } else {
    portalLabel = portalLabelRaw || null
  }

  if (photoBase64 && photoBase64.length > MAX_PHOTO_BASE64_CHARS) {
    res.status(400).json({ error: 'La imagen es demasiado grande' })
    return
  }

  const categoryLabel = CATEGORY_LABELS_ES[categoryId] ?? categoryId
  const mimeStored =
    photoBase64 != null && photoBase64.length > 0
      ? photoMime && photoMime.startsWith('image/')
        ? photoMime
        : 'image/jpeg'
      : null
  if (!photoBase64) photoBase64 = null

  const created = await incidentDb.communityIncident.create({
    data: {
      communityId,
      reporterUserId: user.id,
      categoryId,
      categoryLabel,
      description,
      locationText,
      portalLabel,
      urgency,
      status: 'pendiente',
      photoMime: photoBase64 ? mimeStored : null,
      photoBase64: photoBase64 || null,
    },
    include: {
      reporter: { select: { email: true, piso: true, portal: true, name: true } },
      _count: { select: { comments: true } },
    },
  })

  const mayManage = userMayManageIncidents(user, comm)
  const viewer: IncidentListViewer = { userId: user.id, mayManageIncidents: mayManage }
  res.status(201).json(mapIncidentListRow(created, viewer))
})

communityIncidentsRouter.patch('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'id inválido' })
    return
  }

  const user = await loadVecindarioUser(req.userId!)
  const rowPatch = await incidentDb.communityIncident.findUnique({
    where: { id },
    include: { community: true, reporter: { select: { email: true, piso: true, portal: true, name: true } } },
  })

  if (!user || !rowPatch?.community) {
    res.status(404).json({ error: 'No encontrado' })
    return
  }

  const mayUse = await userMayUseCommunityIncidents(user, rowPatch.community)
  if (!mayUse) {
    res.status(403).json({ error: 'No autorizado' })
    return
  }

  const statusRaw = req.body?.status
  const wantsStatus = typeof statusRaw === 'string' && statusRaw.trim().length > 0
  const wantsCommentsLock = typeof req.body?.commentsLocked === 'boolean'
  const wantsEdit =
    req.body?.description !== undefined ||
    req.body?.locationText !== undefined ||
    req.body?.portalLabel !== undefined ||
    req.body?.urgency !== undefined ||
    req.body?.categoryId !== undefined

  const hasStaffPatch = wantsStatus || wantsCommentsLock

  if (hasStaffPatch && wantsEdit) {
    res.status(400).json({
      error:
        'No combines la gestión de la incidencia (estado o cierre de comentarios) con la edición del reporte',
    })
    return
  }

  if (!hasStaffPatch && !wantsEdit) {
    res.status(400).json({ error: 'Nada que actualizar' })
    return
  }

  const mayManagePost = userMayManageIncidents(user, rowPatch.community)
  const viewer: IncidentListViewer = { userId: user.id, mayManageIncidents: mayManagePost }

  if (hasStaffPatch) {
    const staffData: Record<string, unknown> = {}
    if (wantsStatus) {
      const status = String(statusRaw).trim()
      if (status !== 'pendiente' && status !== 'resuelta') {
        res.status(400).json({ error: 'status debe ser pendiente o resuelta' })
        return
      }
      if (!userMayManageIncidents(user, rowPatch.community)) {
        res.status(403).json({ error: 'Solo administración, presidente o conserje pueden cambiar el estado' })
        return
      }
      staffData.status = status
      staffData.resolvedAt = status === 'resuelta' ? new Date() : null
      staffData.resolvedByUserId = status === 'resuelta' ? user.id : null
    }
    if (wantsCommentsLock) {
      if (!userMayLockIncidentComments(user, rowPatch.community)) {
        res.status(403).json({
          error: 'Solo el conserje de esta comunidad puede cerrar u abrir comentarios.',
        })
        return
      }
      staffData.commentsLocked = req.body.commentsLocked
    }
    if (Object.keys(staffData).length === 0) {
      res.status(400).json({ error: 'Nada que actualizar' })
      return
    }
    const updated = await incidentDb.communityIncident.update({
      where: { id },
      data: staffData,
      include: {
        reporter: { select: { email: true, piso: true, portal: true, name: true } },
        _count: { select: { comments: true } },
      },
    })
    res.json(mapIncidentListRow(updated, viewer))
    return
  }

  if (rowPatch.reporterUserId !== user.id) {
    res.status(403).json({ error: 'Solo quien abrió la incidencia puede editar el reporte' })
    return
  }
  if (rowPatch.status !== 'pendiente') {
    res.status(403).json({ error: 'No se puede editar una incidencia ya resuelta' })
    return
  }

  const comm = rowPatch.community
  const portalOptions = communityPortalSelectOptions(comm.portalCount, comm.portalLabels)

  const data: Record<string, unknown> = {}

  if (req.body?.description !== undefined) {
    const d = typeof req.body.description === 'string' ? req.body.description.trim().slice(0, 8000) : ''
    if (!d) {
      res.status(400).json({ error: 'La descripción no puede quedar vacía' })
      return
    }
    data.description = d
  }

  if (req.body?.locationText !== undefined) {
    const loc = typeof req.body.locationText === 'string' ? req.body.locationText.trim().slice(0, 512) : ''
    if (!loc) {
      res.status(400).json({ error: 'La ubicación no puede quedar vacía' })
      return
    }
    data.locationText = loc
  }

  if (req.body?.urgency !== undefined) {
    const u = typeof req.body.urgency === 'string' ? req.body.urgency.trim() : 'medium'
    data.urgency = ['low', 'medium', 'high'].includes(u) ? u : 'medium'
  }

  if (req.body?.categoryId !== undefined) {
    const cid = typeof req.body.categoryId === 'string' ? req.body.categoryId.trim().slice(0, 64) : ''
    if (!CATEGORY_IDS.has(cid)) {
      res.status(400).json({ error: 'Categoría no válida' })
      return
    }
    data.categoryId = cid
    data.categoryLabel = CATEGORY_LABELS_ES[cid] ?? cid
  }

  if (req.body?.portalLabel !== undefined) {
    const plRaw = typeof req.body.portalLabel === 'string' ? req.body.portalLabel.trim().slice(0, 128) : ''
    if (portalOptions != null) {
      if (!plRaw || !portalOptions.includes(plRaw)) {
        res.status(400).json({ error: 'Portal no válido para esta comunidad' })
        return
      }
      data.portalLabel = plRaw
    } else {
      data.portalLabel = plRaw || null
    }
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'Nada que actualizar' })
    return
  }

  const updated = await incidentDb.communityIncident.update({
    where: { id },
    data,
    include: {
      reporter: { select: { email: true, piso: true, portal: true, name: true } },
      _count: { select: { comments: true } },
    },
  })

  res.json(mapIncidentListRow(updated, viewer))
})
