import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import SuperAdminShell from '../components/super-admin/SuperAdminShell.jsx'
import SuperAdminQuoteRow from '../components/super-admin/SuperAdminQuoteRow.jsx'
import SuperAdminQuoteDetail from '../components/super-admin/SuperAdminQuoteDetail.jsx'
import { quoteStatusLabel, quoteTabsLabel } from '../components/super-admin/serviceOpsDisplay.js'
import { buildSaNavItems } from '../components/super-admin/superAdminNav.js'
import './Admin.css'
import '../components/super-admin/SuperAdminShell.css'
import '../components/super-admin/SuperAdminServices.css'

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'new', label: 'Nueva' },
  { value: 'reviewed', label: 'Revisada' },
  { value: 'contacted', label: 'Contactada' },
  { value: 'closed', label: 'Cerrada' },
]

export default function AdminQuoteRequests() {
  const { accessToken, userRole, user } = useAuth()
  const isFullSuperAdmin = userRole === 'super_admin'
  const isScopedServiceAdmin =
    userRole === 'company_admin' &&
    (user?.company?.scopedSuperAdmin === true || user?.company?.kind === 'prestacion_servicios')
  const saNavItems = useMemo(() => buildSaNavItems(isFullSuperAdmin), [isFullSuperAdmin])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [detailId, setDetailId] = useState(null)

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/admin/quote-requests'), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(
          data.message ||
            data.error ||
            `No se pudo cargar (HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''})`,
        )
        setRows([])
        return
      }
      setRows(Array.isArray(data) ? data : [])
    } catch {
      setError('Error de red')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    void load()
  }, [load])

  const patchStatus = async (id, status) => {
    if (!accessToken) return
    try {
      const res = await fetch(apiUrl(`/api/admin/quote-requests/${id}`), {
        method: 'PATCH',
        headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) return
      const updated = await res.json().catch(() => null)
      if (updated?.id) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)))
      }
    } catch {
      /* ignore */
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (!q) return true
      const hay = [
        r.communityName,
        r.communityAddress,
        r.contactName,
        r.contactEmail,
        r.contactPhone,
        r.message,
        r.dwellingApprox,
        quoteTabsLabel(r),
        quoteStatusLabel(r.status),
        String(r.id),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [rows, query, statusFilter])

  const detailRow = useMemo(
    () => (detailId == null ? null : rows.find((r) => r.id === detailId) || null),
    [rows, detailId],
  )

  const detailNavIndex = useMemo(() => {
    if (detailId == null) return -1
    return filtered.findIndex((r) => r.id === detailId)
  }, [filtered, detailId])

  const goPrevDetail = useCallback(() => {
    if (detailNavIndex <= 0) return
    setDetailId(filtered[detailNavIndex - 1].id)
  }, [filtered, detailNavIndex])

  const goNextDetail = useCallback(() => {
    if (detailNavIndex < 0 || detailNavIndex >= filtered.length - 1) return
    setDetailId(filtered[detailNavIndex + 1].id)
  }, [filtered, detailNavIndex])

  useEffect(() => {
    if (!detailRow) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setDetailId(null)
        return
      }
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) {
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrevDetail()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNextDetail()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailRow, goPrevDetail, goNextDetail])

  return (
    <SuperAdminShell
      badgeLabel={
        isScopedServiceAdmin
          ? user?.company?.name?.trim() || 'Prestador de servicios'
          : 'Super administrador'
      }
      isCompanyScoped={isScopedServiceAdmin}
      navItems={saNavItems}
      activeNavId="solicitudes"
      headerActions={
        <button type="button" className="btn btn--ghost" onClick={() => void load()} disabled={loading}>
          Actualizar
        </button>
      }
    >
      <main className="admin-dashboard-main">
        <div className="admin-dashboard-inner">
          <div className="sa-qr">
            <section>
              <div className="sa-qr__block-head">
                <h2 className="sa-qr__block-title">Solicitudes de oferta</h2>
                <p className="sa-qr__block-sub">
                  Formularios desde la web y la app. Estados para seguimiento interno.
                </p>
              </div>

              <div className="sa-qr__filters">
                <div className="sa-qr__search">
                  <label className="sa-qr__filter-label" htmlFor="sa-qr-search">
                    Buscar
                  </label>
                  <input
                    id="sa-qr-search"
                    className="sa-qr__input"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Comunidad, contacto, notas…"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="sa-qr__filter-label" htmlFor="sa-qr-status">
                    Estado
                  </label>
                  <select
                    id="sa-qr-status"
                    className="sa-qr__input"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    {STATUS_FILTERS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sa-qr__filters-actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => void load()}
                    disabled={loading}
                  >
                    Actualizar
                  </button>
                </div>
              </div>

              {error ? (
                <p className="admin-banner-error" role="alert">
                  {error}
                </p>
              ) : null}

              {!loading && !error ? (
                <p className="sa-qr__count">
                  {filtered.length === rows.length
                    ? `${rows.length} solicitud${rows.length === 1 ? '' : 'es'}`
                    : `${filtered.length} de ${rows.length} solicitudes`}
                </p>
              ) : null}

              {loading ? (
                <p className="sa-qr__empty">Cargando…</p>
              ) : !error && rows.length === 0 ? (
                <div className="sa-qr__empty">
                  <p className="sa-qr__empty-title">Aún no hay solicitudes de oferta</p>
                  <p>Las enviadas desde la web o la app aparecerán aquí.</p>
                </div>
              ) : !error && filtered.length === 0 ? (
                <div className="sa-qr__empty">
                  <p className="sa-qr__empty-title">No hay solicitudes con estos filtros</p>
                  <p>Prueba otro estado o limpia la búsqueda.</p>
                </div>
              ) : !error ? (
                <div className="sa-qr__rows">
                  {filtered.map((r) => (
                    <SuperAdminQuoteRow
                      key={r.id}
                      row={r}
                      selected={detailId === r.id}
                      onOpenDetail={() => setDetailId(r.id)}
                    />
                  ))}
                </div>
              ) : null}
            </section>

            {detailRow ? (
              <SuperAdminQuoteDetail
                row={detailRow}
                onClose={() => setDetailId(null)}
                onPatchStatus={patchStatus}
                onPrev={detailNavIndex > 0 ? goPrevDetail : null}
                onNext={
                  detailNavIndex >= 0 && detailNavIndex < filtered.length - 1 ? goNextDetail : null
                }
                navIndex={Math.max(0, detailNavIndex)}
                navTotal={filtered.length}
              />
            ) : null}
          </div>
        </div>
      </main>
    </SuperAdminShell>
  )
}
