import { useCallback, useEffect, useState } from 'react'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'

export const COMMUNITY_MGMT_NAV_DEFAULT = {
  services: true,
  incidents: true,
  bookings: true,
  poolAccess: false,
}

/**
 * Fichas del resumen de gestión:
 * - Total incidencias: pendientes + resueltas (volumen en la comunidad)
 * - Acciones pendientes: solo pendientes (lo que requiere actuación)
 * - Reservas hoy
 * - Incidencias resueltas: solo resueltas
 */
export const OVERVIEW_DEFS = [
  { key: 'incidents', label: 'Total incidencias', icon: '⚠', accent: true, navKey: 'incidents' },
  { key: 'bookings', label: 'Reservas hoy', icon: '📅', navKey: 'bookings' },
  { key: 'pendingActions', label: 'Acciones pendientes', icon: '✓', navKey: 'incidents' },
  { key: 'incidentsResolved', label: 'Incidencias resueltas', icon: '✅', navKey: 'incidents' },
]

function localYmd() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Ruta al hacer clic en cada ficha (null = no enlazable). */
export function getManagementStatTo(statKey, nav) {
  if (statKey === 'incidents' && nav.incidents) return '/incidents'
  if (statKey === 'bookings' && nav.bookings) return '/bookings'
  if (statKey === 'pendingActions' && nav.incidents) return '/incidents'
  if (statKey === 'incidentsResolved' && nav.incidents) return '/incidents'
  return null
}

const EMPTY_OVERVIEW = {
  incidentsPendiente: null,
  bookingsToday: null,
  incidentsResuelta: null,
}

export function useCommunityManagementStats(accessToken, communityId, nav) {
  const [overviewStats, setOverviewStats] = useState(EMPTY_OVERVIEW)
  const [overviewLoading, setOverviewLoading] = useState(false)

  const idValid = Boolean(accessToken && communityId != null && Number.isFinite(communityId))

  useEffect(() => {
    let cancelled = false
    if (!idValid) {
      return () => {
        cancelled = true
      }
    }

    queueMicrotask(() => {
      if (cancelled) return
      setOverviewLoading(true)
      const headers = jsonAuthHeaders(accessToken)
      const today = localYmd()

      const pPendiente = nav.incidents
        ? fetch(apiUrl(`/api/incidents?communityId=${communityId}&status=pendiente`), { headers }).then(
            async (r) => {
              if (!r.ok) return null
              const data = await r.json()
              return Array.isArray(data) ? data.length : 0
            },
          )
        : Promise.resolve(null)

      const pResuelta = nav.incidents
        ? fetch(apiUrl(`/api/incidents?communityId=${communityId}&status=resuelta`), { headers }).then(
            async (r) => {
              if (!r.ok) return null
              const data = await r.json()
              return Array.isArray(data) ? data.length : 0
            },
          )
        : Promise.resolve(null)

      const pBookings = nav.bookings
        ? fetch(apiUrl(`/api/bookings?communityId=${communityId}`), { headers }).then(async (r) => {
            if (!r.ok) return null
            const data = await r.json()
            if (!Array.isArray(data)) return 0
            return data.filter((b) => b.bookingDate === today).length
          })
        : Promise.resolve(null)

      Promise.all([pPendiente, pBookings, pResuelta])
        .then(([incidentsPendiente, bookingsToday, incidentsResuelta]) => {
          if (cancelled) return
          setOverviewStats({ incidentsPendiente, bookingsToday, incidentsResuelta })
        })
        .catch(() => {
          if (!cancelled) {
            setOverviewStats({
              incidentsPendiente: null,
              bookingsToday: null,
              incidentsResuelta: null,
            })
          }
        })
        .finally(() => {
          if (!cancelled) setOverviewLoading(false)
        })
    })

    return () => {
      cancelled = true
    }
  }, [idValid, accessToken, communityId, nav.incidents, nav.bookings])

  const statDisplay = useCallback(
    (navKey, value) => {
      if (!nav[navKey]) return '—'
      if (overviewLoading && value === null) return '…'
      if (value === null) return '—'
      return value
    },
    [nav, overviewLoading],
  )

  return {
    overviewStats: idValid ? overviewStats : EMPTY_OVERVIEW,
    overviewLoading: idValid && overviewLoading,
    statDisplay,
  }
}
