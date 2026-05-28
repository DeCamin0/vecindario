import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useDialog } from '../../context/DialogContext'
import { apiUrl, jsonAuthHeaders } from '../../config/api.js'
import {
  canCreateCuadernoEntry,
  canMutateCuadernoEntry,
  canWriteCuadernoDiario,
} from './cuadernoDiarioRoles.js'
import './cuaderno-diario.css'

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

const WEEKDAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function localYmd(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseYmd(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate()
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

export default function CuadernoDiarioPage() {
  const { accessToken, communityId, communityAccessCode, cuadernoDiarioAccess, user } = useAuth()
  const { confirm } = useDialog()
  const today = localYmd()
  const [viewDate, setViewDate] = useState(today)
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [dayCounts, setDayCounts] = useState({})
  const [entries, setEntries] = useState([])
  const [loadingMonth, setLoadingMonth] = useState(true)
  const [loadingDay, setLoadingDay] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [timeValue, setTimeValue] = useState(timeInputFromMinute(new Date().getHours() * 60 + new Date().getMinutes()))
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const canWrite = canWriteCuadernoDiario(cuadernoDiarioAccess)
  const canCreateToday = canCreateCuadernoEntry({
    viewDateYmd: viewDate,
    todayYmd: today,
    canWrite,
  })
  const mutateCtx = { userId: user?.id, viewDateYmd: viewDate, todayYmd: today, canWrite }
  const monthKey = `${monthCursor.y}-${String(monthCursor.m + 1).padStart(2, '0')}`

  const queryBase = useCallback(() => {
    const q = new URLSearchParams({ communityId: String(communityId) })
    const ac = communityAccessCode?.trim()
    if (ac) q.set('accessCode', ac.toUpperCase())
    return q
  }, [communityId, communityAccessCode])

  const loadMonth = useCallback(async () => {
    if (!accessToken || communityId == null) {
      setLoadingMonth(false)
      return
    }
    setLoadingMonth(true)
    try {
      const q = queryBase()
      q.set('month', monthKey)
      const res = await fetch(apiUrl(`/api/community/diario?${q}`), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
      setDayCounts(data.dayCounts && typeof data.dayCounts === 'object' ? data.dayCounts : {})
    } catch (e) {
      setDayCounts({})
      setError(e.message || 'No se pudo cargar el calendario')
    } finally {
      setLoadingMonth(false)
    }
  }, [accessToken, communityId, monthKey, queryBase])

  const loadDay = useCallback(async () => {
    if (!accessToken || communityId == null) {
      setLoadingDay(false)
      return
    }
    setLoadingDay(true)
    setError('')
    try {
      const q = queryBase()
      q.set('date', viewDate)
      const res = await fetch(apiUrl(`/api/community/diario?${q}`), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
      setEntries(Array.isArray(data.entries) ? data.entries : [])
    } catch (e) {
      setEntries([])
      setError(e.message || 'No se pudieron cargar las anotaciones')
    } finally {
      setLoadingDay(false)
    }
  }, [accessToken, communityId, viewDate, queryBase])

  useEffect(() => {
    void loadMonth()
  }, [loadMonth])

  useEffect(() => {
    void loadDay()
  }, [loadDay])

  const dayStrip = useMemo(() => {
    const n = daysInMonth(monthCursor.y, monthCursor.m)
    const out = []
    for (let d = 1; d <= n; d++) {
      const key = `${monthCursor.y}-${String(monthCursor.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const date = parseYmd(key)
      out.push({
        key,
        day: WEEKDAYS_ES[date.getDay()],
        num: d,
        count: dayCounts[key] ?? 0,
      })
    }
    return out
  }, [monthCursor, dayCounts])

  const resetForm = () => {
    setEditingId(null)
    setDescription('')
    setTimeValue(timeInputFromMinute(new Date().getHours() * 60 + new Date().getMinutes()))
    setFormOpen(false)
  }

  const openCreate = () => {
    setEditingId(null)
    setDescription('')
    setTimeValue(timeInputFromMinute(new Date().getHours() * 60 + new Date().getMinutes()))
    setFormOpen(true)
  }

  const openEdit = (entry) => {
    if (!canMutateCuadernoEntry(entry, mutateCtx)) return
    setEditingId(entry.id)
    setDescription(entry.description || '')
    setTimeValue(entry.timeLabel || timeInputFromMinute(entry.startMinute))
    setFormOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canWrite || submitting) return
    const startMinute = minuteFromTimeInput(timeValue)
    if (startMinute == null) {
      setError('Indica una hora válida (HH:MM).')
      return
    }
    const desc = description.trim()
    if (!desc) {
      setError('Escribe la anotación.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const body = {
        communityId,
        startMinute,
        description: desc,
      }
      if (!editingId) {
        body.entryDate = today
      }
      const ac = communityAccessCode?.trim()
      if (ac) body.accessCode = ac.toUpperCase()

      const url = editingId
        ? apiUrl(`/api/community/diario/${editingId}`)
        : apiUrl('/api/community/diario')
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
      resetForm()
      await Promise.all([loadDay(), loadMonth()])
    } catch (err) {
      setError(err.message || 'No se pudo guardar')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (entry) => {
    if (!canMutateCuadernoEntry(entry, mutateCtx)) return
    const ok = await confirm({
      title: 'Eliminar anotación',
      message: '¿Eliminar esta anotación del cuaderno diario? No se puede deshacer.',
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (!ok) return
    const entryId = entry.id
    setError('')
    try {
      const q = queryBase()
      const res = await fetch(apiUrl(`/api/community/diario/${entryId}?${q}`), {
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
      if (editingId === entryId) resetForm()
      await Promise.all([loadDay(), loadMonth()])
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

  const selectedDateLabel = parseYmd(viewDate).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="page-container cd-page">
      <header className="cd-hero">
        <div className="cd-hero-top">
          <span className="cd-hero-icon" aria-hidden="true">
            📔
          </span>
          <div className="cd-hero-text">
            <h1 className="page-title">Cuaderno diario</h1>
            <p className="page-subtitle">
              {canWrite
                ? 'Registra las tareas y novedades del día en conserjería. La junta y la administración pueden consultar el historial por fecha.'
                : 'Consulta las anotaciones del conserje día a día (junta y administración, solo lectura).'}
            </p>
            <span className={`cd-role-badge ${canWrite ? '' : 'cd-role-badge--read'}`}>
              {canWrite ? 'Conserjería — edición' : 'Solo lectura'}
            </span>
          </div>
        </div>
      </header>

      <section className="cd-calendar-card" aria-label="Calendario del mes">
        <div className="cd-month-nav">
          <button
            type="button"
            className="cd-month-btn"
            onClick={() => shiftMonth(-1)}
            aria-label="Mes anterior"
          >
            ←
          </button>
          <h2 className="cd-month-title">
            {MONTHS_ES[monthCursor.m]} {monthCursor.y}
          </h2>
          <button
            type="button"
            className="cd-month-btn"
            onClick={() => shiftMonth(1)}
            aria-label="Mes siguiente"
          >
            →
          </button>
          <span className="cd-month-nav-spacer" aria-hidden="true" />
          <button
            type="button"
            className="cd-today-btn"
            onClick={() => {
              const n = new Date()
              setMonthCursor({ y: n.getFullYear(), m: n.getMonth() })
              setViewDate(today)
            }}
          >
            Hoy
          </button>
        </div>

        {loadingMonth ? (
          <p className="cd-calendar-loading" aria-live="polite">
            Cargando calendario…
          </p>
        ) : (
          <div className="cd-day-strip" role="group" aria-label="Días del mes">
            {dayStrip.map(({ key, day, num, count }) => (
              <button
                key={key}
                type="button"
                className={[
                  'cd-day-cell',
                  viewDate === key ? 'cd-day-cell--selected' : '',
                  key === today ? 'cd-day-cell--today' : '',
                  count > 0 ? 'cd-day-cell--has-notes' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setViewDate(key)}
                aria-pressed={viewDate === key}
                aria-label={`${day} ${num}, ${count} anotaciones`}
              >
                <span className="cd-day-cell-day">{day}</span>
                <span className="cd-day-cell-num">{num}</span>
                {count > 0 ? (
                  <span className="cd-day-cell-count">{count}</span>
                ) : (
                  <span className="cd-day-cell-count" aria-hidden="true">
                    {' '}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="cd-day-toolbar">
        <div>
          <p className="cd-day-toolbar-label">Día seleccionado</p>
          <strong className="cd-day-toolbar-date">{selectedDateLabel}</strong>
        </div>
        {canCreateToday && !formOpen ? (
          <button type="button" className="btn btn--primary cd-new-btn" onClick={openCreate}>
            <span className="cd-new-btn-icon" aria-hidden="true">
              +
            </span>
            Nueva anotación
          </button>
        ) : canWrite && viewDate !== today ? (
          <span className="cd-day-toolbar-hint">Solo lectura en días anteriores</span>
        ) : null}
      </div>

      {formOpen && canWrite && (editingId ? viewDate === today : canCreateToday) ? (
        <form className="cd-form-panel" onSubmit={(ev) => void handleSubmit(ev)}>
          <div className="cd-form-head">
            <h2 className="cd-form-title">{editingId ? 'Editar anotación' : 'Nueva anotación'}</h2>
          </div>
          <div className="cd-form-body">
            <div className="cd-form-grid">
              <label className="form-label" htmlFor="cd-time">
                Hora
              </label>
              <input
                id="cd-time"
                type="time"
                className="auth-input"
                value={timeValue}
                onChange={(e) => setTimeValue(e.target.value)}
                required
              />
              <label className="form-label" htmlFor="cd-desc">
                Anotación
              </label>
              <textarea
                id="cd-desc"
                className="auth-input"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej. Ronda de garajes, llamada ascensor, entrega llaves…"
                required
              />
            </div>
            <div className="cd-form-actions">
              <button type="submit" className="btn btn--primary" disabled={submitting}>
                {submitting ? 'Guardando…' : 'Guardar'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={resetForm} disabled={submitting}>
                Cancelar
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="auth-error cd-error" role="alert">
          {error}
        </p>
      ) : null}

      {loadingDay ? (
        <p className="cd-loading" aria-live="polite">
          Cargando anotaciones…
        </p>
      ) : entries.length === 0 ? (
        <div className="cd-empty" role="status">
          <div className="cd-empty-icon" aria-hidden="true">
            📝
          </div>
          <p className="cd-empty-title">Sin anotaciones este día</p>
          <p className="cd-empty-text">
            {canWrite
              ? 'Pulsa «Nueva anotación» para registrar tareas, visitas o novedades de conserjería.'
              : 'El conserje aún no ha registrado nada para esta fecha.'}
          </p>
        </div>
      ) : (
        <>
          <h2 className="cd-section-title">
            {entries.length} anotación{entries.length === 1 ? '' : 'es'}
          </h2>
          <div className="cd-entries">
            {entries.map((entry) => (
              <article key={entry.id} className="cd-entry-card">
                <div className="cd-entry-time-col">
                  <span className="cd-entry-time">{entry.timeLabel}</span>
                  <span className="cd-entry-time-dot" aria-hidden="true" />
                </div>
                <div className="cd-entry-body">
                  <p className="cd-entry-desc">{entry.description}</p>
                  {entry.createdByName ? (
                    <p className="cd-entry-meta">Registrado por {entry.createdByName}</p>
                  ) : null}
                  {canMutateCuadernoEntry(entry, mutateCtx) ? (
                    <div className="cd-entry-actions">
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => openEdit(entry)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => void handleDelete(entry)}
                      >
                        Eliminar
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
