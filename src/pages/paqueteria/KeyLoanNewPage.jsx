import { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../../config/api.js'
import { useCommunityPortalOptions } from '../../hooks/useCommunityPortalOptions.js'
import { pisoPuertaChoicesForPortal, normDwellPart } from '../../utils/dwellingPortalChoices.js'
import PaqueteriaBackLink from './PaqueteriaBackLink.jsx'
import { canRegisterPaquete } from './paqueteriaRoles.js'
import { localDateInputValue, localTimeInputValue } from './keyLoanFormat.js'
import './paqueteria.css'
import '../Admin.css'

export default function KeyLoanNewPage() {
  const navigate = useNavigate()
  const { accessToken, communityId, communityAccessCode, userRole } = useAuth()
  const canRegister = canRegisterPaquete(userRole)

  const now = new Date()
  const [handedOutDate, setHandedOutDate] = useState(localDateInputValue(now))
  const [handedOutTime, setHandedOutTime] = useState(localTimeInputValue(now))
  const [keyReference, setKeyReference] = useState('')
  const [borrowerName, setBorrowerName] = useState('')
  const [portal, setPortal] = useState('')
  const [piso, setPiso] = useState('')
  const [puerta, setPuerta] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const code = communityAccessCode?.trim().toUpperCase() || ''
  const { loading: portalLoading, portals: portalChoicesRaw, dwellingByPortalIndex } =
    useCommunityPortalOptions(communityId, code || null, { staffBearerToken: accessToken })

  const dwelling = useMemo(
    () => pisoPuertaChoicesForPortal(portal, portalChoicesRaw, dwellingByPortalIndex, piso),
    [portal, piso, portalChoicesRaw, dwellingByPortalIndex],
  )

  const showPortalSelect = (portalChoicesRaw?.length ?? 0) > 0
  const showPisoSelect = Boolean(dwelling.pisoOptions?.length)
  const showPuertaSelect = Boolean(dwelling.puertaOptions?.length)
  const hasStructuredDwelling = showPortalSelect || showPisoSelect || showPuertaSelect

  useEffect(() => {
    if (!dwelling.puertaOptions?.length) return
    const u = normDwellPart(puerta)
    if (!u) return
    if (!dwelling.puertaOptions.includes(u)) setPuerta('')
  }, [dwelling.puertaOptions, puerta])

  useEffect(() => {
    if (!dwelling.pisoOptions?.length) return
    const u = normDwellPart(piso)
    if (!u) return
    if (!dwelling.pisoOptions.includes(u)) {
      setPiso('')
      setPuerta('')
    }
  }, [dwelling.pisoOptions, piso])

  if (!canRegister) {
    return <Navigate to="/paqueteria/llaves" replace />
  }

  const submit = async (ev) => {
    ev.preventDefault()
    if (!accessToken || communityId == null) return
    setError('')
    const ref = keyReference.trim()
    const name = borrowerName.trim().replace(/\s+/g, ' ')
    if (!ref) {
      setError('Indica la referencia de llaves (nº / ref.).')
      return
    }
    if (name.length < 2) {
      setError('Indica el nombre de quien recibe las llaves.')
      return
    }
    setBusy(true)
    try {
      const body = {
        communityId,
        keyReference: ref,
        borrowerName: name,
        handedOutDate,
        handedOutTime,
      }
      const p = normDwellPart(portal)
      const pi = normDwellPart(piso)
      const pu = normDwellPart(puerta)
      const n = notes.trim()
      if (p) body.portal = p
      if (pi) body.piso = pi
      if (pu) body.puerta = pu
      if (n) body.notes = n.slice(0, 512)
      if (communityAccessCode?.trim()) {
        body.accessCode = communityAccessCode.trim().toUpperCase()
      }
      const res = await fetch(apiUrl('/api/community/key-loans'), {
        method: 'POST',
        headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.message || `Error ${res.status}`)
      navigate('/paqueteria/llaves', { replace: true })
    } catch (err) {
      setError(err.message || 'Error')
    } finally {
      setBusy(false)
    }
  }

  const onPortalChange = (value) => {
    setPortal(value)
    setPiso('')
    setPuerta('')
  }

  const onPisoChange = (value) => {
    setPiso(value)
    setPuerta('')
  }

  return (
    <div className="page-container">
      <header className="page-header pq-page-header">
        <PaqueteriaBackLink to="/paqueteria/llaves" label="Volver al cuaderno de llaves" />
        <h1 className="page-title">Préstamo de llaves</h1>
        <p className="page-subtitle">
          Registra la salida de llaves. La devolución se anota después desde el cuaderno.
        </p>
      </header>

      <form className="card pq-keyloan-form" onSubmit={submit}>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}

        <fieldset className="pq-fieldset">
          <legend className="admin-label">Fecha y hora de entrega</legend>
          <div className="pq-keyloan-datetime-row">
            <div className="pq-keyloan-field">
              <label className="pq-keyloan-sublabel" htmlFor="kl-handout-date">
                Fecha
              </label>
              <input
                id="kl-handout-date"
                type="date"
                className="admin-input"
                value={handedOutDate}
                onChange={(e) => setHandedOutDate(e.target.value)}
                required
              />
            </div>
            <div className="pq-keyloan-field">
              <label className="pq-keyloan-sublabel" htmlFor="kl-handout-time">
                Hora
              </label>
              <input
                id="kl-handout-time"
                type="time"
                className="admin-input"
                value={handedOutTime}
                onChange={(e) => setHandedOutTime(e.target.value)}
                required
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="pq-fieldset">
          <legend className="admin-label">Nº llaves / referencia</legend>
          <input
            id="kl-ref"
            className="admin-input"
            value={keyReference}
            onChange={(e) => setKeyReference(e.target.value.slice(0, 120))}
            placeholder="Ej. 83-P5-3B, P3-BD, 119-PISINA"
            required
            autoComplete="off"
          />
        </fieldset>

        <fieldset className="pq-fieldset">
          <legend className="admin-label">Nombre y apellidos</legend>
          <input
            id="kl-name"
            className="admin-input"
            value={borrowerName}
            onChange={(e) => setBorrowerName(e.target.value.slice(0, 255))}
            placeholder="Persona que recibe las llaves"
            required
            autoComplete="name"
          />
        </fieldset>

        <fieldset className="pq-fieldset">
          <legend className="admin-label">Vivienda (opcional)</legend>
          <p className="admin-field-hint admin-field-hint--block">
            {hasStructuredDwelling
              ? 'Elige portal, planta y puerta si las llaves corresponden a un piso concreto.'
              : 'Solo si las llaves corresponden a un piso concreto. Si la comunidad tiene portales configurados, aquí verás desplegables.'}
          </p>

          {portalLoading && !hasStructuredDwelling ? (
            <p className="pq-chip-row--loading" aria-live="polite">
              Cargando viviendas…
            </p>
          ) : null}

          <div className="pq-keyloan-dw-row">
            <div className="pq-keyloan-field">
              <label className="pq-keyloan-sublabel" htmlFor="kl-portal">
                Portal
              </label>
              {showPortalSelect ? (
                <select
                  id="kl-portal"
                  className="admin-input"
                  value={portal}
                  disabled={portalLoading}
                  onChange={(e) => onPortalChange(e.target.value)}
                >
                  <option value="">{portalLoading ? 'Cargando…' : '— Sin portal —'}</option>
                  {portalChoicesRaw.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="kl-portal"
                  className="admin-input"
                  value={portal}
                  onChange={(e) => onPortalChange(e.target.value)}
                  placeholder="Ej. P1"
                  autoComplete="off"
                />
              )}
            </div>

            <div className="pq-keyloan-field">
              <label className="pq-keyloan-sublabel" htmlFor="kl-piso">
                Planta
              </label>
              {showPisoSelect ? (
                <select
                  id="kl-piso"
                  className="admin-input"
                  value={piso}
                  disabled={portalLoading || (showPortalSelect && !normDwellPart(portal))}
                  onChange={(e) => onPisoChange(e.target.value)}
                >
                  <option value="">
                    {showPortalSelect && !normDwellPart(portal)
                      ? 'Elige portal primero'
                      : '— Sin planta —'}
                  </option>
                  {dwelling.pisoOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="kl-piso"
                  className="admin-input"
                  value={piso}
                  onChange={(e) => onPisoChange(e.target.value)}
                  placeholder="Ej. 3º"
                  autoComplete="off"
                  disabled={showPortalSelect && !normDwellPart(portal)}
                />
              )}
            </div>

            <div className="pq-keyloan-field">
              <label className="pq-keyloan-sublabel" htmlFor="kl-puerta">
                Puerta
              </label>
              {showPuertaSelect ? (
                <select
                  id="kl-puerta"
                  className="admin-input"
                  value={puerta}
                  disabled={portalLoading || (showPisoSelect && !normDwellPart(piso))}
                  onChange={(e) => setPuerta(e.target.value)}
                >
                  <option value="">
                    {showPisoSelect && !normDwellPart(piso)
                      ? 'Elige planta primero'
                      : '— Sin puerta —'}
                  </option>
                  {dwelling.puertaOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="kl-puerta"
                  className="admin-input"
                  value={puerta}
                  onChange={(e) => setPuerta(e.target.value)}
                  placeholder="Ej. B"
                  autoComplete="off"
                  disabled={showPisoSelect && !normDwellPart(piso)}
                />
              )}
            </div>
          </div>
        </fieldset>

        <fieldset className="pq-fieldset">
          <legend className="admin-label">Notas (opcional)</legend>
          <textarea
            id="kl-notes"
            className="admin-input pq-keyloan-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 512))}
            placeholder="Ej. obra, socorrista, técnico ascensor…"
            rows={3}
          />
        </fieldset>

        <div className="pq-keyloan-form-actions">
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Registrar entrega'}
          </button>
          <Link to="/paqueteria/llaves" className="btn btn--ghost">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
