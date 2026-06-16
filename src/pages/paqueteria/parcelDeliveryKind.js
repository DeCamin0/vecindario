export const PARCEL_KIND_COURIER = 'courier'
export const PARCEL_KIND_SPECIAL = 'special'

export function isSpecialParcel(parcel) {
  return parcel?.deliveryKind === PARCEL_KIND_SPECIAL
}

export function parcelKindLabel(kind) {
  return kind === PARCEL_KIND_SPECIAL ? 'Entrega especial' : 'Paquete'
}
