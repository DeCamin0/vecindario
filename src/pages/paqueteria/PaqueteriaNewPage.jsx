import { useState, useMemo, useEffect } from 'react'
import { useNavigate, Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../../config/api.js'
import { useCommunityPortalOptions } from '../../hooks/useCommunityPortalOptions.js'
import { pisoPuertaChoicesForPortal, normDwellPart } from '../../utils/dwellingPortalChoices.js'
import PaqueteriaBackLink from './PaqueteriaBackLink.jsx'
import { canRegisterPaquete } from './paqueteriaRoles.js'
import './paqueteria.css'
import '../Admin.css'

const MAX_FILES = 5

export default function PaqueteriaNewPage() {
  const navigate = useNavigate()
  const { accessToken, communityId, communityAccessCode, userRole } = useAuth()
  const canRegister = canRegisterPaquete(userRole)

  const [portal, setPortal] = useState('')
  const [piso, setPiso] = useState('')
  const [puerta, setPuerta] = useState('')
  const [photos, setPhotos] = useState([])
  const [packageCount, setPackageCount] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const code = communityAccessCode?.trim().toUpperCase() || ''
  const { loading: portalLoading, portals: portalChoicesRaw, dwellingByPortalIndex } =
    useCommunityPortalOptions(
      communityId != null ? communityId : null,
      code || null,
      { staffBearerToken: accessToken },
    )

  const dwelling = useMemo(
    () => pisoPuertaChoicesForPortal(portal, portalChoicesRaw, dwellingByPortalIndex, piso),
    [portal, piso, portalChoicesRaw, dwellingByPortalIndex],
  )

  const pisoSelectOptions = dwelling.pisoOptions
  const puertaSelectOptions = dwelling.puertaOptions

  useEffect(() => {
    if (!puertaSelectOptions?.length) return
    const u = normDwellPart(puerta)
    if (!u) return
    if (!puertaSelectOptions.includes(u)) setPuerta('')
  }, [puertaSelectOptions, puerta])

  useEffect(() => {
    if (!pisoSelectOptions?.length) return
    const u = normDwellPart(piso)
    if (!u) return
    if (!pisoSelectOptions.includes(u)) {
      setPiso('')
      setPuerta('')
    }
  }, [pisoSelectOptions, piso])

  if (!canRegister) {
    return <Navigate to="/paqueteria" replace />
  }

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, MAX_FILES)
    const out = []
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result || ''))
        r.onerror = () => reject(new Error('lectura'))
        r.readAsDataURL(f)
      }).catch(() => '')
      if (dataUrl && dataUrl.length < 900_000) out.push(dataUrl)
    }
    setPhotos(out)
  }

  const submit = async (ev) => {
    ev.preventDefault()
    if (!accessToken || communityId == null) return
    setError('')
    if (portalChoicesRaw?.length && !normDwellPart(portal)) {
      setError('Selecciona un portal.')
      return
    }
    if (pisoSelectOptions?.length && !normDwellPart(piso)) {
      setError('Selecciona una planta (piso).')
      return
    }
    if (puertaSelectOptions?.length && !normDwellPart(puerta)) {
      setError('Selecciona una puerta.')
      return
    }
    if (!normDwellPart(portal) || !normDwellPart(piso) || !normDwellPart(puerta)) {
      setError('Indica portal, piso y puerta.')
      return
    }
    const nBultos =
      Number.isFinite(packageCount) && packageCount >= 1 && packageCount <= 20 ? Math.trunc(packageCount) : 1
    if (nBultos < 1 || nBultos > 20) {
      setError('El número de bultos debe estar entre 1 y 20.')
      return
    }
    setBusy(true)
    try {
      const body = {
        communityId,
        portal: portal.trim(),
        piso: piso.trim(),
        puerta: puerta.trim(),
        packageCount: nBultos,
        photos,
      }
      if (communityAccessCode?.trim()) {
        body.accessCode = communityAccessCode.trim().toUpperCase()
      }
      const res = await fetch(apiUrl('/api/community/parcels'), {
        method: 'POST',
        headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.message || `Error ${res.status}`)
      const id = data.parcel?.id
      if (id) navigate(`/paqueteria/${id}`, { replace: true })
      else navigate('/paqueteria', { replace: true })
    } catch (err) {
      setError(err.message || 'Error')
    } finally {
      setBusy(false)
    }
  }

  const structuredHint =
    portalChoicesRaw?.length || (Array.isArray(dwellingByPortalIndex) && dwellingByPortalIndex.length === 1)
      ? 'Toca portal, planta y puerta según la ficha de la comunidad (Super Admin). Si no ves botones, escribe a mano en los campos de texto.'
      : null

  return (
    <div className="page-container">
      <header className="page-header pq-page-header">
        <PaqueteriaBackLink />
        <h1 className="page-title">Registrar paquete</h1>
        <p className="page-subtitle">Registra un paquete para una vivienda; el vecino recibirá aviso.</p>
      </header>
      <form className="card" style={{ padding: '1rem', maxWidth: 32 * 16 }} onSubmit={submit}>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
        {structuredHint ? <p className="admin-field-hint admin-field-hint--block">{structuredHint}</p> : null}

        <fieldset className="pq-fieldset">
          <legend className="admin-label">Portal</legend>
          {portalLoading ? (
            <p className="pq-chip-row--loading" aria-live="polite">
              Cargando portales…
            </p>
          ) : portalChoicesRaw?.length ? (
            <div className="pq-chip-row" role="group" aria-label="Elegir portal">
              {portalChoicesRaw.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`pq-chip${portal === opt ? ' pq-chip--on' : ''}`}
                  aria-pressed={portal === opt}
                  onClick={() => {
                    setPortal(opt)
                    setPiso('')
                    setPuerta('')
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <input
              id="pq-portal"
              className="admin-input"
              value={portal}
              onChange={(e) => {
                setPortal(e.target.value)
                setPiso('')
                setPuerta('')
              }}
              required
              autoComplete="off"
              placeholder="Ej. A, 34, P1"
            />
          )}
        </fieldset>

        <fieldset className="pq-fieldset">
          <legend className="admin-label">Piso</legend>
          {pisoSelectOptions ? (
            <div className="pq-chip-row" role="group" aria-label="Elegir planta">
              {pisoSelectOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`pq-chip${piso === opt ? ' pq-chip--on' : ''}`}
                  aria-pressed={piso === opt}
                  disabled={portalChoicesRaw?.length ? !portal.trim() : false}
                  onClick={() => {
                    setPiso(opt)
                    setPuerta('')
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <input
              id="pq-piso"
              className="admin-input"
              value={piso}
              onChange={(e) => {
                setPiso(e.target.value)
                setPuerta('')
              }}
              required
              autoComplete="off"
              placeholder="Planta o bloque"
            />
          )}
        </fieldset>

        <fieldset className="pq-fieldset">
          <legend className="admin-label">Puerta</legend>
          {puertaSelectOptions ? (
            <div className="pq-chip-row" role="group" aria-label="Elegir puerta">
              {puertaSelectOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`pq-chip${puerta === opt ? ' pq-chip--on' : ''}`}
                  aria-pressed={puerta === opt}
                  disabled={!piso.trim()}
                  onClick={() => setPuerta(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <input
              id="pq-puerta"
              className="admin-input"
              value={puerta}
              onChange={(e) => setPuerta(e.target.value)}
              required
              autoComplete="off"
              placeholder="Letra o número de puerta"
            />
          )}
        </fieldset>

        <fieldset className="pq-fieldset">
          <legend className="admin-label">Número de bultos</legend>
          <p className="admin-field-hint admin-field-hint--block" style={{ marginBottom: '0.5rem' }}>
            Si llegan varios paquetes a la vez para la misma vivienda, indica cuántos (máx. 20).
          </p>
          <div className="pq-chip-row" role="group" aria-label="Cantidad rápida">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                type="button"
                className={`pq-chip${packageCount === n ? ' pq-chip--on' : ''}`}
                aria-pressed={packageCount === n}
                onClick={() => setPackageCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <label className="admin-label" htmlFor="pq-bultos" style={{ marginTop: '0.75rem', fontSize: 'var(--text-xs)' }}>
            Otro (1–20)
          </label>
          <input
            id="pq-bultos"
            type="number"
            min={1}
            max={20}
            step={1}
            className="admin-input"
            style={{ maxWidth: '8rem', marginTop: '0.25rem' }}
            value={Number.isFinite(packageCount) ? String(packageCount) : '1'}
            onChange={(e) => {
              const raw = e.target.value
              if (raw === '') {
                setPackageCount(1)
                return
              }
              const n = Number.parseInt(raw, 10)
              if (!Number.isFinite(n)) return
              setPackageCount(Math.min(20, Math.max(1, n)))
            }}
          />
        </fieldset>

        <label className="admin-label" htmlFor="pq-photos" style={{ marginTop: '0.75rem' }}>
          Fotos (opcional, máx. {MAX_FILES})
        </label>
        <input id="pq-photos" type="file" accept="image/*" multiple onChange={(e) => void onFiles(e)} />
        <p className="admin-field-hint" style={{ marginTop: '1rem' }}>
          Debe existir un vecino con rol residente o presidente con esa vivienda exacta en la comunidad.
        </p>
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
          <Link to="/paqueteria" className="btn btn--ghost">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
