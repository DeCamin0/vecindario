export const PARCEL_MAX_BULTOS = 20
export const PARCEL_MIN_BULTOS = 1

export function normalizeParcelPackageCount(n) {
  const c = typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : 1
  return Math.min(PARCEL_MAX_BULTOS, Math.max(PARCEL_MIN_BULTOS, c))
}

export function parcelBultosLabel(n) {
  const c = normalizeParcelPackageCount(n)
  return c === 1 ? '1 bulto' : `${c} bultos`
}

/** ISO para ordenar y mostrar la última actividad del registro. */
export function parcelLastActivityIso(parcel) {
  return parcel?.lastPackageAt || parcel?.updatedAt || parcel?.createdAt || null
}

export function formatParcelDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function parcelShowsInitialRegistration(parcel) {
  const last = parcel?.lastPackageAt
  const created = parcel?.createdAt
  if (!last || !created) return false
  return Math.abs(new Date(last).getTime() - new Date(created).getTime()) > 60_000
}

export async function patchParcelPackageCount({
  apiUrl,
  accessToken,
  communityId,
  communityAccessCode,
  parcelId,
  packageCount,
  addOne,
}) {
  const body = { communityId }
  if (communityAccessCode?.trim()) {
    body.accessCode = communityAccessCode.trim().toUpperCase()
  }
  if (addOne) body.addOne = true
  else body.packageCount = packageCount

  const res = await fetch(apiUrl(`/api/community/parcels/${parcelId}/package-count`), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || data.message || `Error ${res.status}`)
  }
  return data.parcel
}
