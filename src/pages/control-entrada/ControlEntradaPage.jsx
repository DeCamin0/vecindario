import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useDialog } from '../../context/DialogContext'
import { apiUrl, jsonAuthHeaders } from '../../config/api.js'
import { canWriteControlEntrada } from './controlEntradaRoles.js'
import './control-entrada.css'

const MONTHS_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

function localYmd(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function timeInputFromMinute(min) {
  const h = Math.floor(min / 60)
  const mi = min % 60
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}

function minuteFromTimeInput(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim())
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h > 23 || mi > 59) return null
  return h * 60 + mi
}

function formatEntryDate(ymd) {
  try {
    const [y, m, d] = ymd.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('es-ES', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return ymd
  }
}

function formatEditedAt(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

const emptyForm = () => {
  const now = new Date()
  return {
    entryDate: localYmd(now),
    nombre: '',
    identificacion: '',
    horaEntrada: timeInputFromMinute(now.getHours() * 60 + now.getMinutes()),
    horaSalida: '',
    ubicacion: '',
    motivo: '',
  }
}

export default function ControlEntradaPage() {
  const { accessToken, communityId, communityAccessCode, controlEntradaAccess } = useAuth()
  const { confirm } = useDialog()
  const canWrite = canWriteControlEntrada(controlEntradaAccess)

  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [detailId, setDetailId] = useState(null)
  const [mode, setMode] = useState('month')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchEntries, setSearchEntries] = useState([])
  const [searchTruncated, setSearchTruncated] = useState(false)
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [searchHint, setSearchHint] = useState('')

  const monthKey = `${monthCursor.y}-${String(monthCursor.m + 1).padStart(2, '0')}`

  const queryBase = useCallback(() => {
    const q = new URLSearchParams({ communityId: String(communityId) })
    const ac = communityAccessCode?.trim()
    if (ac) q.set('accessCode', ac.toUpperCase())
    return q
  }, [communityId, communityAccessCode])

  const loadMonth = useCallback(async () => {
    if (!accessToken || communityId == null) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const q = queryBase()
      q.set('month', monthKey)
      const res = await fetch(apiUrl(`/api/community/control-entrada?${q}`), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
      setEntries(Array.isArray(data.entries) ? data.entries : [])
    } catch (e) {
      setEntries([])
      setError(e.message || 'No se pudo cargar el registro')
    } finally {
      setLoading(false)
    }
  }, [accessToken, communityId, monthKey, queryBase])

  const loadSearch = useCallback(
    async (rawQ) => {
      if (!accessToken || communityId == null) {
        setLoadingSearch(false)
        return
      }
      const qText = String(rawQ || '').trim()
      if (qText.length < 2) {
        setSearchQuery('')
        setSearchEntries([])
        setSearchTruncated(false)
        setSearchError('')
        setSearchHint('Escribe al menos 2 caracteres para buscar en todo el historial.')
        setLoadingSearch(false)
        return
      }
      setLoadingSearch(true)
      setSearchError('')
      setSearchHint('')
      setSearchQuery(qText)
      try {
        const q = queryBase()
        q.set('q', qText)
        const res = await fetch(apiUrl(`/api/community/control-entrada?${q}`), {
          headers: jsonAuthHeaders(accessToken),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
        setSearchEntries(Array.isArray(data.entries) ? data.entries : [])
        setSearchTruncated(Boolean(data.truncated))
      } catch (e) {
        setSearchEntries([])
        setSearchTruncated(false)
        setSearchError(e.message || 'No se pudo buscar')
      } finally {
        setLoadingSearch(false)
      }
    },
    [accessToken, communityId, queryBase],
  )

  useEffect(() => {
    if (mode !== 'month') return
    void loadMonth()
    setDetailId(null)
  }, [mode, loadMonth])

  useEffect(() => {
    if (mode !== 'search') return
    const qText = searchInput.trim()
    if (qText.length < 2) {
      setSearchQuery('')
      setSearchEntries([])
      setSearchTruncated(false)
      setSearchError('')
      setLoadingSearch(false)
      setSearchHint(
        qText.length === 0
          ? 'Escribe para buscar en todo el historial. Los resultados aparecen al teclear.'
          : 'Escribe al menos 2 caracteres para buscar en todo el historial.',
      )
      return
    }
    setSearchHint('')
    const timer = setTimeout(() => {
      void loadSearch(searchInput)
    }, 300)
    return () => clearTimeout(timer)
  }, [mode, searchInput, loadSearch])

  const jumpToEntry = (entry) => {
    if (!entry?.entryDate) return
    const [y, m] = entry.entryDate.split('-').map(Number)
    setMonthCursor({ y, m: m - 1 })
    setDetailId(entry.id)
    setMode('month')
    setError('')
  }

  const runSearch = (e) => {
    e?.preventDefault?.()
    void loadSearch(searchInput)
  }

  const openPendingCount = useMemo(
    () => entries.filter((e) => e.horaSalidaMinute == null).length,
    [entries],
  )

  const detailEntry = useMemo(
    () => (detailId == null ? null : entries.find((e) => e.id === detailId) || null),
    [detailId, entries],
  )

  const resetForm = () => {
    setEditingId(null)
    setForm(emptyForm())
    setFormOpen(false)
  }

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm())
    setFormOpen(true)
  }

  const openEdit = (entry) => {
    if (!canWrite) return
    setEditingId(entry.id)
    setForm({
      entryDate: entry.entryDate,
      nombre: entry.nombre || '',
      identificacion: entry.identificacion || '',
      horaEntrada: entry.horaEntradaLabel || timeInputFromMinute(entry.horaEntradaMinute),
      horaSalida: entry.horaSalidaLabel || '',
      ubicacion: entry.ubicacion || '',
      motivo: entry.motivo || '',
    })
    setFormOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canWrite || submitting) return
    const horaEntradaMinute = minuteFromTimeInput(form.horaEntrada)
    if (horaEntradaMinute == null) {
      setError('Indica una hora de entrada válida (HH:MM).')
      return
    }
    let horaSalidaMinute = null
    if (form.horaSalida.trim()) {
      horaSalidaMinute = minuteFromTimeInput(form.horaSalida)
      if (horaSalidaMinute == null) {
        setError('Indica una hora de salida válida (HH:MM) o déjala vacía.')
        return
      }
    }
    const nombre = form.nombre.trim()
    const identificacion = form.identificacion.trim()
    const ubicacion = form.ubicacion.trim()
    if (!nombre || !identificacion || !ubicacion) {
      setError('Nombre, identificación y ubicación son obligatorios.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const body = {
        communityId,
        entryDate: form.entryDate,
        nombre,
        identificacion,
        horaEntradaMinute,
        horaSalidaMinute,
        ubicacion,
        motivo: form.motivo.trim(),
      }
      const ac = communityAccessCode?.trim()
      if (ac) body.accessCode = ac.toUpperCase()

      const url = editingId
        ? apiUrl(`/api/community/control-entrada/${editingId}`)
        : apiUrl('/api/community/control-entrada')
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
      resetForm()
      await loadMonth()
    } catch (err) {
      setError(err.message || 'No se pudo guardar')
    } finally {
      setSubmitting(false)
    }
  }

  const markSalida = async (entry) => {
    if (!canWrite) return
    const now = new Date()
    const horaSalidaMinute = now.getHours() * 60 + now.getMinutes()
    setError('')
    try {
      const body = {
        communityId,
        horaSalidaMinute,
      }
      const ac = communityAccessCode?.trim()
      if (ac) body.accessCode = ac.toUpperCase()
      const res = await fetch(apiUrl(`/api/community/control-entrada/${entry.id}`), {
        method: 'PATCH',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
      await loadMonth()
    } catch (err) {
      setError(err.message || 'No se pudo marcar la salida')
    }
  }

  const handleDelete = async (entry) => {
    if (!canWrite) return
    const ok = await confirm({
      title: 'Eliminar registro',
      message: `¿Eliminar la entrada de ${entry.nombre}? No se puede deshacer.`,
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (!ok) return
    setError('')
    try {
      const q = queryBase()
      const res = await fetch(apiUrl(`/api/community/control-entrada/${entry.id}?${q}`), {
        method: 'DELETE',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({
          communityId,
          ...(communityAccessCode?.trim()
            ? { accessCode: communityAccessCode.trim().toUpperCase() }
            : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
      if (editingId === entry.id) resetForm()
      if (detailId === entry.id) setDetailId(null)
      await loadMonth()
    } catch (err) {
      setError(err.message || 'No se pudo eliminar')
    }
  }

  const shiftMonth = (delta) => {
    setMonthCursor((prev) => {
      let m = prev.m + delta
      let y = prev.y
      if (m < 0) {
        m = 11
        y -= 1
      }
      if (m > 11) {
        m = 0
        y += 1
      }
      return { y, m }
    })
  }

  return (
    <div className="page-container ce-page">
      <header className="ce-hero">
        <div className="ce-hero-top">
          <span className="ce-hero-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
          </span>
          <div className="ce-hero-text">
            <h1 className="page-title">Control de entrada</h1>
            <p className="page-subtitle">
              {canWrite
                ? 'Registro de entrada y salida de personas en la comunidad.'
                : 'Consulta del registro de entrada y salida (solo lectura).'}
            </p>
            <span className={`ce-role-badge ${canWrite ? '' : 'ce-role-badge--read'}`}>
              {canWrite ? 'Conserjería — edición' : 'Solo lectura'}
            </span>
          </div>
        </div>
      </header>

      <div className="ce-mode-tabs" role="tablist" aria-label="Vista del control de entrada">
        <button
          type="button"
          role="tab"
          id="ce-tab-month"
          aria-selected={mode === 'month'}
          aria-controls="ce-panel-month"
          className={`ce-mode-tab ${mode === 'month' ? 'ce-mode-tab--active' : ''}`}
          onClick={() => setMode('month')}
        >
          Mes
        </button>
        <button
          type="button"
          role="tab"
          id="ce-tab-search"
          aria-selected={mode === 'search'}
          aria-controls="ce-panel-search"
          className={`ce-mode-tab ${mode === 'search' ? 'ce-mode-tab--active' : ''}`}
          onClick={() => setMode('search')}
        >
          Buscar
        </button>
      </div>

      {mode === 'search' ? (
        <div id="ce-panel-search" role="tabpanel" aria-labelledby="ce-tab-search" className="ce-search-panel">
          <form className="ce-search-form" onSubmit={runSearch}>
            <label className="ce-sr-only" htmlFor="ce-search-q">
              Buscar en el registro
            </label>
            <input
              id="ce-search-q"
              type="search"
              className="auth-input ce-search-input"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Nombre, identificación, ubicación, motivo…"
              autoComplete="off"
              enterKeyHint="search"
            />
            <button type="submit" className="btn btn--primary ce-search-btn" disabled={loadingSearch}>
              {loadingSearch ? 'Buscando…' : 'Buscar'}
            </button>
          </form>

          {searchError ? (
            <p className="auth-error ce-error" role="alert">
              {searchError}
            </p>
          ) : null}

          {loadingSearch ? (
            <p className="ce-loading" aria-live="polite">
              Buscando registros…
            </p>
          ) : searchQuery && searchEntries.length === 0 && !searchError ? (
            <div className="ce-empty" role="status">
              <p className="ce-empty-title">Sin resultados</p>
              <p className="ce-empty-text">
                No hay registros que contengan «{searchQuery}». Prueba con otras palabras.
              </p>
            </div>
          ) : searchEntries.length > 0 ? (
            <>
              <h2 className="ce-section-title">
                {searchEntries.length} resultado{searchEntries.length === 1 ? '' : 's'}
                {searchTruncated ? ' (mostrando los 50 más recientes)' : ''}
              </h2>
              <ul className="ce-cards ce-search-cards">
                {searchEntries.map((entry) => (
                  <li key={entry.id}>
                    <button type="button" className="ce-card ce-search-result" onClick={() => jumpToEntry(entry)}>
                      <div className="ce-card-head">
                        <strong>{entry.nombre}</strong>
                        <span className="ce-date-pill">{formatEntryDate(entry.entryDate)}</span>
                      </div>
                      <p className="ce-card-meta">
                        {entry.identificacion} · {entry.ubicacion}
                      </p>
                      <div className="ce-card-times">
                        <span className="ce-time">Entrada {entry.horaEntradaLabel}</span>
                        {entry.horaSalidaLabel ? (
                          <span className="ce-time">Salida {entry.horaSalidaLabel}</span>
                        ) : (
                          <span className="ce-chip ce-chip--warn ce-chip--sm">Sin salida</span>
                        )}
                      </div>
                      {entry.motivo ? <p className="ce-card-motivo">{entry.motivo}</p> : null}
                      <span className="ce-card-tap">Ver en el mes →</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : !searchError ? (
            <p className="ce-search-hint" role="status">
              {searchHint ||
                'Escribe para buscar. Los resultados aparecen al teclear.'}
            </p>
          ) : null}
        </div>
      ) : (
        <div id="ce-panel-month" role="tabpanel" aria-labelledby="ce-tab-month">
      <section className="ce-toolbar" aria-label="Mes del registro">
        <div className="ce-toolbar-month">
          <button type="button" className="ce-month-btn" onClick={() => shiftMonth(-1)} aria-label="Mes anterior">
            ←
          </button>
          <h2 className="ce-month-title">
            {MONTHS_ES[monthCursor.m]} {monthCursor.y}
          </h2>
          <button type="button" className="ce-month-btn" onClick={() => shiftMonth(1)} aria-label="Mes siguiente">
            →
          </button>
        </div>
        <div className="ce-toolbar-actions">
          <button
            type="button"
            className="ce-today-btn"
            onClick={() => {
              const n = new Date()
              setMonthCursor({ y: n.getFullYear(), m: n.getMonth() })
            }}
          >
            Mes actual
          </button>
          {canWrite && !formOpen ? (
            <button type="button" className="btn btn--primary ce-new-btn" onClick={openCreate}>
              + Nueva entrada
            </button>
          ) : null}
        </div>
      </section>

      {formOpen && canWrite ? (
        <form className="ce-form-panel" onSubmit={(ev) => void handleSubmit(ev)}>
          <h2 className="ce-form-title">{editingId ? 'Editar registro' : 'Nueva entrada'}</h2>
          <div className="ce-form-grid">
            <label className="form-label" htmlFor="ce-date">
              Fecha
            </label>
            <input
              id="ce-date"
              type="date"
              className="auth-input"
              value={form.entryDate}
              onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))}
              required
            />
            <label className="form-label" htmlFor="ce-nombre">
              Nombre
            </label>
            <input
              id="ce-nombre"
              className="auth-input"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              required
            />
            <label className="form-label" htmlFor="ce-id">
              Identificación
            </label>
            <input
              id="ce-id"
              className="auth-input"
              value={form.identificacion}
              onChange={(e) => setForm((f) => ({ ...f, identificacion: e.target.value }))}
              placeholder="Empresa, rol…"
              required
            />
            <label className="form-label" htmlFor="ce-he">
              Hora entrada
            </label>
            <input
              id="ce-he"
              type="time"
              className="auth-input"
              value={form.horaEntrada}
              onChange={(e) => setForm((f) => ({ ...f, horaEntrada: e.target.value }))}
              required
            />
            <label className="form-label" htmlFor="ce-hs">
              Hora salida
            </label>
            <input
              id="ce-hs"
              type="time"
              className="auth-input"
              value={form.horaSalida}
              onChange={(e) => setForm((f) => ({ ...f, horaSalida: e.target.value }))}
            />
            <label className="form-label" htmlFor="ce-ubi">
              Ubicación
            </label>
            <input
              id="ce-ubi"
              className="auth-input"
              value={form.ubicacion}
              onChange={(e) => setForm((f) => ({ ...f, ubicacion: e.target.value }))}
              required
            />
            <label className="form-label" htmlFor="ce-mot">
              Motivo / observaciones
            </label>
            <textarea
              id="ce-mot"
              className="auth-input"
              rows={3}
              value={form.motivo}
              onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))}
            />
          </div>
          <div className="ce-form-actions">
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={resetForm} disabled={submitting}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="auth-error ce-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="ce-loading" aria-live="polite">
          Cargando registro…
        </p>
      ) : entries.length === 0 ? (
        <div className="ce-empty" role="status">
          <div className="ce-empty-icon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
          </div>
          <p className="ce-empty-title">Sin registros este mes</p>
          <p className="ce-empty-text">
            {canWrite
              ? 'Pulsa «Nueva entrada» para registrar la primera persona.'
              : 'Aún no hay entradas registradas en este mes.'}
          </p>
        </div>
      ) : (
        <div className="ce-list-block">
          <div className="ce-list-header">
            <h2 className="ce-section-title">
              {entries.length} registro{entries.length === 1 ? '' : 's'}
            </h2>
            {openPendingCount > 0 ? (
              <span className="ce-chip ce-chip--warn">{openPendingCount} sin salida</span>
            ) : (
              <span className="ce-chip ce-chip--ok">Todo cerrado</span>
            )}
          </div>

          <div className="ce-table-wrap ce-desktop-only">
            <table className="ce-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Nombre</th>
                  <th>Identificación</th>
                  <th>Entrada</th>
                  <th>Ubicación</th>
                  <th>Motivo</th>
                  <th>Salida</th>
                  {canWrite ? <th>Acciones</th> : null}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={[
                      entry.horaSalidaMinute == null ? 'ce-row--open' : '',
                      detailId === entry.id ? 'ce-row--selected' : '',
                      'ce-row--clickable',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setDetailId(entry.id)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault()
                        setDetailId(entry.id)
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-expanded={detailId === entry.id}
                  >
                    <td>
                      <span className="ce-date-pill">{formatEntryDate(entry.entryDate)}</span>
                    </td>
                    <td className="ce-cell-strong">{entry.nombre}</td>
                    <td>{entry.identificacion}</td>
                    <td>
                      <span className="ce-time">{entry.horaEntradaLabel}</span>
                    </td>
                    <td>{entry.ubicacion}</td>
                    <td className="ce-cell-motivo">{entry.motivo || '—'}</td>
                    <td>
                      {entry.horaSalidaLabel ? (
                        <span className="ce-time">{entry.horaSalidaLabel}</span>
                      ) : (
                        <span className="ce-chip ce-chip--warn ce-chip--sm">En interior</span>
                      )}
                    </td>
                    {canWrite ? (
                      <td className="ce-actions" onClick={(ev) => ev.stopPropagation()}>
                        {entry.horaSalidaMinute == null ? (
                          <button
                            type="button"
                            className="ce-action ce-action--primary"
                            onClick={() => void markSalida(entry)}
                          >
                            Marcar salida
                          </button>
                        ) : null}
                        <button type="button" className="ce-action" onClick={() => openEdit(entry)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className="ce-action ce-action--danger"
                          onClick={() => void handleDelete(entry)}
                        >
                          Eliminar
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {detailEntry ? (
            <aside className="ce-detail ce-desktop-only" aria-label="Detalle del registro">
              <div className="ce-detail-head">
                <div>
                  <p className="ce-detail-kicker">Detalle del registro</p>
                  <h3 className="ce-detail-title">{detailEntry.nombre}</h3>
                </div>
                <button type="button" className="ce-action" onClick={() => setDetailId(null)}>
                  Cerrar
                </button>
              </div>
              <dl className="ce-detail-grid">
                <div>
                  <dt>Fecha</dt>
                  <dd>{formatEntryDate(detailEntry.entryDate)}</dd>
                </div>
                <div>
                  <dt>Identificación</dt>
                  <dd>{detailEntry.identificacion}</dd>
                </div>
                <div>
                  <dt>Ubicación</dt>
                  <dd>{detailEntry.ubicacion}</dd>
                </div>
                <div>
                  <dt>Motivo</dt>
                  <dd>{detailEntry.motivo || '—'}</dd>
                </div>
                <div>
                  <dt>Entrada</dt>
                  <dd>
                    <span className="ce-time">{detailEntry.horaEntradaLabel}</span>
                    <span className="ce-detail-by">
                      Registrada por {detailEntry.createdByName || '—'}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Salida</dt>
                  <dd>
                    {detailEntry.horaSalidaLabel ? (
                      <>
                        <span className="ce-time">{detailEntry.horaSalidaLabel}</span>
                        <span className="ce-detail-by">
                          Marcada por {detailEntry.salidaByName || '—'}
                        </span>
                      </>
                    ) : (
                      <span className="ce-chip ce-chip--warn ce-chip--sm">Aún en interior</span>
                    )}
                  </dd>
                </div>
                {detailEntry.updatedByName ? (
                  <div>
                    <dt>Última edición</dt>
                    <dd>
                      <span className="ce-detail-by">
                        {detailEntry.updatedByName}
                        {detailEntry.updatedAt
                          ? ` · ${formatEditedAt(detailEntry.updatedAt)}`
                          : ''}
                      </span>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </aside>
          ) : (
            <p className="ce-detail-hint">Pulsa un registro para ver quién lo registró o editó.</p>
          )}

          <ul className="ce-cards ce-mobile-only" aria-label="Registros">
            {entries.map((entry) => (
              <li
                key={`card-${entry.id}`}
                className={`ce-card ${entry.horaSalidaMinute == null ? 'ce-card--open' : ''} ${
                  detailId === entry.id ? 'ce-card--selected' : ''
                }`}
              >
                <button
                  type="button"
                  className="ce-card-main"
                  onClick={() => setDetailId(detailId === entry.id ? null : entry.id)}
                >
                  <div className="ce-card-head">
                    <strong>{entry.nombre}</strong>
                    <span className="ce-date-pill">{formatEntryDate(entry.entryDate)}</span>
                  </div>
                  <p className="ce-card-meta">
                    {entry.identificacion} · {entry.ubicacion}
                  </p>
                  <div className="ce-card-times">
                    <span className="ce-time">Entrada {entry.horaEntradaLabel}</span>
                    {entry.horaSalidaLabel ? (
                      <span className="ce-time">Salida {entry.horaSalidaLabel}</span>
                    ) : (
                      <span className="ce-chip ce-chip--warn ce-chip--sm">Sin salida</span>
                    )}
                  </div>
                  {entry.motivo ? <p className="ce-card-motivo">{entry.motivo}</p> : null}
                  {detailId === entry.id ? (
                    <div className="ce-card-audit">
                      <p>
                        Entrada registrada por <strong>{entry.createdByName || '—'}</strong>
                      </p>
                      <p>
                        {entry.horaSalidaLabel
                          ? <>Salida marcada por <strong>{entry.salidaByName || '—'}</strong></>
                          : 'Aún sin salida'}
                      </p>
                      {entry.updatedByName ? (
                        <p>
                          Última edición por <strong>{entry.updatedByName}</strong>
                          {entry.updatedAt ? <> · {formatEditedAt(entry.updatedAt)}</> : null}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <span className="ce-card-tap">Ver quién registró →</span>
                  )}
                </button>
                {canWrite ? (
                  <div className="ce-actions">
                    {entry.horaSalidaMinute == null ? (
                      <button
                        type="button"
                        className="ce-action ce-action--primary"
                        onClick={() => void markSalida(entry)}
                      >
                        Marcar salida
                      </button>
                    ) : null}
                    <button type="button" className="ce-action" onClick={() => openEdit(entry)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="ce-action ce-action--danger"
                      onClick={() => void handleDelete(entry)}
                    >
                      Eliminar
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
        </div>
      )}
    </div>
  )
}
