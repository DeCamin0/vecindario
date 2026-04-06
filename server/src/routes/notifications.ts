import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/require-auth.js'

export const notificationsRouter = Router()

const notifDb = prisma as unknown as {
  vecindarioNotification: {
    findMany(args: unknown): Promise<
      {
        id: number
        type: string
        title: string
        body: string
        readAt: Date | null
        serviceRequestId: number | null
        createdAt: Date
      }[]
    >
    count(args: unknown): Promise<number>
    updateMany(args: unknown): Promise<{ count: number }>
  }
}

function mapRow(n: {
  id: number
  type: string
  title: string
  body: string
  readAt: Date | null
  serviceRequestId: number | null
  createdAt: Date
}) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    read: n.readAt != null,
    serviceRequestId: n.serviceRequestId,
    createdAt: n.createdAt.toISOString(),
  }
}

/** GET /api/notifications */
notificationsRouter.get('/', requireAuth, async (req, res) => {
  const uid = req.userId!
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40))
  const rows = await notifDb.vecindarioNotification.findMany({
    where: { recipientUserId: uid },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  res.json(rows.map(mapRow))
})

/** GET /api/notifications/unread-count */
notificationsRouter.get('/unread-count', requireAuth, async (req, res) => {
  const uid = req.userId!
  const count = await notifDb.vecindarioNotification.count({
    where: { recipientUserId: uid, readAt: null },
  })
  res.json({ count })
})

/** PATCH /api/notifications/:id/read */
notificationsRouter.patch('/:id/read', requireAuth, async (req, res) => {
  const uid = req.userId!
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'id inválido' })
    return
  }
  const r = await notifDb.vecindarioNotification.updateMany({
    where: { id, recipientUserId: uid, readAt: null },
    data: { readAt: new Date() },
  })
  if (r.count === 0) {
    res.status(404).json({ error: 'No encontrado' })
    return
  }
  res.json({ ok: true })
})

/** POST /api/notifications/mark-all-read */
notificationsRouter.post('/mark-all-read', requireAuth, async (req, res) => {
  const uid = req.userId!
  await notifDb.vecindarioNotification.updateMany({
    where: { recipientUserId: uid, readAt: null },
    data: { readAt: new Date() },
  })
  res.json({ ok: true })
})
