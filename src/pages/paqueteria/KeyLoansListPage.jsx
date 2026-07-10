import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../../config/api.js'
import { useCommunityPortalOptions } from '../../hooks/useCommunityPortalOptions.js'
import {
  dwellingUnitKey,
  formatDwellingLabel,
  listAllCommunityDwellings,
  listDwellingsFromRecords,
  normDwellPart,
} from '../../utils/dwellingPortalChoices.js'
import PaqueteriaBackLink from './PaqueteriaBackLink.jsx'
import { canRegisterPaquete } from './paqueteriaRoles.js'
import {
  formatKeyLoanDateTime,
  formatKeyLoanDayLabel,
  keyLoanMatchesDay,
  localDateInputValue,
  localTimeInputValue,
} from './keyLoanFormat.js'
import './paqueteria.css'
import '../Admin.css'

const STATUS_TABS = [
  { id: '', label: 'Todas' },
  { id: 'out', label: 'Prestadas' },
  { id: 'returned', label: 'Devueltas' },
]

function keyLoanStaffMeta(row) {
  const lines = []
  if (row.createdByName?.trim()) {
    lines.push(`Entregado por ${row.createdByName.trim()}`)
  }
  if (row.returnedAt) {
    const when = formatKeyLoanDateTime(row.returnedAt)
    const who = row.returnedByName?.trim()
    if (when && who) lines.push(`Devuelto por ${who} · ${when}`)
    else if (when) lines.push(`Devuelto · ${when}`)
    else if (who) lines.push(`Devuelto por ${who}`)
  }
  return lines
}

