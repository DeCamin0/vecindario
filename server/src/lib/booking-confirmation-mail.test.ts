/**
 * Prefs email reservas: conserje con communityId null + notifyEmail=false no debe recibir.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { prisma } from './prisma.js'
import { userAllowsNotificationEmail } from './booking-confirmation-mail.js'

describe('booking email prefs (conserje)', () => {
  it('conserje ALSACIA con notifyEmail=false y communityId null → no envía', async (t) => {
    const u = await prisma.vecindarioUser.findFirst({
      where: { email: 'nextdogro@yahoo.com', role: 'concierge' },
      select: { id: true, notifyEmail: true, communityId: true },
    })
    if (!u) return t.skip('sin usuario nextdogro en DB')
    assert.equal(u.notifyEmail, false)
    assert.equal(u.communityId, null)

    const alsacia = await prisma.community.findFirst({
      where: { name: { contains: 'ALSACIA' } },
      select: { id: true },
    })
    if (!alsacia) return t.skip('sin comunidad ALSACIA')

    const allowed = await userAllowsNotificationEmail('nextdogro@yahoo.com', alsacia.id)
    assert.equal(allowed, false)
  })

  it('email solo en ficha sin cuenta → sigue permitiendo envío', async () => {
    const fake = `ficha-only-no-user-${Date.now()}@example.invalid`
    const allowed = await userAllowsNotificationEmail(fake, 5)
    assert.equal(allowed, true)
  })
})
