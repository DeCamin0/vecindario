/**
 * B8 — GET /api/admin/billing/summary (solo lectura).
 * Un único fetch reutilizable por Inicio + panel Plan y facturación.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'

/**
 * @param {string | null | undefined} accessToken
 */
export function useAdminBillingSummary(accessToken) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    if (!accessToken) {
      setData(null)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiUrl('/api/admin/billing/summary'), {
        headers: jsonAuthHeaders(accessToken),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || json.message || `Error ${res.status}`)
      setData(json)
    } catch (e) {
      setError(e.message || 'No se pudo cargar el resumen comercial')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    void reload()
  }, [reload])

  return useMemo(
    () => ({
      data,
      loading,
      error,
      reload,
    }),
    [data, loading, error, reload],
  )
}
