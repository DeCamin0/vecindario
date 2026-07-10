import { findCustomLocationByFacilityId, resolveFacilityFeesFromLocation } from './salonFacilityConfig.js'

export function facilityFeeConfigForBooking(item, customLocations) {
  const loc = findCustomLocationByFacilityId(item?.facilityId, customLocations)
  const { usageFeeEur, depositEur } = resolveFacilityFeesFromLocation(loc)
  return { usageFeeEur, depositEur }
}

export function bookingHasConfiguredFees(item, customLocations) {
  const { usageFeeEur, depositEur } = facilityFeeConfigForBooking(item, customLocations)
  return (usageFeeEur ?? 0) > 0 || (depositEur ?? 0) > 0
}

export function formatDepositReturnedLabel(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}