export default function KeyLoansListPage() {
  const { accessToken, communityId, communityAccessCode, userRole } = useAuth()
  const canRegister = canRegisterPaquete(userRole)

  const [keyLoans, setKeyLoans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [filterDwellingKey, setFilterDwellingKey] = useState('')
  const [filterDay, setFilterDay] = useState('')
  const [returnTarget, setReturnTarget] = useState(null)
  const [returnDate, setReturnDate] = useState(localDateInputValue())
  const [returnTime, setReturnTime] = useState(localTimeInputValue())
  const [returnBusy, setReturnBusy] = useState(false)
  const [returnError, setReturnError] = useState('')

  const { loading: portalOptionsLoading, portals: portalChoicesRaw, dwellingByPortalIndex } =
    useCommunityPortalOptions(communityId, communityAccessCode, { staffBearerToken: accessToken })

  const load = useCallback(async () => {
    if (!accessToken || communityId == null) {
      setLoading(false)
      return
    }
    setError('')
    setLoading(true)
    try {
      const q = new URLSearchParams({ communityId: String(communityId) })
      if (statusFilter) q.set('status', statusFilter)
      if (communityAccessCode?.trim()) {
        q.set('accessCode', communityAccessCode.trim().toUpperCase())
      }
      const res = await fetch(apiUrl(`/api/community/key-loans?${q}`), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.message || `Error ${res.status}`)
      setKeyLoans(Array.isArray(data.keyLoans) ? data.keyLoans : [])
    } catch (e) {
      setError(e.message || 'Error')
      setKeyLoans([])
    } finally {
      setLoading(false)
    }
  }, [accessToken, communityId, communityAccessCode, statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  const dwellingOptions = useMemo(() => {
    const fromConfig = listAllCommunityDwellings(portalChoicesRaw, dwellingByPortalIndex)
    if (fromConfig.length > 0) return fromConfig
    return listDwellingsFromRecords(keyLoans, (row) => ({
      portal: row.portal,
      piso: row.piso,
      puerta: row.puerta,
    }))
  }, [keyLoans, portalChoicesRaw, dwellingByPortalIndex])

  const todayYmd = useMemo(() => localDateInputValue(), [])

  const filteredKeyLoans = useMemo(() => {
    let list = keyLoans
    if (filterDwellingKey) {
      list = list.filter(
        (row) => dwellingUnitKey(row.portal, row.piso, row.puerta) === filterDwellingKey,
      )
    }
    if (filterDay) {
      list = list.filter((row) => keyLoanMatchesDay(row, filterDay))
    }
    return list
  }, [keyLoans, filterDwellingKey, filterDay])

  const hasActiveFilter = Boolean(filterDwellingKey || filterDay)

  const clearFilters = () => {
    setFilterDwellingKey('')
    setFilterDay('')
  }

  const openReturn = (row) => {
    const now = new Date()
    setReturnTarget(row)
    setReturnDate(localDateInputValue(now))
    setReturnTime(localTimeInputValue(now))
    setReturnError('')
  }

  const closeReturn = () => {
    if (returnBusy) return
    setReturnTarget(null)
    setReturnError('')
  }

  const submitReturn = async (ev) => {
    ev.preventDefault()
    if (!returnTarget || !accessToken || communityId == null) return
    setReturnError('')
    setReturnBusy(true)
    try {
      const body = {
        communityId,
        returnedDate: returnDate,
        returnedTime: returnTime,
      }
      if (communityAccessCode?.trim()) {
        body.accessCode = communityAccessCode.trim().toUpperCase()
      }
      const res = await fetch(apiUrl(`/api/community/key-loans/${returnTarget.id}/return`), {
        method: 'PATCH',
        headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.message || `Error ${res.status}`)
      setReturnTarget(null)
      await load()
    } catch (e) {
      setReturnError(e.message || 'Error')
    } finally {
      setReturnBusy(false)
    }
  }

  return (
    <div className="page-container">
      <header className="page-header pq-page-header">
        <PaqueteriaBackLink to="/paqueteria" label="Volver a paquetería" />
        <h1 className="page-title">Cuaderno de llaves</h1>
        <p className="page-subtitle">
          Registro digital de préstamo y devolución de llaves (obra, socorrista, técnicos, etc.).
        </p>
      </header>

      {canRegister ? (
        <p className="pq-list-actions">
          <Link to="/paqueteria/llaves/nuevo" className="btn btn--primary">
            Registrar préstamo
          </Link>
        </p>
      ) : null}

      <div className="pq-list-shell">
        {!loading && !error ? (
          <div className="pq-list-filters card">
            <span className="pq-list-filters__piso-label">Estado</span>
            <div className="pq-chip-row" role="group" aria-label="Filtrar por estado">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.id || 'all'}
                  type="button"
                  className={`pq-chip${statusFilter === tab.id ? ' pq-chip--on' : ''}`}
                  aria-pressed={statusFilter === tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="pq-list-filters__piso">
              <span className="pq-list-filters__piso-label">Día</span>
              <div className="pq-chip-row" role="group" aria-label="Filtrar por día">
                <button
                  type="button"
                  className={`pq-chip${!filterDay ? ' pq-chip--on' : ''}`}
                  aria-pressed={!filterDay}
                  onClick={() => setFilterDay('')}
                >
                  Todas las fechas
                </button>
                <button
                  type="button"
                  className={`pq-chip${filterDay === todayYmd ? ' pq-chip--on' : ''}`}
                  aria-pressed={filterDay === todayYmd}
                  onClick={() => setFilterDay(filterDay === todayYmd ? '' : todayYmd)}
                >
                  Hoy
                </button>
              </div>
              <div className="pq-list-filters__row pq-list-filters__row--day">
                <input
                  id="kl-list-day"
                  type="date"
                  className="admin-input pq-list-filters__input"
                  value={filterDay}
                  max={todayYmd}
                  onChange={(e) => setFilterDay(e.target.value)}
                  aria-label="Elegir día"
                />
                {filterDay ? (
                  <button
                    type="button"
                    className="btn btn--secondary pq-list-filters__clear"
                    onClick={() => setFilterDay('')}
                  >
                    Quitar día
                  </button>
                ) : null}
              </div>
              {filterDay ? (
                <p className="pq-list-filters__hint">
                  Entregas o devoluciones del {formatKeyLoanDayLabel(filterDay) ?? filterDay}
                </p>
              ) : null}
            </div>

            {keyLoans.length > 0 ? (
              <>
                <label className="pq-list-filters__label" htmlFor="kl-list-dwelling" style={{ marginTop: '1rem' }}>
                  Buscar vivienda
                </label>
                <div className="pq-list-filters__row">
                  <select
                    id="kl-list-dwelling"
                    className="admin-input pq-list-filters__select"
                    value={filterDwellingKey}
                    disabled={portalOptionsLoading && dwellingOptions.length === 0}
                    onChange={(e) => setFilterDwellingKey(e.target.value)}
                    aria-busy={portalOptionsLoading && dwellingOptions.length === 0}
                  >
                    <option value="">
                      {portalOptionsLoading && dwellingOptions.length === 0
                        ? 'Cargando viviendas…'
                        : 'Todas las viviendas'}
                    </option>
                    {dwellingOptions.map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  {hasActiveFilter ? (
                    <button
                      type="button"
                      className="btn btn--secondary pq-list-filters__clear"
                      onClick={clearFilters}
                    >
                      Limpiar
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}

            {hasActiveFilter ? (
              <p className="pq-list-filters__count" aria-live="polite">
                {filteredKeyLoans.length === 1
                  ? '1 préstamo'
                  : `${filteredKeyLoans.length} préstamos`}
                {filteredKeyLoans.length !== keyLoans.length ? ` de ${keyLoans.length}` : ''}
              </p>
            ) : null}
          </div>
        ) : null}

        {loading ? (
          <p className="pq-list-muted" aria-live="polite">
            Cargando…
          </p>
        ) : null}
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}

        {!loading && !error && keyLoans.length === 0 ? (
          <div className="pq-list-empty card">
            <p className="pq-list-empty-title">No hay préstamos</p>
            <p className="pq-list-muted">
              {statusFilter === 'out'
                ? 'No hay llaves prestadas en este momento.'
                : statusFilter === 'returned'
                  ? 'Aún no consta ninguna devolución.'
                  : 'Cuando registres una entrega de llaves, aparecerá aquí.'}
            </p>
          </div>
        ) : null}

        {!loading && !error && keyLoans.length > 0 && filteredKeyLoans.length === 0 ? (
          <div className="pq-list-empty card">
            <p className="pq-list-empty-title">Sin resultados</p>
            <p className="pq-list-muted">Ningún préstamo para los filtros seleccionados.</p>
            {hasActiveFilter ? (
              <p className="pq-list-filters__empty-action">
                <button type="button" className="btn btn--secondary" onClick={clearFilters}>
                  Quitar filtros
                </button>
              </p>
            ) : null}
          </div>
        ) : null}

        {!loading && !error && filteredKeyLoans.length > 0 ? (
          <ul className="pq-parcel-list">
            {filteredKeyLoans.map((row) => {
              const isOut = row.status === 'out'
              const hasDwelling =
                normDwellPart(row.portal) || normDwellPart(row.piso) || normDwellPart(row.puerta)
              const handedOutLabel = formatKeyLoanDateTime(row.handedOutAt)
              const staffLines = keyLoanStaffMeta(row)

              return (
                <li key={row.id}>
                  <div className="pq-parcel-card pq-keyloan-card">
                    <div className="pq-parcel-card__body">
                      <div className="pq-parcel-card__row pq-parcel-card__row--top">
                        <span className="pq-parcel-id">#{row.id}</span>
                        <div className="pq-keyloan-main">
                          <span className="pq-keyloan-ref">{row.keyReference}</span>
                          <span className="pq-keyloan-borrower">{row.borrowerName}</span>
                        </div>
                        {hasDwelling ? (
                          <div
                            className="pq-parcel-dwelling"
                            aria-label={`Vivienda ${formatDwellingLabel(row.portal, row.piso, row.puerta)}`}
                          >
                            {normDwellPart(row.portal) ? (
                              <span className="pq-parcel-chip pq-parcel-chip--readonly">{row.portal}</span>
                            ) : null}
                            {normDwellPart(row.portal) && normDwellPart(row.piso) ? (
                              <span className="pq-parcel-sep" aria-hidden>
                                ·
                              </span>
                            ) : null}
                            {normDwellPart(row.piso) ? (
                              <span className="pq-parcel-chip pq-parcel-chip--readonly">{row.piso}</span>
                            ) : null}
                            {normDwellPart(row.piso) && normDwellPart(row.puerta) ? (
                              <span className="pq-parcel-sep" aria-hidden>
                                ·
                              </span>
                            ) : null}
                            {normDwellPart(row.puerta) ? (
                              <span className="pq-parcel-chip pq-parcel-chip--readonly">{row.puerta}</span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      <div className="pq-parcel-card__row pq-parcel-card__row--meta">
                        <span
                          className={
                            isOut
                              ? 'pq-parcel-status pq-parcel-status--pending'
                              : 'pq-parcel-status pq-parcel-status--done'
                          }
                        >
                          {isOut ? 'Prestada' : 'Devuelta'}
                        </span>
                        {handedOutLabel ? (
                          <time className="pq-parcel-date" dateTime={row.handedOutAt}>
                            Entrega · {handedOutLabel}
                          </time>
                        ) : null}
                      </div>

                      {row.notes ? <p className="pq-parcel-staff-meta">{row.notes}</p> : null}
                      {staffLines.map((line) => (
                        <p key={line} className="pq-parcel-staff-meta">
                          {line}
                        </p>
                      ))}
                    </div>

                    {canRegister && isOut ? (
                      <button
                        type="button"
                        className="btn btn--secondary pq-keyloan-card__action"
                        onClick={() => openReturn(row)}
                      >
                        Devolver
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>

      {returnTarget ? (
        <div className="pq-modal-backdrop" role="presentation" onClick={closeReturn}>
          <form
            className="card pq-return-modal"
            role="dialog"
            aria-labelledby="kl-return-title"
            aria-describedby="kl-return-desc"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitReturn}
          >
            <header className="pq-return-modal__header">
              <div className="pq-return-modal__heading">
                <p className="pq-return-modal__eyebrow">Cuaderno de llaves</p>
                <h2 id="kl-return-title" className="pq-return-modal__title">
                  Confirmar devolución
                </h2>
                <p id="kl-return-desc" className="pq-return-modal__lead">
                  Indica cuándo se devuelven las llaves. El registro quedará marcado como devuelto.
                </p>
              </div>
              <button
                type="button"
                className="pq-return-modal__close"
                aria-label="Cerrar"
                disabled={returnBusy}
                onClick={closeReturn}
              >
                ×
              </button>
            </header>

            <div className="pq-return-modal__summary">
              <div className="pq-return-modal__summary-main">
                <span className="pq-return-modal__ref">{returnTarget.keyReference}</span>
                <span className="pq-return-modal__borrower">{returnTarget.borrowerName}</span>
              </div>
              {formatKeyLoanDateTime(returnTarget.handedOutAt) ? (
                <p className="pq-return-modal__meta">
                  Entregado · {formatKeyLoanDateTime(returnTarget.handedOutAt)}
                </p>
              ) : null}
              {normDwellPart(returnTarget.portal) ||
              normDwellPart(returnTarget.piso) ||
              normDwellPart(returnTarget.puerta) ? (
                <p className="pq-return-modal__meta pq-return-modal__meta--dw">
                  {formatDwellingLabel(returnTarget.portal, returnTarget.piso, returnTarget.puerta)}
                </p>
              ) : null}
            </div>

            <fieldset className="pq-fieldset pq-return-modal__fields">
              <legend className="admin-label">Fecha y hora de devolución</legend>
              <div className="pq-keyloan-datetime-row">
                <div className="pq-keyloan-field">
                  <label className="pq-keyloan-sublabel" htmlFor="kl-return-date">
                    Fecha
                  </label>
                  <input
                    id="kl-return-date"
                    type="date"
                    className="admin-input"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    required
                  />
                </div>
                <div className="pq-keyloan-field">
                  <label className="pq-keyloan-sublabel" htmlFor="kl-return-time">
                    Hora
                  </label>
                  <input
                    id="kl-return-time"
                    type="time"
                    className="admin-input"
                    value={returnTime}
                    onChange={(e) => setReturnTime(e.target.value)}
                    required
                  />
                </div>
              </div>
            </fieldset>

            {returnError ? (
              <p className="auth-error pq-return-modal__error" role="alert">
                {returnError}
              </p>
            ) : null}

            <footer className="pq-return-modal__footer">
              <button type="button" className="btn btn--ghost" disabled={returnBusy} onClick={closeReturn}>
                Cancelar
              </button>
              <button type="submit" className="btn btn--primary" disabled={returnBusy}>
                {returnBusy ? 'Guardando…' : 'Confirmar devolución'}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  )
}
