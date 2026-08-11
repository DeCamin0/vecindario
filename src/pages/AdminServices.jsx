import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import { SERVICE_CATEGORIES, SERVICE_STATUS_LABELS } from '../constants/serviceRequests.js'
import NotificationsBell from '../components/NotificationsBell'
import SuperAdminShell from '../components/super-admin/SuperAdminShell.jsx'
import SuperAdminServiceRow from '../components/super-admin/SuperAdminServiceRow.jsx'
import SuperAdminServiceDetail from '../components/super-admin/SuperAdminServiceDetail.jsx'
import { buildSaNavItems } from '../components/super-admin/superAdminNav.js'
import './Admin.css'
import '../components/super-admin/SuperAdminShell.css'
import '../components/super-admin/SuperAdminServices.css'
import './services/serviceRequestsPages.css'

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  ...Object.keys(SERVICE_STATUS_LABELS).map((k) => ({ value: k, label: SERVICE_STATUS_LABELS[k] })),
]

export default function AdminServices() {
  const { accessToken, userRole, user } = useAuth()
  const isFullSuperAdmin = userRole === 'super_admin'
  const isScopedServiceAdmin =
    userRole === 'company_admin' &&
    (user?.company?.scopedSuperAdmin === true || user?.company?.kind === 'prestacion_servicios')
  const saNavItems = useMemo(() => buildSaNavItems(isFullSuperAdmin), [isFullSuperAdmin])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [detailRow, setDetailRow] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [priceAmount, setPriceAmount] = useState('')
  const [priceAmountMax, setPriceAmountMax] = useState('')
  const [priceNote, setPriceNote] = useState('')
  const [providerName, setProviderName] = useState('')
  const [busy, setBusy] = useState(false)
  const [quoteMessages, setQuoteMessages] = useState([])
  const [quoteMsgDraft, setQuoteMsgDraft] = useState('')
  const [quoteMsgBusy, setQuoteMsgBusy] = useState(false)
  const [quoteMsgErr, setQuoteMsgErr] = useState('')

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setErr('')
    try {
      const q = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : ''
      const res = await fetch(apiUrl(`/api/services${q}`), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(data.error || 'Error al cargar')
        setItems([])
        return
      }
      setItems(Array.isArray(data) ? data : [])
    } catch {
      setErr('Error de red')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [accessToken, statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  const selectedRow = useMemo(
    () => items.find((x) => x.id === selected) ?? null,
    [items, selected],
  )

  useEffect(() => {
    if (!accessToken || !selected) {
      setDetailRow(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    void fetch(apiUrl(`/api/services/${selected}`), {
      headers: jsonAuthHeaders(accessToken),
    })
      .then((res) => res.json().catch(() => null))
      .then((data) => {
        if (!cancelled && data && data.id) setDetailRow(data)
        else if (!cancelled) setDetailRow(null)
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [accessToken, selected])

  const displayRow = detailRow && detailRow.id === selected ? detailRow : selectedRow

  useEffect(() => {
    if (!displayRow) {
      setPriceAmount('')
      setPriceAmountMax('')
      setPriceNote('')
      setProviderName('')
      return
    }
    setPriceAmount(displayRow.priceAmount != null ? String(displayRow.priceAmount) : '')
    setPriceAmountMax(displayRow.priceAmountMax != null ? String(displayRow.priceAmountMax) : '')
    setPriceNote(displayRow.priceNote || '')
    setProviderName(displayRow.providerName || '')
  }, [displayRow])

  const loadQuoteMessages = useCallback(async () => {
    if (!accessToken || !selected) {
      setQuoteMessages([])
      return
    }
    try {
      const res = await fetch(apiUrl(`/api/services/${selected}/messages`), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => null)
      setQuoteMessages(Array.isArray(data) ? data : [])
    } catch {
      setQuoteMessages([])
    }
  }, [accessToken, selected])

  useEffect(() => {
    setQuoteMsgDraft('')
    setQuoteMsgErr('')
    void loadQuoteMessages()
  }, [loadQuoteMessages])

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((row) => {
      const cat = SERVICE_CATEGORIES.find((c) => c.id === row.categoryId)?.name || ''
      const hay = [
        cat,
        row.communityName,
        String(row.communityId),
        row.requesterEmail,
        row.requesterName,
        row.description,
        row.serviceSubtypeLabel,
        row.providerName,
        String(row.id),
        SERVICE_STATUS_LABELS[row.status],
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [items, query])

  const selectedNavIndex = useMemo(() => {
    if (selected == null) return -1
    return filteredItems.findIndex((row) => row.id === selected)
  }, [filteredItems, selected])

  const goPrevDetail = useCallback(() => {
    if (selectedNavIndex <= 0) return
    setSelected(filteredItems[selectedNavIndex - 1].id)
  }, [filteredItems, selectedNavIndex])

  const goNextDetail = useCallback(() => {
    if (selectedNavIndex < 0 || selectedNavIndex >= filteredItems.length - 1) return
    setSelected(filteredItems[selectedNavIndex + 1].id)
  }, [filteredItems, selectedNavIndex])

  useEffect(() => {
    if (!displayRow) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setSelected(null)
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
  }, [displayRow, goPrevDetail, goNextDetail])

  const sendQuoteMessage = async () => {
    if (!accessToken || !selected || quoteMsgBusy || busy) return
    const text = quoteMsgDraft.trim()
    if (!text) return
    setQuoteMsgBusy(true)
    setQuoteMsgErr('')
    try {
      const res = await fetch(apiUrl(`/api/services/${selected}/messages`), {
        method: 'POST',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({ body: text }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setQuoteMsgErr(data.error || 'No se pudo enviar')
        return
      }
      setQuoteMsgDraft('')
      setQuoteMessages((prev) => [...prev, data])
    } catch {
      setQuoteMsgErr('Error de red')
    } finally {
      setQuoteMsgBusy(false)
    }
  }

  const sendPrice = async () => {
    if (!accessToken || !selected || busy) return
    const n = Number(priceAmount.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) {
      setErr('Precio mínimo no válido')
      return
    }
    const maxStr = priceAmountMax.trim()
    const maxNum = maxStr === '' ? undefined : Number(maxStr.replace(',', '.'))
    if (maxStr !== '' && (!Number.isFinite(maxNum) || maxNum < 0)) {
      setErr('Precio máximo no válido')
      return
    }
    if (maxStr !== '' && maxNum < n) {
      setErr('El máximo debe ser mayor o igual al mínimo')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const res = await fetch(apiUrl(`/api/services/${selected}/send-price`), {
        method: 'POST',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({
          priceAmount: n,
          priceAmountMax: maxStr === '' ? undefined : maxNum,
          priceNote: priceNote.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(data.error || 'Error')
        setBusy(false)
        return
      }
      setDetailRow(data)
      await load()
      setSelected(data.id)
    } catch {
      setErr('Error de red')
    } finally {
      setBusy(false)
    }
  }

  const assignProvider = async () => {
    if (!accessToken || !selected || busy) return
    const name = providerName.trim()
    if (!name) {
      setErr('Nombre de proveedor obligatorio')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const res = await fetch(apiUrl(`/api/services/${selected}/assign-provider`), {
        method: 'POST',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({ providerName: name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(data.error || 'Error')
        setBusy(false)
        return
      }
      setDetailRow(data)
      await load()
      setSelected(data.id)
    } catch {
      setErr('Error de red')
    } finally {
      setBusy(false)
    }
  }

  const markCompleted = async () => {
    if (!accessToken || !selected || busy) return
    setBusy(true)
    setErr('')
    try {
      const res = await fetch(apiUrl(`/api/services/${selected}/status`), {
        method: 'PATCH',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({ status: 'completed' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(data.error || 'Error')
        setBusy(false)
        return
      }
      setDetailRow(data)
      await load()
    } catch {
      setErr('Error de red')
    } finally {
      setBusy(false)
    }
  }

  const acceptPrice = async () => {
    if (!accessToken || !selected || busy) return
    setBusy(true)
    setErr('')
    try {
      const res = await fetch(apiUrl(`/api/services/${selected}/accept`), {
        method: 'POST',
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(data.error || 'No se pudo aceptar')
        setBusy(false)
        return
      }
      setDetailRow(data)
      await load()
      setSelected(data.id)
    } catch {
      setErr('Error de red')
    } finally {
      setBusy(false)
    }
  }

  const rejectPrice = async () => {
    if (!accessToken || !selected || busy) return
    setBusy(true)
    setErr('')
    try {
      const res = await fetch(apiUrl(`/api/services/${selected}/reject`), {
        method: 'POST',
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(data.error || 'No se pudo rechazar')
        setBusy(false)
        return
      }
      setDetailRow(data)
      await load()
      setSelected(data.id)
    } catch {
      setErr('Error de red')
    } finally {
      setBusy(false)
    }
  }

  const closeDetail = () => setSelected(null)

  const ACTIONABLE = useMemo(
    () => new Set(['pending_review', 'price_sent', 'accepted', 'in_progress']),
    [],
  )

  const goActionable = useCallback(() => {
    const next = filteredItems.find((row) => ACTIONABLE.has(row.status))
    if (next) setSelected(next.id)
  }, [filteredItems, ACTIONABLE])

  return (
    <SuperAdminShell
      badgeLabel={
        isScopedServiceAdmin
          ? user?.company?.name?.trim() || 'Prestador de servicios'
          : 'Super administrador'
      }
      isCompanyScoped={isScopedServiceAdmin}
      navItems={saNavItems}
      activeNavId="servicios"
      headerActions={<NotificationsBell variant="admin" />}
    >
      <main className="admin-dashboard-main">
        <div className="admin-dashboard-inner">
          <div className="sa-sv">
            <section>
              <div className="sa-sv__block-head sa-sv__block-head--row">
                <div>
                  <h2 className="sa-sv__block-title">Solicitudes de servicio</h2>
                  <p className="sa-sv__block-sub">
                    Presupuesto, asignación de proveedor y cierre. Misma lógica que antes.
                  </p>
                </div>
              </div>

              <div className="sa-sv__filters">
                <div className="sa-sv__search">
                  <label className="sa-sv__filter-label" htmlFor="sa-sv-search">
                    Buscar
                  </label>
                  <input
                    id="sa-sv-search"
                    className="sa-sv__input"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Comunidad, email, tipo, descripción…"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="sa-sv__filter-label" htmlFor="sa-sv-status">
                    Estado
                  </label>
                  <select
                    id="sa-sv-status"
                    className="sa-sv__input"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value || 'all'} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sa-sv__filters-actions">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => void load()}>
                    Actualizar
                  </button>
                </div>
              </div>

              {err ? (
                <p className="admin-banner-error" role="alert">
                  {err}
                </p>
              ) : null}

              {!loading ? (
                <p className="sa-sv__count">
                  {filteredItems.length === items.length
                    ? `${items.length} solicitud${items.length === 1 ? '' : 'es'}`
                    : `${filteredItems.length} de ${items.length} solicitudes`}
                </p>
              ) : null}

              {loading ? (
                <p className="sa-sv__empty">Cargando…</p>
              ) : items.length === 0 ? (
                <div className="sa-sv__empty">
                  <p className="sa-sv__empty-title">
                    {statusFilter
                      ? 'No hay solicitudes de servicio con este estado'
                      : 'No hay solicitudes de servicio pendientes'}
                  </p>
                  <p>Cuando un vecino envíe una solicitud aparecerá aquí.</p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="sa-sv__empty">
                  <p className="sa-sv__empty-title">No hay solicitudes con estos filtros</p>
                  <p>Prueba otra búsqueda o limpia el filtro de texto.</p>
                </div>
              ) : (
                <div className="sa-sv__rows">
                  {filteredItems.map((row) => (
                    <SuperAdminServiceRow
                      key={row.id}
                      row={row}
                      categories={SERVICE_CATEGORIES}
                      selected={selected === row.id}
                      onOpenDetail={() => setSelected(row.id)}
                    />
                  ))}
                </div>
              )}
            </section>

            {displayRow ? (
              <SuperAdminServiceDetail
                displayRow={displayRow}
                detailLoading={detailLoading}
                quoteMessages={quoteMessages}
                quoteMsgDraft={quoteMsgDraft}
                quoteMsgBusy={quoteMsgBusy}
                quoteMsgErr={quoteMsgErr}
                priceAmount={priceAmount}
                priceAmountMax={priceAmountMax}
                priceNote={priceNote}
                providerName={providerName}
                busy={busy}
                onClose={closeDetail}
                onPriceAmount={setPriceAmount}
                onPriceAmountMax={setPriceAmountMax}
                onPriceNote={setPriceNote}
                onProviderName={setProviderName}
                onQuoteMsgDraft={setQuoteMsgDraft}
                onSendQuoteMessage={sendQuoteMessage}
                onSendPrice={sendPrice}
                onAssignProvider={assignProvider}
                onMarkCompleted={markCompleted}
                onAcceptPrice={acceptPrice}
                onRejectPrice={rejectPrice}
                onPrev={selectedNavIndex > 0 ? goPrevDetail : null}
                onNext={
                  selectedNavIndex >= 0 && selectedNavIndex < filteredItems.length - 1
                    ? goNextDetail
                    : null
                }
                onGoActionable={
                  displayRow && !ACTIONABLE.has(displayRow.status) && filteredItems.some((r) => ACTIONABLE.has(r.status))
                    ? goActionable
                    : null
                }
                navIndex={Math.max(0, selectedNavIndex)}
                navTotal={filteredItems.length}
              />
            ) : null}
          </div>
        </div>
      </main>
    </SuperAdminShell>
  )
}
