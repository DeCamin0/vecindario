import { prisma } from './prisma.js'

const pushDb = prisma as unknown as {
  vecindarioExpoPushToken: { deleteMany(args: unknown): Promise<{ count: number }> }
  vecindarioWebPushSubscription: { deleteMany(args: unknown): Promise<{ count: number }> }
}

export async function deleteAllExpoTokensForUser(userId: number): Promise<void> {
  await pushDb.vecindarioExpoPushToken.deleteMany({ where: { userId } })
}

export async function deleteAllWebPushSubscriptionsForUser(userId: number): Promise<void> {
  await pushDb.vecindarioWebPushSubscription.deleteMany({ where: { userId } })
}
