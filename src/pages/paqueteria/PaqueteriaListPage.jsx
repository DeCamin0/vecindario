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

export default function PaqueteriaListPage() {
  const { accessToken, communityId, communityAccessCode, userRole, paqueteriaSpecialDeliveryEnabled, paqueteriaKeyLoansEnabled, appNavFlagsReady } =
    useAuth()
  const [parcels, setParcels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterPiso, setFilterPiso] = useState('')
  const [filterDwellingKey, setFilterDwellingKey] = useState('')

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
  }, [accessToken, communityId, communityAccessCode, isStaff])

  useEffect(() => {
    void load()
  }, [load])

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

  const hasActiveFilter = Boolean(filterPiso || filterDwellingKey)

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

  const bultosLabel = (n) => {
    const c = typeof n === 'number' && Number.isFinite(n) ? Math.max(1, Math.trunc(n)) : 1
    return c === 1 ? '1 bulto' : `${c} bultos`
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
        {!loading && !error && parcels.length === 0 ? (
          <div className="pq-list-empty card">
            <p className="pq-list-empty-title">No hay paquetes</p>
            <p className="pq-list-muted">
              Cuando la conserjería registre un envío para tu vivienda, aparecerá aquí.
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
            {filteredParcels.map((p) => {
              const pending = p.status !== 'picked_up'
              const special = isSpecialParcel(p)
              const staffMeta = isStaff ? parcelStaffMetaLine(p) : null
              const pkg =
                typeof p.packageCount === 'number' && Number.isFinite(p.packageCount)
                  ? Math.max(1, Math.trunc(p.packageCount))
                  : 1
              return (
                <li key={p.id}>
                  <Link to={`/paqueteria/${p.id}`} className="pq-parcel-card">
                    <div className="pq-parcel-card__body">
                      <div className="pq-parcel-card__row pq-parcel-card__row--top">
                        <span className="pq-parcel-id">#{p.id}</span>
                        {special ? (
                          <span className="pq-parcel-kind pq-parcel-kind--special">Entrega especial</span>
                        ) : null}
                        <div className="pq-parcel-dwelling" aria-label={`Vivienda ${p.portal}, ${p.piso}, ${p.puerta}`}>
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
                        {special && p.itemDescription ? (
                          <span className="pq-parcel-desc" title={p.itemDescription}>
                            {p.itemDescription}
                          </span>
                        ) : !special ? (
                        <span className={`pq-parcel-bultos${pkg > 1 ? ' pq-parcel-bultos--many' : ''}`}>
                          {bultosLabel(pkg)}
                        </span>
                        ) : null}
                      </div>
                      <div className="pq-parcel-card__row pq-parcel-card__row--meta">
                        <span className={pending ? 'pq-parcel-status pq-parcel-status--pending' : 'pq-parcel-status pq-parcel-status--done'}>
                          {pending ? 'Pendiente de recogida' : 'Recogido'}
                        </span>
                        {p.createdAt ? (
                          <time className="pq-parcel-date" dateTime={p.createdAt}>
                            {new Date(p.createdAt).toLocaleString('es-ES', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                        ) : null}
                      </div>
                      {staffMeta ? (
                        <p className="pq-parcel-staff-meta">{staffMeta}</p>
                      ) : null}
                    </div>
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
