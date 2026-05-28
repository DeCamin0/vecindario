import { prisma } from './prisma.js'

export type NotificationPrefs = {
  notifyWebPush: boolean
  notifyMobilePush: boolean
  notifyEmail: boolean
}

export function notificationPrefsFromRow(row: {
  notifyWebPush?: boolean | null
  notifyMobilePush?: boolean | null
  notifyEmail?: boolean | null
}): NotificationPrefs {
  return {
    notifyWebPush: row.notifyWebPush !== false,
    notifyMobilePush: row.notifyMobilePush !== false,
    notifyEmail: row.notifyEmail !== false,
  }
}

export async function getUserNotificationPrefs(userId: number): Promise<NotificationPrefs | null> {
  const u = await prisma.vecindarioUser.findUnique({
    where: { id: userId },
    select: { notifyWebPush: true, notifyMobilePush: true, notifyEmail: true },
  })
  if (!u) return null
  return notificationPrefsFromRow(u)
}
