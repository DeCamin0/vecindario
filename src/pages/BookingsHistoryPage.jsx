import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiUrl } from '../config/api.js'
import { formatBookingMeta, mapActivityApiItem } from '../utils/bookingDisplay.js'
import './Bookings.css'

export default function BookingsHistoryPage() {
  const { accessToken, communityId } = useAuth()
  const [rows, setRows] = useState([])
  const [scope, setScope] = useState('personal')
  const [preview, setPreview] = useState(true)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchApplied, setSearchApplied] = useState('')
  const textSearchActive = searchApplied.length >= 2

  const load = useCallback(async () => {
    if (!accessToken || communityId == null) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const q = new URLSearchParams({ communityId: String(communityId) })
      if (searchApplied.length >= 2) {
        q.set('q', searchApplied)
      } else {
        q.set('preview', '1')
      }
      const res = await fetch(apiUrl(`/api/bookings/activity?${q}`), {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'No se pudieron cargar las reservas')
        setRows([])
        return
      }
      const items = Array.isArray(data.items) ? data.items : []
      setRows(items.map(mapActivityApiItem))
      setScope(data.scope === 'community' ? 'community' : 'personal')
      setPreview(Boolean(data.preview))
      setTruncated(Boolean(data.truncated))
    } catch {
      setError('Error de red')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [accessToken, communityId, searchApplied])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const qText = searchInput.trim()
    if (qText.length < 2) {
      setSearchApplied('')
      return
    }
    const timer = setTimeout(() => {
      setSearchApplied(qText.slice(0, 80))
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    setSearchInput('')
    setSearchApplied('')
  }, [communityId])

  return (
    <div className="page-container bookings-page">
      <div className="booking-history-back">
        <Link to="/bookings" className="booking-history-back-link">
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Volver a reservas</span>
        </Link>
      </div>

      <header className="page-header">
        <h1 className="page-title">Historial de reservas</h1>
        <p className="page-subtitle">
          {scope === 'community'
            ? 'Reservas y registros de gimnasio de toda la comunidad.'
            : 'Tus reservas confirmadas y registros de gimnasio en esta comunidad.'}
        </p>
      </header>

      <div className="booking-history-search card">
        <label className="form-label" htmlFor="booking-history-q">
          Buscar
        </label>
        <div className="booking-history-search__row">
          <input
            id="booking-history-q"
            type="search"
            className="form-input"
            placeholder="Espacio, franja, portal, piso, nombre o email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            autoComplete="off"
            maxLength={80}
          />
          {searchInput ? (
            <button
              type="button"
              className="btn btn--ghost booking-history-search__clear"
              onClick={() => setSearchInput('')}
            >
              Limpiar
            </button>
          ) : null}
        </div>
        <p className="booking-history-search__hint">
          {searchInput.trim().length > 0 && searchInput.trim().length < 2
            ? 'Escribe al menos 2 caracteres.'
            : textSearchActive
              ? `Mostrando coincidencias de «${searchApplied}».`
              : 'Por defecto se muestran las 20 más recientes. Escribe para buscar en el historial.'}
        </p>
      </div>

      {loading ? (
        <p className="booking-my-records-hint" aria-live="polite">
          Cargando…
        </p>
      ) : null}
      {error ? (
        <p className="form-error form-error--block" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <div className="booking-my-records-empty card">
          <p className="booking-my-records-empty-text">
            {textSearchActive
              ? `No hay registros que coincidan con «${searchApplied}».`
              : scope === 'community'
                ? 'Aún no hay reservas ni registros de gimnasio en esta comunidad.'
                : 'Aún no hay reservas ni registros de gimnasio en tu cuenta.'}
          </p>
        </div>
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <>
          {preview && !textSearchActive ? (
            <p className="booking-history-search__hint booking-history-count">
              Mostrando las {rows.length} más recientes. Usa el buscador para ver el resto.
            </p>
          ) : null}
          {truncated ? (
            <p className="booking-history-search__hint booking-history-count">
              Hay muchas coincidencias; se muestran las más recientes. Prueba con palabras más concretas.
            </p>
          ) : null}
          <ul className="booking-my-records-list">
            {rows.map((item) => (
              <li key={item.id} className="booking-my-records-item card">
                <div className="booking-my-records-item-main">
                  <span className="booking-my-records-facility">{item.facility}</span>
                  <p className="booking-my-records-meta">{formatBookingMeta(item)}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}
