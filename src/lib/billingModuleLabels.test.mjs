import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  billingModuleLabel,
  summarizeFlagDiff,
} from './billingModuleLabels.js'

describe('B7 billingModuleLabels', () => {
  it('etiquetas legibles', () => {
    assert.equal(billingModuleLabel('bookings'), 'Reservas')
    assert.equal(billingModuleLabel('unknown_x'), 'unknown_x')
  })

  it('summarizeFlagDiff cuenta estados + special delivery', () => {
    const s = summarizeFlagDiff({
      modules: [
        { status: 'ok' },
        { status: 'ok' },
        { status: 'active_not_contracted' },
        { status: 'contracted_not_active' },
      ],
      specialDelivery: { status: 'info_without_parcels_contract' },
    })
    assert.equal(s.ok, 2)
    assert.equal(s.activeNotContracted, 1)
    assert.equal(s.contractedNotActive, 1)
    assert.equal(s.specialDeliveryInfo, true)
  })
})
