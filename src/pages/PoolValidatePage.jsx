import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PoolValidateQrScanner from '../components/PoolValidateQrScanner.jsx'
import { useAuth } from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import './PoolAccess.css'

const EMPTY_OCC = { currentOccupancy: 0, poolMaxOccupancy: null, sessions: [] }

function normalizeHistoryPayload(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.items)) return []
  return d.items
}

function normalizeOccupancyPayload(d) {
  if (!d || typeof d !== 'object') return { ...EMPTY_OCC }
  const currentOccupancy =
    typeof d.currentOccupancy === 'number' && Number.isFinite(d.currentOccupancy)
      ? Math.max(0, Math.trunc(d.currentOccupancy))
      : 0
  let poolMaxOccupancy = null
  if (
    d.poolMaxOccupancy != null &&
    typeof d.poolMaxOccupancy === 'number' &&
    Number.isFinite(d.poolMaxOccupancy) &&
    d.poolMaxOccupancy >= 1
  ) {
    poolMaxOccupancy = Math.trunc(d.poolMaxOccupancy)
  }
  const sessions = Array.isArray(d.sessions) ? d.sessions : []
  return { currentOccupancy, poolMaxOccupancy, sessions }
}

export default function PoolValidatePage() {
  const { accessToken, userRole } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [peopleCount, setPeopleCount] = useState('1')
  const [admitBusy, setAdmitBusy] = useState(false)
  const [releaseBusyId, setReleaseBusyId] = useState(null)
  const [occ, setOcc] = useState(null)
  const [occLoading, setOccLoading] = useState(true)
  const [admitOk, setAdmitOk] = useState('')
  const [scanOpen, setScanOpen] = useState(false)
  const [historyItems, setHistoryItems] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const loadHistory = useCallback(
    async (silent = false) => {
      if (!accessToken) {
        setHistoryItems([])
        if (!silent) setHistoryLoading(false)
        return
      }
      if (!silent) setHistoryLoading(true)
      try {
        const res = await fetch(apiUrl('/api/pool-access/history?limit=50'), {
          headers: jsonAuthHeaders(accessToken),
        })
        const d = await res.json().catch(() => ({}))
        if (res.ok) {
          setHistoryItems(normalizeHistoryPayload(d))
        } else if (!silent) {
          setHistoryItems([])
        }
      } catch {
        if (!silent) setHistoryItems([])
      } finally {
        if (!silent) setHistoryLoading(false)
      }
    },
    [accessToken],
  )

  const loadOccupancy = useCallback(
    async (silent = false) => {
      if (!accessToken) {
        setOcc({ ...EMPTY_OCC })
        if (!silent) setOccLoading(false)
        return
      }
      if (!silent) setOccLoading(true)
      try {
        const res = await fetch(apiUrl('/api/pool-access/occupancy'), {
          headers: jsonAuthHeaders(accessToken),
        })
        const d = await res.json().catch(() => ({}))
        if (res.ok) {
          setOcc(normalizeOccupancyPayload(d))
        } else if (!silent) {
          setOcc({ ...EMPTY_OCC })
        }
      } catch {
        if (!silent) setOcc({ ...EMPTY_OCC })
      } finally {
        if (!silent) setOccLoading(false)
      }
    },
    [accessToken],
  )

  useEffect(() => {
    void loadOccupancy(false)
    void loadHistory(false)
  }, [loadOccupancy, loadHistory])

  useEffect(() => {
    if (!admitOk) return
    const t = setTimeout(() => setAdmitOk(''), 8000)
    return () => clearTimeout(t)
  }, [admitOk])

  if (userRole !== 'pool_staff') {
    return (
      <div className="pool-access-page">
        <p className="pool-access-muted">Solo personal de piscina (socorrista).</p>
        <Link to="/">Inicio</Link>
      </div>
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!accessToken) return
    const raw = code.trim()
    if (!raw) {
      setError('Escribe o pega el código.')
      return
    }
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch(apiUrl('/api/pool-access/validate'), {
        method: 'POST',
        headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: raw }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || d.message || `Error ${res.status}`)
      setResult(d)
      if (d.valid && typeof d.maxAdmit === 'number') {
        setPeopleCount(String(Math.min(d.maxAdmit, Math.max(1, Number(peopleCount) || 1))))
      }
      void loadOccupancy(true)
    } catch (err) {
      setError(err.message || 'Error de red')
    } finally {
      setBusy(false)
    }
  }

  const admit = async () => {
    if (!accessToken || !result?.valid || !result.normalizedCode) return
    const n = Number.parseInt(String(peopleCount).trim(), 10)
    if (!Number.isInteger(n) || n < 1) {
      setError('Indica cuántas personas entran (número entero ≥ 1).')
      return
    }
    setAdmitBusy(true)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/pool-access/admit'), {
        method: 'POST',
        headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: result.normalizedCode, peopleCount: n }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || d.message || `Error ${res.status}`)
      setResult(null)
      setCode('')
      setPeopleCount('1')
      await loadOccupancy(true)
      void loadHistory(true)
      setError('')
      setAdmitOk(
        `Entrada registrada: ${d.peopleAdmitted} persona(s). En piscina: ${d.currentOccupancy}${d.poolMaxOccupancy != null ? ` / ${d.poolMaxOccupancy}` : ''}.`,
      )
    } catch (err) {
      setError(err.message || 'No se pudo registrar la entrada')
    } finally {
      setAdmitBusy(false)
    }
  }

  const release = async (sessionId) => {
    if (!accessToken) return
    setReleaseBusyId(sessionId)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/pool-access/release'), {
        method: 'POST',
        headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || d.message || `Error ${res.status}`)
      await loadOccupancy(true)
      void loadHistory(true)
    } catch (err) {
      setError(err.message || 'No se pudo registrar la salida')
    } finally {
      setReleaseBusyId(null)
    }
  }

  const r = result?.resident
  const maxCap = result?.maxAdmit
  const occDisplay = occ ?? EMPTY_OCC
  const occMax = occDisplay.poolMaxOccupancy

  return (
    <div className="pool-access-page pool-validate-page">
      {admitOk ? (
        <p className="pool-validate-success" role="status">
          {admitOk}
        </p>
      ) : null}

      <header className="pool-access-head">
        <h1 className="pool-access-title">Validar acceso piscina</h1>
        <p className="pool-access-sub">
          Escribe el código, pégalo desde el QR o usa <strong>Escanear QR</strong> con la cámara; luego indica cuántas
          personas entran.
        </p>
      </header>

      {occLoading ? (
        <section className="pool-occ-banner card pool-occ-banner--loading" aria-live="polite">
          <p className="pool-access-muted pool-occ-loading-msg">Cargando ocupación…</p>
        </section>
      ) : (
        <section className="pool-occ-banner card" aria-live="polite">
          <div className="pool-occ-title">Ocupación en instalación</div>
          <div className="pool-occ-numbers">
            <strong>{occDisplay.currentOccupancy}</strong>
            {occMax != null ? (
              <>
                {' '}
                / {occMax} plazas
              </>
            ) : (
              ' personas dentro'
            )}
          </div>
          {occDisplay.sessions?.length > 0 ? (
            <ul className="pool-occ-sessions">
              {occDisplay.sessions.map((s) => (
                <li key={s.id} className="pool-occ-session-row">
                  <span>
                    {s.resident?.name} · {s.peopleCount} p. ·{' '}
                    {new Date(s.admittedAt).toLocaleTimeString('es-ES', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={releaseBusyId === s.id}
                    onClick={() => void release(s.id)}
                  >
                    {releaseBusyId === s.id ? '…' : 'Registrar salida'}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pool-access-muted pool-occ-empty">Nadie registrado dentro ahora.</p>
          )}
        </section>
      )}

      <section className="pool-history-card card" aria-labelledby="pool-history-heading">
        <div className="pool-history-head">
          <h2 id="pool-history-heading" className="pool-history-title">
            Historial entradas / salidas
          </h2>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={historyLoading}
            onClick={() => void loadHistory(false)}
          >
            {historyLoading ? '…' : 'Actualizar'}
          </button>
        </div>
        <p className="admin-field-hint pool-history-intro">Últimos registros de acceso a piscina (entrada y salida).</p>
        {historyLoading ? (
          <p className="pool-access-muted">Cargando historial…</p>
        ) : historyItems.length === 0 ? (
          <p className="pool-access-muted">Aún no hay entradas registradas.</p>
        ) : (
          <ul className="pool-history-list">
            {historyItems.map((h) => (
              <li key={h.id} className="pool-history-row">
                <div className="pool-history-main">
                  <span className="pool-history-resident">{h.resident?.name || 'Vecino'}</span>
                  <span className="pool-history-dwelling">
                    {[h.resident?.portal, h.resident?.piso, h.resident?.puerta].filter(Boolean).join(' · ') || '—'}
                  </span>
                </div>
                <div className="pool-history-meta">
                  <span>
                    <strong>{h.peopleCount}</strong> pers. · entrada{' '}
                    {new Date(h.admittedAt).toLocaleString('es-ES', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {h.inside ? (
                    <span className="pool-history-badge pool-history-badge--in">Dentro</span>
                  ) : h.releasedAt ? (
                    <span>
                      · salida{' '}
                      {new Date(h.releasedAt).toLocaleString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  ) : null}
                </div>
                <div className="pool-history-foot">
                  <span className="pool-access-muted">Socorrista: {h.validatorLabel || '—'}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PoolValidateQrScanner
        active={scanOpen}
        onDecoded={(text) => {
          setCode(text.trim())
          setError('')
          setResult(null)
        }}
        onUserClose={() => setScanOpen(false)}
        onCameraError={(msg) => {
          setError(
            msg
              ? `Cámara: ${msg}. Prueba HTTPS, permisos del navegador o escribe el código a mano.`
              : 'No se pudo usar la cámara. Escribe el código o pégalo.',
          )
        }}
      />

      <form onSubmit={(e) => void submit(e)} className="pool-validate-form card">
        <label className="admin-label" htmlFor="pv-code">
          Código / payload
        </label>
        <div className="pool-validate-code-row">
          <input
            id="pv-code"
            className="admin-input pool-validate-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Ej. ABCD1234 o vecindario:pool:v1:…"
            autoComplete="off"
            autoCapitalize="characters"
          />
          <button
            type="button"
            className="btn btn--secondary btn--scan"
            onClick={() => {
              setError('')
              setScanOpen(true)
            }}
          >
            Escanear QR
          </button>
        </div>
        {error ? <p className="pool-access-error">{error}</p> : null}
        <button type="submit" className="btn btn--primary pool-validate-submit" disabled={busy}>
          {busy ? 'Comprobando…' : 'Validar'}
        </button>
      </form>

      {result ? (
        <section
          className={`pool-validate-result card ${result.valid ? 'pool-validate-result--ok' : 'pool-validate-result--bad'}`}
          aria-live="polite"
        >
          <div className="pool-validate-verdict">{result.valid ? 'VÁLIDO' : 'NO VÁLIDO'}</div>
          {result.reason ? <p className="pool-validate-reason">{result.reason}</p> : null}
          {result.valid && result.occupancy ? (
            <p className="pool-validate-occ-inline">
              Aforo ahora: <strong>{result.occupancy.current}</strong>
              {result.occupancy.max != null ? (
                <>
                  {' '}
                  / {result.occupancy.max}
                </>
              ) : null}
            </p>
          ) : null}
          {result.valid && result.hasOpenSession && result.openSession ? (
            <p className="pool-validate-warn">
              Esta vivienda ya tiene entrada abierta ({result.openSession.peopleCount} p.). Registra la salida en
              la lista de arriba antes de una nueva entrada.
            </p>
          ) : null}
          {r ? (
            <ul className="pool-access-list pool-validate-details">
              <li>
                <span className="pool-access-k">Vecino</span> {r.name}
              </li>
              <li>
                <span className="pool-access-k">Portal / piso / puerta</span>{' '}
                {[r.portal, r.piso, r.puerta].filter(Boolean).join(' · ') || '—'}
              </li>
              <li>
                <span className="pool-access-k">Accesos titular (ficha)</span> {r.poolAccessOwner}
              </li>
              <li>
                <span className="pool-access-k">Accesos invitados (ficha)</span> {r.poolAccessGuest}
              </li>
              {result.valid && maxCap != null ? (
                <li>
                  <span className="pool-access-k">Máx. este acceso</span> {maxCap} persona(s) (titular + invitados)
                </li>
              ) : null}
            </ul>
          ) : null}

          {result.valid && !result.hasOpenSession && maxCap != null ? (
            <div className="pool-admit-block">
              <label className="admin-label" htmlFor="pv-people">
                Personas que entran ahora
              </label>
              <input
                id="pv-people"
                type="number"
                min={1}
                max={maxCap}
                className="admin-input pool-validate-input"
                value={peopleCount}
                onChange={(e) => setPeopleCount(e.target.value)}
              />
              <p className="admin-field-hint">Entre 1 y {maxCap} según ficha.</p>
              <button
                type="button"
                className="btn btn--primary pool-validate-submit"
                disabled={admitBusy}
                onClick={() => void admit()}
              >
                {admitBusy ? 'Registrando…' : 'Registrar entrada'}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <p className="pool-access-foot">
        <Link to="/profile">Perfil</Link>
      </p>
    </div>
  )
}
