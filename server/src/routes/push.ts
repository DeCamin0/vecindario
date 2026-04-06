import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { sha256EndpointKey } from '../lib/push-delivery.js'
import { requireAuth } from '../middleware/require-auth.js'

export const pushRouter = Router()

const pushDb = prisma as unknown as {
  vecindarioExpoPushToken: {
    upsert(args: unknown): Promise<unknown>
  }
  vecindarioWebPushSubscription: {
    upsert(args: unknown): Promise<unknown>
    deleteMany(args: unknown): Promise<{ count: number }>
  }
}

/** GET /api/push/vapid-public-key — clave pública para suscribir Web Push (sin auth). */
pushRouter.get('/vapid-public-key', (_req, res) => {
  const k = process.env.VAPID_PUBLIC_KEY
  res.json({ key: k && k.length > 0 ? k : null })
})

/** POST /api/push/expo — registrar token Expo del dispositivo. */
pushRouter.post('/expo', requireAuth, async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  if (!token || token.length > 500) {
    res.status(400).json({ error: 'token inválido' })
    return
  }
  const userId = req.userId!
  await pushDb.vecindarioExpoPushToken.upsert({
    where: { userId_token: { userId, token } },
    create: { userId, token },
    update: {},
  })
  res.json({ ok: true })
})

/** POST /api/push/web — guardar suscripción Web Push (PWA). */
pushRouter.post('/web', requireAuth, async (req, res) => {
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : ''
  const p256dh = req.body?.keys?.p256dh
  const auth = req.body?.keys?.auth
  if (!endpoint || typeof p256dh !== 'string' || typeof auth !== 'string') {
    res.status(400).json({ error: 'suscripción inválida' })
    return
  }
  const endpointKey = sha256EndpointKey(endpoint)
  const userId = req.userId!
  await pushDb.vecindarioWebPushSubscription.upsert({
    where: { endpointKey },
    create: { userId, endpointKey, endpoint, p256dh, auth },
    update: { userId, p256dh, auth },
  })
  res.json({ ok: true })
})

/** DELETE /api/push/web — quitar suscripción (body: { endpoint }). */
pushRouter.delete('/web', requireAuth, async (req, res) => {
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : ''
  if (!endpoint) {
    res.status(400).json({ error: 'endpoint requerido' })
    return
  }
  const endpointKey = sha256EndpointKey(endpoint)
  await pushDb.vecindarioWebPushSubscription.deleteMany({
    where: { endpointKey, userId: req.userId! },
  })
  res.json({ ok: true })
})
