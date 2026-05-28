/** Línea de personal en listas de paquetería (recibido / entregado). */
export function parcelStaffMetaLine(parcel) {
  const parts = []
  const received = parcel?.createdByName?.trim()
  const handed = parcel?.pickedUpByName?.trim()
  if (received) parts.push(`Recibido por ${received}`)
  if (handed) parts.push(`Entregado por ${handed}`)
  return parts.length ? parts.join(' · ') : null
}
