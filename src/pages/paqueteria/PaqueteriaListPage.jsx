import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../../config/api.js'
import { useCommunityPortalOptions } from '../../hooks/useCommunityPortalOptions.js'
import {
  normDwellPart,
  dwellingUnitKey,
  listAllCommunityDwellings,
  listDwellingsFromRecords,
} from '../../utils/dwellingPortalChoices.js'
import './paqueteria.css'
import '../Admin.css'
import { parcelStaffMetaLine } from './parcelStaffMeta.js'
import {
  PAQUETERIA_STAFF_LIST_ROLES,
  canRegisterPaquete,
} from './paqueteriaRoles.js'
import { isSpecialParcel } from './parcelDeliveryKind.js'
import {
  formatParcelDateTime,
  normalizeParcelPackageCount,
  parcelBultosLabel,
  parcelLastActivityIso,
  parcelShowsInitialRegistration,
  patchParcelPackageCount,
  PARCEL_MAX_BULTOS,
} from './parcelPackageCount.js'

/** Espejo del `take` de pendientes en GET /api/community/parcels (solo UI; no cambia API). */
const PARCEL_PENDING_LIST_CAP = 200

export default function PaqueteriaListPage() {
  const { accessToken, communityId, communityAccessCode, userRole, paqueteriaSpecialDeliveryEnabled, paqueteriaKeyLoansEnabled, appNavFlagsReady } =
    useAuth()
  const [parcels, setParcels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterPiso, setFilterPiso] = useState('')
  const [filterDwellingKey, setFilterDwellingKey] = useState('')
  const [listTab, setListTab] = useState('pendientes')
  const [archivedDateFrom, setArchivedDateFrom] = useState('')
  const [archivedDateTo, setArchivedDateTo] = useState('')
  const [archivedSearchApplied, setArchivedSearchApplied] = useState({ from: '', to: '' })
  const archivedDateSearchActive = Boolean(archivedSearchApplied.from || archivedSearchApplied.to)
  const [listSearchInput, setListSearchInput] = useState('')
  const [listSearchApplied, setListSearchApplied] = useState('')
  const listTextSearchActive = listSearchApplied.length >= 2
  const [packageUpdateBusyId, setPackageUpdateBusyId] = useState(null)
  const [packageUpdateError, setPackageUpdateError] = useState('')

  const isStaff = PAQUETERIA_STAFF_LIST_ROLES.has(userRole)
  const canRegister = canRegisterPaquete(userRole)
  const isAdminReadOnly = userRole === 'community_admin'
  const isNeighbor = userRole === 'resident' || userRole === 'president'

  const { loading: portalOptionsLoading, portals: portalChoicesRaw, dwellingByPortalIndex } =
    useCommunityPortalOptions(communityId, communityAccessCode, {
      staffBearerToken: isStaff ? accessToken : null,
    })

  const load = useCallback(async () => {
    if (!accessToken || communityId == null) {
      setLoading(false)
      return
    }
    setError('')
    setLoading(true)
    try {
      const q = new URLSearchParams({ communityId: String(communityId) })
      q.set('status', listTab === 'recogidos' ? 'picked_up' : 'awaiting_pickup')
      if (listTab === 'recogidos') {
        if (archivedSearchApplied.from) q.set('dateFrom', archivedSearchApplied.from)
        if (archivedSearchApplied.to) q.set('dateTo', archivedSearchApplied.to)
      }
      if (listSearchApplied.length >= 2) {
        q.set('q', listSearchApplied)
      }
      if (isStaff && communityAccessCode?.trim()) {
        q.set('accessCode', communityAccessCode.trim().toUpperCase())
      }
      const res = await fetch(apiUrl(`/api/community/parcels?${q}`), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.message || `Error ${res.status}`)
      setParcels(Array.isArray(data.parcels) ? data.parcels : [])
    } catch (e) {
      setError(e.message || 'Error')
      setParcels([])
    } finally {
      setLoading(false)
    }
  }, [accessToken, communityId, communityAccessCode, isStaff, listTab, archivedSearchApplied, listSearchApplied])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const qText = listSearchInput.trim()
    if (qText.length < 2) {
      setListSearchApplied('')
      return
    }
    const timer = setTimeout(() => {
      setListSearchApplied(qText.slice(0, 80))
    }, 300)
    return () => clearTimeout(timer)
  }, [listSearchInput])

  useEffect(() => {
    setListSearchInput('')
    setListSearchApplied('')
    setFilterPiso('')
    setFilterDwellingKey('')
  }, [communityId])

  const pisoOptions = useMemo(() => {
    if (!isStaff) return []
    const seen = new Set()
    for (const p of parcels) {
      const pi = normDwellPart(p.piso)
      if (pi) seen.add(pi)
    }
    return [...seen].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  }, [parcels, isStaff])

  const dwellingOptions = useMemo(() => {
    if (!isStaff) return []
    const fromConfig = listAllCommunityDwellings(portalChoicesRaw, dwellingByPortalIndex)
    if (fromConfig.length > 0) return fromConfig
    return listDwellingsFromRecords(parcels, (p) => ({
      portal: p.portal,
      piso: p.piso,
      puerta: p.puerta,
    }))
  }, [parcels, isStaff, portalChoicesRaw, dwellingByPortalIndex])

  const filteredParcels = useMemo(() => {
    let list = parcels
    if (filterPiso) {
      list = list.filter((p) => normDwellPart(p.piso) === filterPiso)
    }
    if (filterDwellingKey) {
      list = list.filter((p) => dwellingUnitKey(p.portal, p.piso, p.puerta) === filterDwellingKey)
    }
    return list
  }, [parcels, filterPiso, filterDwellingKey])

  const sortedParcels = useMemo(() => {
    return [...filteredParcels].sort((a, b) => {
      const ta = parcelLastActivityIso(a)
      const tb = parcelLastActivityIso(b)
      return (tb ? new Date(tb).getTime() : 0) - (ta ? new Date(ta).getTime() : 0)
    })
  }, [filteredParcels])

  const hasActiveFilter = Boolean(filterPiso || filterDwellingKey)

  /** KPI solo con lista pendientes fiable (sin búsqueda API ni tab Recogidos). */
  const pendingKpis = useMemo(() => {
    if (loading || error || listTab !== 'pendientes' || listTextSearchActive) return null
    const count = parcels.length
    let bultos = 0
    for (const p of parcels) {
      if (isSpecialParcel(p)) continue
      bultos += normalizeParcelPackageCount(p.packageCount)
    }
    const truncated = count >= PARCEL_PENDING_LIST_CAP
    return {
      packagesDisplay: truncated ? `${PARCEL_PENDING_LIST_CAP}+` : String(count),
      bultosDisplay: truncated ? `≥${bultos}` : String(bultos),
    }
  }, [loading, error, listTab, listTextSearchActive, parcels])

  const clearFilters = () => {
    setFilterPiso('')
    setFilterDwellingKey('')
  }

  const onDwellingSelect = (key) => {
    setFilterDwellingKey(key)
    if (key) setFilterPiso('')
  }

  const onPisoSelect = (piso) => {
    setFilterPiso(piso)
    if (piso) setFilterDwellingKey('')
  }

  const bultosLabel = parcelBultosLabel

  const handleAddBulto = async (ev, parcel) => {
    ev.preventDefault()
    ev.stopPropagation()
    if (!canRegister || packageUpdateBusyId != null || !accessToken || communityId == null) return
    const pkg = normalizeParcelPackageCount(parcel.packageCount)
    if (pkg >= PARCEL_MAX_BULTOS) {
      setPackageUpdateError(`Máximo ${PARCEL_MAX_BULTOS} bultos por registro.`)
      return
    }
    setPackageUpdateError('')
    setPackageUpdateBusyId(parcel.id)
    try {
      await patchParcelPackageCount({
        apiUrl,
        accessToken,
        communityId,
        communityAccessCode,
        parcelId: parcel.id,
        addOne: true,
      })
      await load()
    } catch (e) {
      setPackageUpdateError(e.message || 'No se pudo añadir el bulto.')
    } finally {
      setPackageUpdateBusyId(null)
    }
  }

  return (
    <div className="page-container">
      <header className="page-header pq-page-header">
        <h1 className="page-title">Paquetería</h1>
        <p className="page-subtitle">
          {isNeighbor
            ? 'Paquetes en conserjería: aquí ves el estado. La firma de recogida la registra conserjería cuando pases a recogerlos.'
            : isAdminReadOnly
              ? 'Consulta los paquetes de la comunidad. El registro y la entrega con firma las realiza el conserje en conserjería.'
              : 'Paquetes en conserjería: registro y recogida con firma del vecino en conserjería. Solo visible si la comunidad tiene activada la pestaña.'}
        </p>
      </header>
      {canRegister ? (
        <p className="pq-list-actions">
          <Link to="/paqueteria/nuevo" className="btn btn--primary">
            Registrar paquete
          </Link>
          {appNavFlagsReady && paqueteriaSpecialDeliveryEnabled ? (
            <Link to="/paqueteria/entrega-especial/nuevo" className="btn btn--secondary">
              Entrega especial
            </Link>
          ) : null}
          {appNavFlagsReady && paqueteriaKeyLoansEnabled ? (
            <Link to="/paqueteria/llaves" className="btn btn--secondary">
              Cuaderno de llaves
            </Link>
          ) : null}
        </p>
      ) : null}
      <div className="pq-list-head">
        <h2 className="section-label pq-list-head__title">Paquetes de la comunidad</h2>
        <div className="pq-list-tabs" role="tablist" aria-label="Filtrar paquetes">
          <button
            type="button"
            role="tab"
            aria-selected={listTab === 'pendientes'}
            className={`pq-list-tab${listTab === 'pendientes' ? ' pq-list-tab--active' : ''}`}
            onClick={() => setListTab('pendientes')}
          >
            Pendientes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={listTab === 'recogidos'}
            className={`pq-list-tab${listTab === 'recogidos' ? ' pq-list-tab--active' : ''}`}
            onClick={() => {
              setListTab('recogidos')
              setArchivedSearchApplied({ from: '', to: '' })
              setArchivedDateFrom('')
              setArchivedDateTo('')
            }}
          >
            Recogidos
          </button>
        </div>
      </div>
      {pendingKpis ? (
        <div className="pq-kpi-row" aria-label="Resumen de pendientes">
          <div className="pq-kpi">
            <span className="pq-kpi__label">Paquetes pendientes</span>
            <span className="pq-kpi__value">{pendingKpis.packagesDisplay}</span>
          </div>
          <div className="pq-kpi">
            <span className="pq-kpi__label">Bultos pendientes</span>
            <span className="pq-kpi__value">{pendingKpis.bultosDisplay}</span>
          </div>
        </div>
      ) : null}
      <div className="pq-list-search card">
        <label className="form-label" htmlFor="pq-list-q">
          Buscar
        </label>
        <div className="pq-list-search__row">
          <input
            id="pq-list-q"
            type="search"
            className="form-input"
            placeholder="Nº, vivienda, destinatario, descripción…"
            value={listSearchInput}
            onChange={(e) => setListSearchInput(e.target.value)}
            autoComplete="off"
            maxLength={80}
          />
          {listSearchInput ? (
            <button
              type="button"
              className="btn btn--ghost pq-list-search__clear"
              onClick={() => setListSearchInput('')}
            >
              Limpiar
            </button>
          ) : null}
        </div>
        <p className="pq-list-search__hint">
          {listSearchInput.trim().length > 0 && listSearchInput.trim().length < 2
            ? 'Escribe al menos 2 caracteres.'
            : listTextSearchActive
              ? `Mostrando coincidencias de «${listSearchApplied}».`
              : 'Los resultados aparecen al teclear (mín. 2 caracteres).'}
        </p>
      </div>
      {listTab === 'recogidos' ? (
        <form
          className="pq-archive-filters card"
          onSubmit={(e) => {
            e.preventDefault()
            setArchivedSearchApplied({
              from: archivedDateFrom.trim(),
              to: archivedDateTo.trim(),
            })
          }}
        >
          <p className="pq-archive-filters__hint">
            {archivedDateSearchActive
              ? 'Resultados filtrados por fecha de recogida. Usa «Limpiar fechas» para volver a los 5 más recientes.'
              : listTextSearchActive
                ? 'La búsqueda por texto incluye más resultados recogidos. También puedes filtrar por fechas de recogida.'
                : 'Por defecto se muestran solo los 5 paquetes recogidos más recientes. Indica fechas y pulsa Buscar fechas para ver más.'}
          </p>
          <div className="pq-archive-filters__row">
            <div className="form-field pq-archive-filters__field">
              <label className="form-label" htmlFor="pq-arch-from">
                Desde
              </label>
              <input
                id="pq-arch-from"
                type="date"
                className="form-input"
                value={archivedDateFrom}
                onChange={(e) => setArchivedDateFrom(e.target.value)}
              />
            </div>
            <div className="form-field pq-archive-filters__field">
              <label className="form-label" htmlFor="pq-arch-to">
                Hasta
              </label>
              <input
                id="pq-arch-to"
                type="date"
                className="form-input"
                value={archivedDateTo}
                onChange={(e) => setArchivedDateTo(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn--secondary pq-archive-filters__btn">
              Buscar fechas
            </button>
            {archivedDateFrom || archivedDateTo || archivedDateSearchActive ? (
              <button
                type="button"
                className="btn btn--ghost pq-archive-filters__btn"
                onClick={() => {
                  setArchivedDateFrom('')
                  setArchivedDateTo('')
                  setArchivedSearchApplied({ from: '', to: '' })
                }}
              >
                Limpiar fechas
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
      <div className="pq-list-shell">
        {isStaff && !loading && !error && parcels.length > 0 ? (
          <div className="pq-list-filters card">
            <label className="pq-list-filters__label" htmlFor="pq-list-dwelling">
              Buscar vivienda
            </label>
            <div className="pq-list-filters__row">
              <select
                id="pq-list-dwelling"
                className="admin-input pq-list-filters__select"
                value={filterDwellingKey}
                disabled={portalOptionsLoading && dwellingOptions.length === 0}
                onChange={(e) => onDwellingSelect(e.target.value)}
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
                <button type="button" className="btn btn--secondary pq-list-filters__clear" onClick={clearFilters}>
                  Limpiar
                </button>
              ) : null}
            </div>
            {pisoOptions.length > 1 ? (
              <div className="pq-list-filters__piso">
                <span className="pq-list-filters__piso-label">Piso</span>
                <div className="pq-chip-row" role="group" aria-label="Filtrar por piso">
                  <button
                    type="button"
                    className={`pq-chip${!filterPiso ? ' pq-chip--on' : ''}`}
                    aria-pressed={!filterPiso}
                    onClick={() => onPisoSelect('')}
                  >
                    Todos
                  </button>
                  {pisoOptions.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`pq-chip${filterPiso === opt ? ' pq-chip--on' : ''}`}
                      aria-pressed={filterPiso === opt}
                      onClick={() => onPisoSelect(filterPiso === opt ? '' : opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {hasActiveFilter ? (
              <p className="pq-list-filters__count" aria-live="polite">
                {filteredParcels.length === 1
                  ? '1 paquete'
                  : `${filteredParcels.length} paquetes`}
                {filteredParcels.length !== parcels.length ? ` de ${parcels.length}` : ''}
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
        {packageUpdateError ? (
          <p className="auth-error" role="alert">
            {packageUpdateError}
          </p>
        ) : null}
        {!loading && !error && parcels.length === 0 ? (
          <div className="pq-list-empty card">
            <p className="pq-list-empty-title">
              {listTextSearchActive
                ? 'Sin resultados'
                : listTab === 'recogidos'
                  ? 'Sin paquetes recogidos'
                  : 'No hay paquetes pendientes'}
            </p>
            <p className="pq-list-muted">
              {listTextSearchActive
                ? `No hay paquetes que coincidan con «${listSearchApplied}».`
                : listTab === 'recogidos'
                  ? archivedDateSearchActive
                    ? 'No hay paquetes recogidos en ese intervalo de fechas.'
                    : 'No hay paquetes recogidos recientes. Usa Buscar fechas para consultar el historial.'
                  : isNeighbor
                    ? 'Cuando la conserjería registre un envío para tu vivienda, aparecerá aquí.'
                    : 'Cuando se registre un paquete pendiente de recogida, aparecerá en esta lista.'}
            </p>
          </div>
        ) : null}
        {!loading && !error && parcels.length > 0 && filteredParcels.length === 0 ? (
          <div className="pq-list-empty card">
            <p className="pq-list-empty-title">Sin resultados</p>
            <p className="pq-list-muted">Ningún paquete para los filtros seleccionados.</p>
            {hasActiveFilter ? (
              <p className="pq-list-filters__empty-action">
                <button type="button" className="btn btn--secondary" onClick={clearFilters}>
                  Quitar filtros
                </button>
              </p>
            ) : null}
          </div>
        ) : null}
        {!loading && !error && filteredParcels.length > 0 ? (
          <ul className="pq-parcel-list">
            {sortedParcels.map((p) => {
              const pending = p.status !== 'picked_up'
              const special = isSpecialParcel(p)
              const staffMeta = isStaff ? parcelStaffMetaLine(p) : null
              const pkg = normalizeParcelPackageCount(p.packageCount)
              const activityIso = parcelLastActivityIso(p)
              const showInitial = parcelShowsInitialRegistration(p)
              const canAddBulto = canRegister && pending && !special && pkg < PARCEL_MAX_BULTOS
              const addBusy = packageUpdateBusyId === p.id
              const recipientText = p.recipientName?.trim() || ''
              const specialDesc = special && p.itemDescription ? String(p.itemDescription) : ''
              return (
                <li key={p.id} className="pq-parcel-list__item">
                  <Link to={`/paqueteria/${p.id}`} className="pq-parcel-card">
                    <span className="pq-parcel-col pq-parcel-col--id">
                      <span className="pq-parcel-id">#{p.id}</span>
                      {special ? (
                        <span className="pq-parcel-kind pq-parcel-kind--special">Entrega especial</span>
                      ) : null}
                    </span>
                    <div
                      className="pq-parcel-col pq-parcel-col--dwelling"
                      aria-label={`Vivienda ${p.portal}, ${p.piso}, ${p.puerta}`}
                    >
                      <span className="pq-parcel-chip pq-parcel-chip--readonly">{p.portal}</span>
                      <span className="pq-parcel-sep" aria-hidden>
                        ·
                      </span>
                      <span className="pq-parcel-chip pq-parcel-chip--readonly">{p.piso}</span>
                      <span className="pq-parcel-sep" aria-hidden>
                        ·
                      </span>
                      <span className="pq-parcel-chip pq-parcel-chip--readonly">{p.puerta}</span>
                    </div>
                    <span className="pq-parcel-col pq-parcel-col--recipient">
                      {recipientText ? (
                        <span className="pq-parcel-desc" title={recipientText}>
                          {recipientText}
                        </span>
                      ) : null}
                      {specialDesc ? (
                        <span className="pq-parcel-desc pq-parcel-desc--secondary" title={specialDesc}>
                          {specialDesc}
                        </span>
                      ) : null}
                    </span>
                    <span className="pq-parcel-col pq-parcel-col--bultos">
                      {!special ? (
                        <span className={`pq-parcel-bultos${pkg > 1 ? ' pq-parcel-bultos--many' : ''}`}>
                          {bultosLabel(pkg)}
                        </span>
                      ) : (
                        <span className="pq-parcel-bultos pq-parcel-bultos--na" aria-hidden>
                          —
                        </span>
                      )}
                    </span>
                    <span className="pq-parcel-col pq-parcel-col--status">
                      <span
                        className={
                          pending
                            ? 'pq-parcel-status pq-parcel-status--pending'
                            : 'pq-parcel-status pq-parcel-status--done'
                        }
                      >
                        {pending ? 'Pendiente de recogida' : 'Recogido'}
                      </span>
                    </span>
                    <span className="pq-parcel-col pq-parcel-col--date">
                      {activityIso ? (
                        <div className="pq-parcel-dates">
                          <time className="pq-parcel-date" dateTime={activityIso}>
                            {formatParcelDateTime(activityIso)}
                          </time>
                          {showInitial && p.createdAt ? (
                            <span className="pq-parcel-date-initial">
                              Registrado inicial: {formatParcelDateTime(p.createdAt)}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </span>
                    {canAddBulto ? (
                      <span className="pq-parcel-col pq-parcel-col--actions">
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm pq-parcel-add-bulto"
                          disabled={addBusy}
                          aria-label={`Añadir bulto al paquete ${p.id}`}
                          onClick={(ev) => void handleAddBulto(ev, p)}
                        >
                          {addBusy ? '…' : '+ Bulto'}
                        </button>
                      </span>
                    ) : (
                      <span className="pq-parcel-col pq-parcel-col--actions" aria-hidden />
                    )}
                    {staffMeta ? <p className="pq-parcel-staff-meta">{staffMeta}</p> : null}
                    <span className="pq-parcel-card__chev" aria-hidden>
                      ›
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
