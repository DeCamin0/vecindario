import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import './PoolAccess.css'

const STAFF_POOL_ROLES = new Set(['concierge', 'community_admin'])

export default function PoolAccessPage() {
  const { accessToken, userRole } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [staffData, setStaffData] = useState(null)
  const [issuing, setIssuing] = useState(false)

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    try {
      if (STAFF_POOL_ROLES.has(userRole)) {
        const res = await fetch(apiUrl('/api/pool-access/staff-pool-summary'), {
          headers: jsonAuthHeaders(accessToken),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error || d.message || `Error ${res.status}`)
        setStaffData(d)
        setData(null)
      } else {
        const res = await fetch(apiUrl('/api/pool-access/me'), {
          headers: jsonAuthHeaders(accessToken),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error || d.message || `Error ${res.status}`)
        setData(d)
        setStaffData(null)
      }
    } catch (e) {
      setError(e.message || 'No se pudo cargar')
      setData(null)
      setStaffData(null)
    } finally {
      setLoading(false)
    }
  }, [accessToken, userRole])

  useEffect(() => {
    void load()
  }, [load])

  const issueCode = async () => {
    if (!accessToken) return
    setIssuing(true)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/pool-access/issue-code'), {
        method: 'POST',
        headers: jsonAuthHeaders(accessToken),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || d.message || `Error ${res.status}`)
      await load()
      setData((prev) =>
        prev
          ? {
              ...prev,
              pass: {
                code: d.code,
                expiresAt: d.expiresAt,
                qrPayload: d.qrPayload,
              },
            }
          : prev,
      )
    } catch (e) {
      setError(e.message || 'No se pudo generar el código')
    } finally {
      setIssuing(false)
    }
  }

  if (
    userRole !== 'resident' &&
    userRole !== 'president' &&
    !STAFF_POOL_ROLES.has(userRole)
  ) {
    return (
      <div className="pool-access-page">
        <p className="pool-access-muted">Esta sección es solo para vecinos, presidentes o personal de la comunidad.</p>
        <Link to="/">Volver al inicio</Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="pool-access-page">
        <p className="pool-access-muted">Cargando…</p>
      </div>
    )
  }

  if (error && !data && !staffData) {
    return (
      <div className="pool-access-page">
        <p className="pool-access-error">{error}</p>
        <button type="button" className="pool-access-btn" onClick={() => void load()}>
          Reintentar
        </button>
      </div>
    )
  }

  if (STAFF_POOL_ROLES.has(userRole) && staffData) {
    const ss = staffData.settings
    const poolOpen = Boolean(ss?.poolOpen)
    const occ = staffData.currentOccupancy
    const maxOcc = ss?.poolMaxOccupancy
    const routerBase = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/, '')
    const selfCheckinUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${routerBase}/pool-self-checkin`
        : ''
    const selfCheckinQrSrc = selfCheckinUrl
      ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(selfCheckinUrl)}`
      : null
    return (
      <div className="pool-access-page">
        <header className="pool-access-head">
          <h1 className="pool-access-title">Piscina (resumen)</h1>
          <p className="pool-access-sub">
            {staffData?.community?.name ? `Comunidad: ${staffData.community.name}` : ''}
          </p>
        </header>
        {error ? <p className="pool-access-error">{error}</p> : null}
        <section className={`pool-access-status card ${poolOpen ? 'pool-access-status--ok' : 'pool-access-status--off'}`}>
          <span className="pool-access-status-label">
            {poolOpen ? 'Temporada / sistema activos' : 'Sin acceso operativo'}
          </span>
          <p className="pool-access-status-detail">
            {!ss?.poolAccessSystemEnabled
              ? 'El sistema de códigos está desactivado en la comunidad.'
              : !ss?.poolSeasonActive
                ? 'La temporada de piscina está marcada como inactiva.'
                : poolOpen
                  ? 'Los vecinos generan código en la app y muestran QR o código al socorrista.'
                  : 'Revisa fechas de temporada con la administración.'}
          </p>
          {ss?.poolHoursNote ? (
            <p className="pool-access-hours">
              <strong>Horario indicado:</strong> {ss.poolHoursNote}
            </p>
          ) : null}
        </section>
        <section className="pool-access-card card">
          <h2 className="pool-access-h2">Aforo ahora</h2>
          <p className="pool-access-hint">
            Personas registradas con entrada abierta (autoregistro o socorrista).
          </p>
          <p className="pool-access-code-big" aria-live="polite">
            {typeof occ === 'number' ? occ : '—'}
            {maxOcc != null ? <span className="pool-access-occ-cap"> / {maxOcc}</span> : null}
          </p>
        </section>
        {selfCheckinUrl ? (
          <section className="pool-access-card card pool-access-staff-self-qr-card">
            <h2 className="pool-access-h2">QR autoregistro en puerta</h2>
            <p className="pool-access-hint">
              Misma dirección que en <strong>Gestión → Piscina</strong>. Imprime o guarda el QR; el vecino debe estar{' '}
              <strong>logueado</strong> y tener <strong>código de piscina vigente</strong>.
            </p>
            <p className="pool-access-staff-self-qr-url">{selfCheckinUrl}</p>
            {selfCheckinQrSrc ? (
              <div className="pool-access-staff-self-qr-wrap">
                <img
                  src={selfCheckinQrSrc}
                  alt="QR autoregistro piscina"
                  className="pool-access-staff-self-qr-img"
                  width={220}
                  height={220}
                />
                <p className="pool-access-staff-self-qr-foot">
                  Si no carga la imagen, copia la URL y genera el QR en goqr.me u otro generador.
                </p>
              </div>
            ) : null}
          </section>
        ) : null}
        <section className="pool-access-card card">
          <h2 className="pool-access-h2">Autoregistro en puerta</h2>
          <p className="pool-access-hint">
            Los vecinos <strong>no</strong> abren esto desde «Acceso piscina»: deben{' '}
            <strong>escanear el QR fijo</strong> en la entrada con el móvil (con sesión iniciada y código vigente).
          </p>
        </section>
        <p className="pool-access-foot">
          <Link to="/">← Volver al inicio</Link>
        </p>
      </div>
    )
  }

  const s = data?.settings
  const u = data?.user
  const pass = data?.pass
  const poolOpen = Boolean(s?.poolOpen)
  const poolQuotasComplete = data?.poolQuotasComplete !== false
  const poolQuotasHint = typeof data?.poolQuotasHint === 'string' ? data.poolQuotasHint : null
  const canIssueCode = poolOpen && poolQuotasComplete
  const qrUrl = pass?.qrPayload
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(pass.qrPayload)}`
    : null

  return (
    <div className="pool-access-page">
      <header className="pool-access-head">
        <h1 className="pool-access-title">Acceso piscina</h1>
        <p className="pool-access-sub">
          {data?.community?.name ? `Comunidad: ${data.community.name}` : ''}
        </p>
      </header>

      {error ? <p className="pool-access-error">{error}</p> : null}

      <section className={`pool-access-status card ${poolOpen ? 'pool-access-status--ok' : 'pool-access-status--off'}`}>
        <span className="pool-access-status-label">
          {poolOpen ? 'Temporada / sistema activos' : 'Sin acceso operativo'}
        </span>
        <p className="pool-access-status-detail">
          {!s?.poolAccessSystemEnabled
            ? 'El sistema de códigos está desactivado en la comunidad.'
            : !s?.poolSeasonActive
              ? 'La temporada de piscina está marcada como inactiva.'
              : poolOpen
                ? 'Puedes generar código para entrar.'
                : 'Revisa fechas de temporada con la administración.'}
        </p>
        {s?.poolHoursNote ? (
          <p className="pool-access-hours">
            <strong>Horario indicado:</strong> {s.poolHoursNote}
          </p>
        ) : null}
      </section>

      {poolOpen && !poolQuotasComplete && poolQuotasHint ? (
        <section className="pool-access-status card pool-access-status--quotas" role="status">
          <span className="pool-access-status-label">Falta dato en ficha</span>
          <p className="pool-access-status-detail">{poolQuotasHint}</p>
        </section>
      ) : null}

      {u ? (
        <section className="pool-access-card card">
          <h2 className="pool-access-h2">Tu vivienda</h2>
          <ul className="pool-access-list">
            <li>
              <span className="pool-access-k">Nombre</span> {u.name}
            </li>
            <li>
              <span className="pool-access-k">Portal</span> {u.portal || '—'}
            </li>
            <li>
              <span className="pool-access-k">Piso</span> {u.piso || '—'}
            </li>
            <li>
              <span className="pool-access-k">Puerta</span> {u.puerta || '—'}
            </li>
            {u.habitaciones ? (
              <li>
                <span className="pool-access-k">Habitaciones</span> {u.habitaciones}
              </li>
            ) : null}
            {u.plazaGaraje ? (
              <li>
                <span className="pool-access-k">Plaza garaje</span> {u.plazaGaraje}
              </li>
            ) : null}
            <li>
              <span className="pool-access-k">Accesos titular (dato ficha)</span> {u.poolAccessOwner}
            </li>
            <li>
              <span className="pool-access-k">Accesos invitados (dato ficha)</span> {u.poolAccessGuest}
            </li>
          </ul>
        </section>
      ) : null}

      <section className="pool-access-card card pool-access-code-card">
        <h2 className="pool-access-h2">Código de acceso</h2>
        <p className="pool-access-hint">
          Muestra este código o el QR al socorrista. Si hay autoregistro en puerta, escanea el <strong>QR fijo</strong>{' '}
          de la entrada con el móvil (necesitas código vigente). Caduca a las 24 h (renueva cuando quieras).
        </p>
        {pass ? (
          <>
            <div className="pool-access-code-big" aria-live="polite">
              {pass.code}
            </div>
            <p className="pool-access-expires">
              Válido hasta{' '}
              {new Date(pass.expiresAt).toLocaleString('es-ES', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
            {qrUrl ? (
              <div className="pool-access-qr-wrap">
                <img src={qrUrl} alt="Código QR acceso piscina" className="pool-access-qr" />
              </div>
            ) : null}
            <p className="pool-access-payload mono">{pass.qrPayload}</p>
          </>
        ) : (
          <p className="pool-access-muted">
            {canIssueCode
              ? 'Aún no tienes código. Genera uno si la piscina está abierta.'
              : poolOpen && !poolQuotasComplete
                ? 'No se puede generar código hasta completar accesos titular e invitados en ficha.'
                : 'Aún no tienes código. Genera uno si la piscina está abierta.'}
          </p>
        )}
        <button
          type="button"
          className="btn btn--primary pool-access-gen"
          disabled={issuing || !canIssueCode}
          onClick={() => void issueCode()}
        >
          {issuing ? 'Generando…' : pass ? 'Renovar código' : 'Generar código'}
        </button>
      </section>

      <p className="pool-access-foot">
        <Link to="/">← Volver al inicio</Link>
      </p>
    </div>
  )
}
