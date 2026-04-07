import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import './PoolAccess.css'

const routerBase = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/, '')

export default function PoolSelfCheckinPage() {
  const { accessToken, userRole } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [preview, setPreview] = useState(null)
  const [peopleCount, setPeopleCount] = useState('1')
  const [busy, setBusy] = useState(false)
  const [releaseBusy, setReleaseBusy] = useState(false)

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/pool-access/self-checkin-preview'), {
        headers: jsonAuthHeaders(accessToken),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || d.message || `Error ${res.status}`)
      setPreview(d)
      if (typeof d.maxAdmit === 'number') {
        setPeopleCount((prev) => {
          const n = Number.parseInt(prev, 10)
          const cur = Number.isInteger(n) && n >= 1 ? n : 1
          return String(Math.min(d.maxAdmit, cur))
        })
      }
    } catch (e) {
      setError(e.message || 'Error')
      setPreview(null)
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    if (!accessToken) return
    void load()
  }, [accessToken, load])

  const refresh = () => void load()

  const submitAdmit = async () => {
    if (!accessToken || !preview?.hasValidPass) return
    const n = Number.parseInt(String(peopleCount).trim(), 10)
    if (!Number.isInteger(n) || n < 1) {
      setError('Indica un número entero ≥ 1.')
      return
    }
    setBusy(true)
    setError('')
    setOkMsg('')
    try {
      const res = await fetch(apiUrl('/api/pool-access/self-admit'), {
        method: 'POST',
        headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ peopleCount: n }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || d.message || `Error ${res.status}`)
      setOkMsg(
        `Entrada registrada: ${d.peopleAdmitted} persona(s). Personas en piscina: ${d.currentOccupancy}${d.poolMaxOccupancy != null ? ` / ${d.poolMaxOccupancy}` : ''}.`,
      )
      setPeopleCount('1')
      await load()
    } catch (e) {
      setError(e.message || 'No se pudo registrar')
    } finally {
      setBusy(false)
    }
  }

  const submitRelease = async () => {
    if (!accessToken) return
    setReleaseBusy(true)
    setError('')
    setOkMsg('')
    try {
      const res = await fetch(apiUrl('/api/pool-access/self-release'), {
        method: 'POST',
        headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || d.message || `Error ${res.status}`)
      setOkMsg(`Salida registrada (${d.releasedPeople} p.). Ahora en piscina: ${d.currentOccupancy}.`)
      await load()
    } catch (e) {
      setError(e.message || 'No se pudo registrar la salida')
    } finally {
      setReleaseBusy(false)
    }
  }

  if (userRole !== 'resident' && userRole !== 'president') {
    return (
      <div className="pool-access-page">
        <p className="pool-access-muted">Solo vecinos o presidentes.</p>
        <Link to="/">Inicio</Link>
      </div>
    )
  }

  if (loading && !preview) {
    return (
      <div className="pool-access-page">
        <p className="pool-access-muted">Cargando…</p>
      </div>
    )
  }

  const maxCap = preview?.maxAdmit
  const canSelfAdmit =
    preview?.poolOpen &&
    preview?.hasValidPass &&
    preview?.poolQuotasComplete !== false &&
    typeof maxCap === 'number' &&
    !preview?.hasOpenSession

  return (
    <div className="pool-access-page pool-self-checkin-page">
      <header className="pool-access-head">
        <h1 className="pool-access-title">Entrada a piscina (autoregistro)</h1>
        <p className="pool-access-sub">
          Pantalla que se abre al <strong>escanear el QR fijo en la puerta</strong>: debes estar <strong>logueado</strong>{' '}
          y tener <strong>código de piscina vigente</strong> (generado en «Acceso piscina»).
        </p>
      </header>

      {okMsg ? (
        <p className="pool-validate-success" role="status">
          {okMsg}
        </p>
      ) : null}
      {error ? <p className="pool-access-error">{error}</p> : null}

      <section className="pool-access-card card">
        <button type="button" className="btn btn--ghost btn--sm pool-self-refresh" onClick={() => void refresh()}>
          Actualizar estado
        </button>
        {!preview?.poolOpen ? (
          <p className="pool-access-muted">La piscina no está operativa ahora (temporada o sistema).</p>
        ) : null}
        {preview?.poolOpen && !preview?.poolQuotasComplete ? (
          <p className="pool-access-error">Completa accesos titular/invitados en tu ficha para poder registrar.</p>
        ) : null}
        {preview?.poolOpen && preview?.poolQuotasComplete !== false && !preview?.hasValidPass ? (
          <p className="pool-access-muted">
            Necesitas un <strong>código vigente</strong>. Ve a{' '}
            <Link to="/pool">Acceso piscina</Link> y pulsa «Generar código» o «Renovar código».
          </p>
        ) : null}
        {preview?.hasValidPass && preview?.passExpiresAt ? (
          <p className="admin-field-hint">
            Pase válido hasta{' '}
            {new Date(preview.passExpiresAt).toLocaleString('es-ES', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </p>
        ) : null}
        {typeof preview?.currentOccupancy === 'number' ? (
          <p className="pool-validate-occ-inline">
            Aforo ahora: <strong>{preview.currentOccupancy}</strong>
            {preview.poolMaxOccupancy != null ? ` / ${preview.poolMaxOccupancy}` : ''}
          </p>
        ) : null}
      </section>

      {preview?.hasOpenSession && preview?.openSession ? (
        <section className="pool-access-card card pool-self-open">
          <h2 className="pool-access-h2">Tienes entrada abierta</h2>
          <p className="pool-access-muted">
            {preview.openSession.peopleCount} persona(s) · entrada{' '}
            {new Date(preview.openSession.admittedAt).toLocaleString('es-ES', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </p>
          <button
            type="button"
            className="btn btn--primary pool-access-gen"
            disabled={releaseBusy}
            onClick={() => void submitRelease()}
          >
            {releaseBusy ? 'Registrando…' : 'Registrar salida'}
          </button>
        </section>
      ) : null}

      {canSelfAdmit ? (
        <section className="pool-access-card card">
          <h2 className="pool-access-h2">Registrar entrada</h2>
          <p className="pool-access-hint">Indica cuántas personas entran (máx. {maxCap} según ficha).</p>
          <label className="admin-label" htmlFor="psc-people">
            Personas
          </label>
          <input
            id="psc-people"
            type="number"
            min={1}
            max={maxCap}
            className="admin-input pool-validate-input"
            value={peopleCount}
            onChange={(e) => setPeopleCount(e.target.value)}
          />
          <button
            type="button"
            className="btn btn--primary pool-access-gen"
            disabled={busy}
            onClick={() => void submitAdmit()}
          >
            {busy ? 'Registrando…' : 'Confirmar entrada'}
          </button>
        </section>
      ) : null}

      <section className="pool-access-card card pool-self-qr-hint">
        <h2 className="pool-access-h2">QR en la puerta</h2>
        <p className="admin-field-hint">
          La administración puede imprimir un QR con esta URL (misma que ves en la barra del navegador al estar aquí):
        </p>
        <p className="pool-self-url mono">
          {typeof window !== 'undefined' ? `${window.location.origin}${routerBase}/pool-self-checkin` : '…'}
        </p>
      </section>

      <p className="pool-access-foot">
        <Link to="/pool">← Acceso piscina (código)</Link>
        {' · '}
        <Link to="/">Inicio</Link>
      </p>
    </div>
  )
}
