/**
 * Super Admin — inbox Soporte / Tickets.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import NotificationsBell from '../components/NotificationsBell'
import SuperAdminShell from '../components/super-admin/SuperAdminShell.jsx'
import { buildSaNavItems } from '../components/super-admin/superAdminNav.js'
import {
  formatSupportWhen,
  supportAreaLabel,
  supportPriorityLabel,
  supportStatusLabel,
  SUPPORT_AREA_LABELS,
  SUPPORT_PRIORITY_LABELS,
  SUPPORT_STATUS_LABELS,
} from '../lib/supportLabels.js'
import './Admin.css'
import '../components/super-admin/SuperAdminShell.css'
import '../components/super-admin/SuperAdminServices.css'
import './AdminSupport.css'

export default function AdminSupport() {
  const { accessToken, userRole } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const isFullSuperAdmin = userRole === 'super_admin'
  const [unreadCount, setUnreadCount] = useState(0)
  const saNavItems = useMemo(() => {
    const items = buildSaNavItems(isFullSuperAdmin)
    if (unreadCount < 1) return items
    return items.map((i) =>
      i.id === 'soporte' ? { ...i, label: `Soporte (${unreadCount})` } : i,
    )
  }, [isFullSuperAdmin, unreadCount])

  const [items, setItems] = useState([])
  const [summary, setSummary] = useState({
    open: 0,
    inProgress: 0,
    waitingUser: 0,
  })
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [area, setArea] = useState('')
  const [communityId, setCommunityId] = useState('')
  const [q, setQ] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)

  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const loadList = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setErr('')
    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (priority) params.set('priority', priority)
      if (area) params.set('area', area)
      if (communityId.trim()) params.set('communityId', communityId.trim())
      if (q.trim()) params.set('q', q.trim())
      if (unreadOnly) params.set('unreadOnly', '1')
      const qs = params.toString()
      const [listRes, countRes, allRes] = await Promise.all([
        fetch(apiUrl(`/api/admin/support/tickets${qs ? `?${qs}` : ''}`), {
          headers: jsonAuthHeaders(accessToken),
        }),
        fetch(apiUrl('/api/admin/support/unread-count'), {
          headers: jsonAuthHeaders(accessToken),
        }),
        fetch(apiUrl('/api/admin/support/tickets'), {
          headers: jsonAuthHeaders(accessToken),
        }),
      ])
      const listData = await listRes.json().catch(() => ({}))
      const countData = await countRes.json().catch(() => ({}))
      const allData = await allRes.json().catch(() => ({}))
      if (!listRes.ok) throw new Error(listData.error || 'Error al cargar')
      setItems(Array.isArray(listData.items) ? listData.items : [])
      if (countRes.ok) setUnreadCount(Number(countData.count) || 0)
      const allItems = Array.isArray(allData.items) ? allData.items : []
      setSummary({
        open: allItems.filter((t) => t.status === 'open').length,
        inProgress: allItems.filter((t) => t.status === 'in_progress').length,
        waitingUser: allItems.filter((t) => t.status === 'waiting_user').length,
      })
    } catch (e) {
      setErr(e.message || 'Error')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [accessToken, status, priority, area, communityId, q, unreadOnly])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const openDetail = useCallback(
    async (id) => {
      if (!accessToken) return
      setSelectedId(id)
      setDetailLoading(true)
      setDraft('')
      try {
        const res = await fetch(apiUrl(`/api/admin/support/tickets/${id}`), {
          headers: jsonAuthHeaders(accessToken),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Error')
        setDetail(data)
        void loadList()
      } catch (e) {
        setErr(e.message || 'Error')
        setDetail(null)
      } finally {
        setDetailLoading(false)
      }
    },
    [accessToken, loadList],
  )

  const ticketFromUrl = searchParams.get('ticket')

  useEffect(() => {
    if (!ticketFromUrl || !accessToken) return
    const id = Number.parseInt(ticketFromUrl, 10)
    if (!Number.isInteger(id) || id < 1) return
    void openDetail(id)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('ticket')
        return next
      },
      { replace: true },
    )
  }, [accessToken, ticketFromUrl, openDetail, setSearchParams])

  const closeDetail = () => {
    setSelectedId(null)
    setDetail(null)
  }

  async function sendReply(e) {
    e.preventDefault()
    if (!selectedId || !draft.trim()) return
    setBusy(true)
    try {
      const res = await fetch(apiUrl(`/api/admin/support/tickets/${selectedId}/messages`), {
        method: 'POST',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({ body: draft }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error')
      setDetail(data)
      setDraft('')
      void loadList()
    } catch (ex) {
      setErr(ex.message || 'Error')
    } finally {
      setBusy(false)
    }
  }

  async function patchTicket(patch) {
    if (!selectedId) return
    setBusy(true)
    try {
      const res = await fetch(apiUrl(`/api/admin/support/tickets/${selectedId}`), {
        method: 'PATCH',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error')
      setDetail(data)
      void loadList()
    } catch (ex) {
      setErr(ex.message || 'Error')
    } finally {
      setBusy(false)
    }
  }

  if (!isFullSuperAdmin) {
    return (
      <SuperAdminShell
        badgeLabel="Super administrador"
        title="Soporte"
        subtitle="Solo super administrador"
        navItems={saNavItems}
        activeNavId="soporte"
      >
        <p className="admin-banner-error">No tienes acceso a esta sección.</p>
      </SuperAdminShell>
    )
  }

  return (
    <SuperAdminShell
      badgeLabel="Super administrador"
      title="Soporte"
      subtitle="Gestión de solicitudes de soporte"
      navItems={saNavItems}
      activeNavId="soporte"
      headerActions={<NotificationsBell variant="admin" />}
    >
      {err ? <p className="admin-banner-error">{err}</p> : null}

      <section className="sa-support-summary" aria-label="Resumen de soporte">
        <div className="sa-support-summary__card">
          <span className="sa-support-summary__label">Abiertos</span>
          <strong className="sa-support-summary__value">{summary.open}</strong>
        </div>
        <div className="sa-support-summary__card">
          <span className="sa-support-summary__label">En proceso</span>
          <strong className="sa-support-summary__value">{summary.inProgress}</strong>
        </div>
        <div className="sa-support-summary__card">
          <span className="sa-support-summary__label">Esperando usuario</span>
          <strong className="sa-support-summary__value">{summary.waitingUser}</strong>
        </div>
        <div className="sa-support-summary__card sa-support-summary__card--accent">
          <span className="sa-support-summary__label">Sin leer</span>
          <strong className="sa-support-summary__value">{unreadCount}</strong>
        </div>
      </section>

      <div className="sa-support-toolbar">
        <div className="sa-support-toolbar__row">
          <label className="sa-support-field sa-support-field--grow">
            <span>Búsqueda</span>
            <input
              type="search"
              placeholder="Asunto, email o nombre…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <label className="sa-support-field">
            <span>Estado</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(SUPPORT_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="sa-support-field">
            <span>Prioridad</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(SUPPORT_PRIORITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="sa-support-field">
            <span>Área</span>
            <select value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(SUPPORT_AREA_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="sa-support-field">
            <span>Comunidad</span>
            <input
              type="number"
              min="1"
              placeholder="ID"
              value={communityId}
              onChange={(e) => setCommunityId(e.target.value)}
            />
          </label>
        </div>
        <div className="sa-support-toolbar__actions">
          <label className="sa-support-check">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            Solo no leídos
          </label>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void loadList()}>
            Actualizar
          </button>
        </div>
      </div>

      {loading ? <p className="sa-support-muted">Cargando…</p> : null}

      {!loading && items.length === 0 ? (
        <div className="sa-support-empty">
          <p className="sa-support-empty__title">No hay tickets con estos filtros</p>
          <p className="sa-support-empty__hint">
            Prueba a quitar algún filtro o espera nuevas solicitudes de personal y administración.
          </p>
        </div>
      ) : (
        <ul className="sa-support-list">
          {items.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className={`sa-support-row${t.unread ? ' is-unread' : ''}${
                  selectedId === t.id ? ' is-on' : ''
                }`}
                onClick={() => void openDetail(t.id)}
              >
                <span className="sa-support-row__title">
                  #{t.id} · {t.subject}
                  {t.unread ? <span className="sa-support-dot" /> : null}
                </span>
                <span className="sa-support-row__meta">
                  {supportAreaLabel(t.area)} · {supportStatusLabel(t.status)} ·{' '}
                  {supportPriorityLabel(t.priority)} · {t.createdBy?.email || '—'} ·{' '}
                  {t.communityName || 'Sin comunidad'} · {formatSupportWhen(t.lastMessageAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedId != null ? (
        <div className="sa-support-drawer-backdrop" role="presentation" onClick={closeDetail}>
          <aside
            className="sa-support-drawer"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="sa-support-drawer__head">
              <div>
                <h2>Ticket #{selectedId}</h2>
                {detail ? <p>{detail.subject}</p> : null}
              </div>
              <button type="button" className="btn btn--ghost btn--sm" onClick={closeDetail}>
                Cerrar
              </button>
            </header>

            {detailLoading || !detail ? (
              <p className="sa-support-muted">Cargando detalle…</p>
            ) : (
              <>
                <div className="sa-support-meta">
                  <div>
                    <span>Usuario</span>
                    <strong>
                      {detail.createdBy?.name || '—'} · {detail.createdBy?.email || '—'}
                    </strong>
                  </div>
                  <div>
                    <span>Rol</span>
                    <strong>{detail.createdBy?.role || '—'}</strong>
                  </div>
                  <div>
                    <span>Comunidad</span>
                    <strong>
                      {detail.communityName || '—'}
                      {detail.communityId ? ` (#${detail.communityId})` : ''}
                    </strong>
                  </div>
                  <div>
                    <span>Área</span>
                    <strong>{supportAreaLabel(detail.area)}</strong>
                  </div>
                  <label>
                    <span>Estado</span>
                    <select
                      value={detail.status}
                      disabled={busy}
                      onChange={(e) => void patchTicket({ status: e.target.value })}
                    >
                      {Object.entries(SUPPORT_STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Prioridad</span>
                    <select
                      value={detail.priority}
                      disabled={busy}
                      onChange={(e) => void patchTicket({ priority: e.target.value })}
                    >
                      {Object.entries(SUPPORT_PRIORITY_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div>
                    <span>Creado</span>
                    <strong>{formatSupportWhen(detail.createdAt)}</strong>
                  </div>
                  <div>
                    <span>Último mensaje</span>
                    <strong>{formatSupportWhen(detail.lastMessageAt)}</strong>
                  </div>
                </div>

                <div className="sa-support-actions">
                  {detail.status !== 'closed' ? (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={busy}
                      onClick={() => void patchTicket({ status: 'closed' })}
                    >
                      Cerrar ticket
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      disabled={busy}
                      onClick={() => void patchTicket({ status: 'in_progress' })}
                    >
                      Reabrir
                    </button>
                  )}
                </div>

                <div className="sa-support-thread">
                  {(detail.messages || []).map((m) => (
                    <article
                      key={m.id}
                      className={`sa-support-msg${m.fromCreator ? ' is-user' : ' is-staff'}`}
                    >
                      <header>
                        <strong>{m.author?.name || m.author?.email || '—'}</strong>
                        <span>
                          {m.author?.role} · {formatSupportWhen(m.createdAt)}
                        </span>
                      </header>
                      <p>{m.body}</p>
                    </article>
                  ))}
                </div>

                <form className="sa-support-composer" onSubmit={sendReply}>
                  <textarea
                    rows={3}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Responder al usuario…"
                    required
                  />
                  <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
                    {busy ? 'Enviando…' : 'Enviar respuesta'}
                  </button>
                </form>
              </>
            )}
          </aside>
        </div>
      ) : null}
    </SuperAdminShell>
  )
}
