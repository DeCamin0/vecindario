import { useEffect, useMemo, useState } from 'react'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'

/** Espejo del `take` de listas pendientes (incidencias / parcels). Solo UI. */
const LIST_CAP = 200

function formatCappedCount(n) {
  if (n == null || !Number.isFinite(n)) return null
  if (n >= LIST_CAP) return `${LIST_CAP}+`
  return String(n)
}

/**
 * Señales operativas para "Hoy en la comunidad".
 * Reutiliza overview de gestión cuando existe; solo añade fetches necesarios.
 */
export function useHomeTodaySignals({
  accessToken,
  communityId,
  communityAccessCode,
  userRole,
  navFlags,
  showManagementStats,
  overviewStats,
  overviewLoading,
  canShowPaqueteria,
}) {
  const [residentOpenIncidents, setResidentOpenIncidents] = useState(null)
  const [residentIncidentsLoading, setResidentIncidentsLoading] = useState(false)
  const [parcelsPending, setParcelsPending] = useState(null)
  const [parcelsLoading, setParcelsLoading] = useState(false)

  const needResidentIncidents =
    Boolean(accessToken) &&
    communityId != null &&
    Number.isFinite(communityId) &&
    Boolean(navFlags?.incidents) &&
    !showManagementStats

  const needParcels =
    Boolean(accessToken) &&
    communityId != null &&
    Number.isFinite(communityId) &&
    Boolean(navFlags?.paqueteria) &&
    Boolean(canShowPaqueteria)

  useEffect(() => {
    if (!needResidentIncidents) return undefined
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setResidentIncidentsLoading(true)
      void fetch(apiUrl(`/api/incidents?communityId=${communityId}&status=pendiente`), {
        headers: jsonAuthHeaders(accessToken),
      })
        .then(async (res) => {
          if (!res.ok) return null
          const data = await res.json().catch(() => null)
          return Array.isArray(data) ? data.length : null
        })
        .then((n) => {
          if (!cancelled) setResidentOpenIncidents(n)
        })
        .catch(() => {
          if (!cancelled) setResidentOpenIncidents(null)
        })
        .finally(() => {
          if (!cancelled) setResidentIncidentsLoading(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [needResidentIncidents, accessToken, communityId])

  useEffect(() => {
    if (!needParcels) return undefined
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setParcelsLoading(true)
      const q = new URLSearchParams({
        communityId: String(communityId),
        status: 'awaiting_pickup',
      })
      const isStaff =
        userRole === 'concierge' ||
        userRole === 'community_admin' ||
        userRole === 'super_admin' ||
        userRole === 'company_admin'
      if (isStaff && communityAccessCode?.trim()) {
        q.set('accessCode', communityAccessCode.trim().toUpperCase())
      }
      void fetch(apiUrl(`/api/community/parcels?${q}`), {
        headers: jsonAuthHeaders(accessToken),
      })
        .then(async (res) => {
          if (!res.ok) return null
          const data = await res.json().catch(() => ({}))
          return Array.isArray(data.parcels) ? data.parcels.length : null
        })
        .then((n) => {
          if (!cancelled) setParcelsPending(n)
        })
        .catch(() => {
          if (!cancelled) setParcelsPending(null)
        })
        .finally(() => {
          if (!cancelled) setParcelsLoading(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [needParcels, accessToken, communityId, communityAccessCode, userRole])

  const signals = useMemo(() => {
    const out = []

    if (navFlags?.incidents) {
      const fromMgmt = showManagementStats
      const loading = fromMgmt
        ? overviewLoading
        : needResidentIncidents && residentIncidentsLoading
      const raw = fromMgmt
        ? overviewStats?.incidentsPendiente
        : needResidentIncidents
          ? residentOpenIncidents
          : null
      let value = '—'
      if (loading && (raw === null || raw === undefined)) value = '…'
      else if (raw != null) value = formatCappedCount(raw) ?? '—'
      out.push({
        id: 'incidents',
        label: 'Incidencias abiertas',
        icon: '⚠',
        value,
        to: '/incidents',
      })
    }

    if (navFlags?.paqueteria && canShowPaqueteria) {
      let value = '—'
      const raw = needParcels ? parcelsPending : null
      if (needParcels && parcelsLoading && parcelsPending === null) value = '…'
      else if (raw != null) value = formatCappedCount(raw) ?? '—'
      out.push({
        id: 'parcels',
        label: 'Paquetes pendientes',
        icon: '📦',
        value,
        to: '/paqueteria',
      })
    }

    // Reservas hoy: solo roles de gestión (dato ya en overview; sin fetch extra).
    if (showManagementStats && navFlags?.bookings) {
      const raw = overviewStats?.bookingsToday
      let value = '—'
      if (overviewLoading && (raw === null || raw === undefined)) value = '…'
      else if (raw != null) value = formatCappedCount(raw) ?? '—'
      out.push({
        id: 'bookings',
        label: 'Reservas hoy',
        icon: '📅',
        value,
        to: '/bookings',
      })
    }

    return out.slice(0, 4)
  }, [
    navFlags,
    showManagementStats,
    overviewStats,
    overviewLoading,
    needResidentIncidents,
    residentOpenIncidents,
    residentIncidentsLoading,
    canShowPaqueteria,
    needParcels,
    parcelsPending,
    parcelsLoading,
  ])

  return {
    signals,
    /** Cuántos GET nuevos introduce este hook (no cuenta overview de gestión). */
    extraFetchCount: (needResidentIncidents ? 1 : 0) + (needParcels ? 1 : 0),
  }
}
