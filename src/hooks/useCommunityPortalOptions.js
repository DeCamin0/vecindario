import { useState, useEffect } from 'react'
import { apiUrl } from '../config/api.js'

/**
 * Portales configurados en la comunidad (Super Admin).
 * @returns {{ loading: boolean, portals: string[] | null }}
 *   `null` = entrada de texto libre; array no vacío = usar desplegable.
 */
export function useCommunityPortalOptions(communityId, accessCode) {
  const [loading, setLoading] = useState(Boolean(communityId != null && accessCode?.trim()))
  const [portals, setPortals] = useState(null)

  useEffect(() => {
    let cancelled = false
    if (communityId == null || !accessCode?.trim()) {
      setLoading(false)
      setPortals(null)
      return
    }
    setLoading(true)
    const q = new URLSearchParams({
      communityId: String(communityId),
      code: accessCode.trim().toUpperCase(),
    })
    fetch(apiUrl(`/api/public/community-portal-options?${q}`))
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        if (cancelled) return
        const raw = data?.portals
        const list = Array.isArray(raw)
          ? raw.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean)
          : []
        setPortals(list.length > 0 ? list : null)
      })
      .catch(() => {
        if (!cancelled) setPortals(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [communityId, accessCode])

  return { loading, portals }
}
