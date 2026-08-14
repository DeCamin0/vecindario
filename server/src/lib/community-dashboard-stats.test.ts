/**
 * Día civil Europe/Madrid (Cuaderno diario / reservas hoy).
 * Evita el fallo post-medianoche cuando el VPS está en UTC.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { todayDateInTz, todayYmdInTz } from './community-dashboard-stats.js'

describe('todayYmdInTz (Europe/Madrid)', () => {
  it('00:23 Madrid (verano) sigue siendo el día civil Madrid, no UTC', () => {
    // 2026-08-14 00:23 CEST = 2026-08-13 22:23 UTC
    const utcStillPrevDay = new Date('2026-08-13T22:23:00.000Z')
    assert.equal(utcStillPrevDay.toISOString().slice(0, 10), '2026-08-13')
    assert.equal(todayYmdInTz(utcStillPrevDay), '2026-08-14')
    assert.equal(todayDateInTz(utcStillPrevDay).toISOString().slice(0, 10), '2026-08-14')
  })

  it('antes de medianoche Madrid sigue el día anterior', () => {
    // 2026-08-13 23:59 CEST = 2026-08-13 21:59 UTC
    const beforeMadridMidnight = new Date('2026-08-13T21:59:00.000Z')
    assert.equal(todayYmdInTz(beforeMadridMidnight), '2026-08-13')
  })
})
