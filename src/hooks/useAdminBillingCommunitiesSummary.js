import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'

/**
 * Carga en batch el resumen de billing de todas las comunidades (1 request).
 * 403 → forbidden (p.ej. company_admin): no mostrar UI de precios.
 */
export function useAdminBillingCommunitiesSummary(accessToken) {
  const [byId, setById] = useState(() => new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [forbidden, setForbidden] = useState(false)

  const reload = useCallback(async () => {
    if (!accessToken) {
      setById(new Map())
      setLoading(false)
      setError(null)
      setForbidden(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiUrl('/api/admin/billing/communities-summary'), {
        headers: jsonAuthHeaders(accessToken),
      })
      if (res.status === 403) {
        setForbidden(true)
        setById(new Map())
        setError(null)
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || data.message || `Error ${res.status}`)
      }
      const map = new Map()
      const items = Array.isArray(data.items) ? data.items : []
      for (const item of items) {
        if (item && item.communityId != null) {
          map.set(Number(item.communityId), item)
        }
      }
      setById(map)
      setForbidden(false)
    } catch (e) {
      setError(e.message || 'No se pudo cargar billing')
      setById(new Map())
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    void reload()
  }, [reload])

  return useMemo(
    () => ({
      byId,
      loading,
      error,
      forbidden,
      reload,
    }),
    [byId, loading, error, forbidden, reload],
  )
}
