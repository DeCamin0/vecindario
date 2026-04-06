import { createHash } from 'node:crypto'
import webpush from 'web-push'
import { prisma } from './prisma.js'

const EXPO_URL = 'https://exp.host/--/api/v2/push/send'

let vapidConfigured = false
function ensureVapid(): boolean {
  if (vapidConfigured) return true
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const sub = process.env.VAPID_SUBJECT ?? 'mailto:vecindario@localhost'
  if (pub && priv) {
    webpush.setVapidDetails(sub, pub, priv)
    vapidConfigured = true
    return true
  }
  return false
}

const pushDb = prisma as unknown as {
  vecindarioExpoPushToken: {
    findMany(args: unknown): Promise<{ token: string }[]>
  }
  vecindarioWebPushSubscription: {
    findMany(args: unknown): Promise<
      { endpointKey: string; endpoint: string; p256dh: string; auth: string }[]
    >
    deleteMany(args: unknown): Promise<{ count: number }>
  }
}

export const pushDelivery = {
  async sendToUsers(
    userIds: number[],
    title: string,
    body: string,
    data?: { serviceRequestId?: number },
  ) {
    const ids = [...new Set(userIds)].filter((id) => Number.isInteger(id) && id >= 1)
    await Promise.all(ids.map((uid) => this.sendToUser(uid, title, body, data)))
  },

  async sendToUser(
    userId: number,
    title: string,
    body: string,
    data?: { serviceRequestId?: number },
  ) {
    const payload = JSON.stringify({
      title,
      body,
      serviceRequestId: data?.serviceRequestId,
    })
    await sendExpo(userId, title, body, data)
    await sendWebPush(userId, payload)
  },
}

async function sendExpo(
  userId: number,
  title: string,
  body: string,
  data?: { serviceRequestId?: number },
) {
  const rows = await pushDb.vecindarioExpoPushToken.findMany({
    where: { userId },
  })
  if (!rows.length) return
  const messages = rows.map((r) => ({
    to: r.token,
    sound: 'default' as const,
    priority: 'high' as const,
    title,
    body,
    data:
      data?.serviceRequestId != null
        ? { serviceRequestId: String(data.serviceRequestId) }
        : ({} as Record<string, string>),
  }))
  try {
    const res = await fetch(EXPO_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    })
    if (!res.ok) {
      const t = await res.text()
      console.warn('[vecindario-push] Expo HTTP', res.status, t.slice(0, 240))
    }
  } catch (e) {
    console.warn('[vecindario-push] Expo', e)
  }
}

async function sendWebPush(userId: number, payload: string) {
  if (!ensureVapid()) return
  const rows = await pushDb.vecindarioWebPushSubscription.findMany({
    where: { userId },
  })
  if (!rows.length) return
  for (const row of rows) {
    const sub = {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
    }
    try {
      await webpush.sendNotification(sub, payload, { TTL: 3600, urgency: 'normal' })
    } catch (err: unknown) {
      const statusCode =
        err && typeof err === 'object' && 'statusCode' in err
          ? Number((err as { statusCode: number }).statusCode)
          : 0
      if (statusCode === 410 || statusCode === 404) {
        await pushDb.vecindarioWebPushSubscription.deleteMany({
          where: { endpointKey: row.endpointKey },
        })
      } else {
        console.warn('[vecindario-push] webpush', statusCode, err)
      }
    }
  }
}

export function sha256EndpointKey(endpoint: string): string {
  return createHash('sha256').update(endpoint, 'utf8').digest('hex')
}
