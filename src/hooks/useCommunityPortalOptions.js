import { useState, useEffect } from 'react'
import { apiUrl } from '../config/api.js'

function normalizePortalsList(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean)
}

/**
 * Portales y listas piso/puerta definidos en la ficha (Super Admin).
 * @param {number | null | undefined} communityId
 * @param {string | null | undefined} accessCode — VEC; si hay JWT de gestión y no hay VEC, se usa community-config.
 * @param {{ staffBearerToken?: string | null }} [options]
 * @returns {{ loading: boolean, portals: string[] | null, dwellingByPortalIndex: unknown[] | null }}
 */
export function useCommunityPortalOptions(communityId, accessCode, options = {}) {
  const staffToken =
    typeof options.staffBearerToken === 'string' ? options.staffBearerToken.trim() : ''
  const vec = typeof accessCode === 'string' ? accessCode.trim() : ''
  const idOk = communityId != null && Number(communityId) >= 1
  const willFetchVec = idOk && Boolean(vec)
  const willFetchStaff = idOk && !vec && Boolean(staffToken)

  const [loading, setLoading] = useState(willFetchVec || willFetchStaff)
  const [portals, setPortals] = useState(null)
  const [dwellingByPortalIndex, setDwellingByPortalIndex] = useState(null)

  useEffect(() => {
    let cancelled = false
    const cid = communityId != null ? Number(communityId) : NaN
    const idNumOk = Number.isFinite(cid) && cid >= 1
    if (!idNumOk) {
      return () => {
        cancelled = true
      }
    }

    queueMicrotask(() => {
      if (cancelled) return
      if (vec) {
        setLoading(true)
        const q = new URLSearchParams({
          communityId: String(cid),
          code: vec.toUpperCase(),
        })
        fetch(apiUrl(`/api/public/community-portal-options?${q}`))
          .then((r) => r.json().catch(() => ({})))
          .then((data) => {
            if (cancelled) return
            const list = normalizePortalsList(data?.portals)
            setPortals(list.length > 0 ? list : null)
            const dw = data?.dwellingByPortalIndex
            setDwellingByPortalIndex(Array.isArray(dw) ? dw : null)
          })
          .catch(() => {
            if (!cancelled) {
              setPortals(null)
              setDwellingByPortalIndex(null)
            }
          })
          .finally(() => {
            if (!cancelled) setLoading(false)
          })
        return
      }

      if (staffToken) {
        setLoading(true)
        fetch(apiUrl(`/api/public/community-config?communityId=${cid}`))
          .then((r) => (r.ok ? r.json().catch(() => null) : null))
          .then((data) => {
            if (cancelled || !data) return
            const list = normalizePortalsList(data.portalSelectOptions)
            setPortals(list.length > 0 ? list : null)
            const dw = data.dwellingByPortalIndex
            setDwellingByPortalIndex(Array.isArray(dw) ? dw : null)
          })
          .catch(() => {
            if (!cancelled) {
              setPortals(null)
              setDwellingByPortalIndex(null)
            }
          })
          .finally(() => {
            if (!cancelled) setLoading(false)
          })
        return
      }

      setLoading(false)
      setPortals(null)
      setDwellingByPortalIndex(null)
    })

    return () => {
      cancelled = true
    }
  }, [communityId, vec, staffToken])

  if (!idOk) {
    return { loading: false, portals: null, dwellingByPortalIndex: null }
  }
  return { loading, portals, dwellingByPortalIndex }
}
