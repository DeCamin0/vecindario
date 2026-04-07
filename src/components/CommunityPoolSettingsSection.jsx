import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'

export default function CommunityPoolSettingsSection() {
  const { accessToken, communityId, communityAccessCode } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [name, setName] = useState('')
  const [poolAccessSystemEnabled, setPoolAccessSystemEnabled] = useState(false)
  const [poolSeasonActive, setPoolSeasonActive] = useState(false)
  const [poolSeasonStart, setPoolSeasonStart] = useState('')
  const [poolSeasonEnd, setPoolSeasonEnd] = useState('')
  const [poolHoursNote, setPoolHoursNote] = useState('')
  const [poolMaxOccupancy, setPoolMaxOccupancy] = useState('')

  const load = useCallback(async () => {
    if (!accessToken || communityId == null) return
    setLoading(true)
    setError('')
    try {
      const q = new URLSearchParams()
      const ac = communityAccessCode?.trim()
      if (ac) q.set('accessCode', ac)
      const qs = q.toString()
      const path = `/api/pool-access/community/${communityId}/settings${qs ? `?${qs}` : ''}`
      const res = await fetch(apiUrl(path), { headers: jsonAuthHeaders(accessToken) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || d.message || `Error ${res.status}`)
      setName(d.name || '')
      setPoolAccessSystemEnabled(Boolean(d.poolAccessSystemEnabled))
      setPoolSeasonActive(Boolean(d.poolSeasonActive))
      setPoolSeasonStart(d.poolSeasonStart || '')
      setPoolSeasonEnd(d.poolSeasonEnd || '')
      setPoolHoursNote(d.poolHoursNote || '')
      setPoolMaxOccupancy(d.poolMaxOccupancy != null ? String(d.poolMaxOccupancy) : '')
    } catch (e) {
      setError(e.message || 'No se pudieron cargar los ajustes')
    } finally {
      setLoading(false)
    }
  }, [accessToken, communityId, communityAccessCode])

  useEffect(() => {
    void load()
  }, [load])

  const save = async (e) => {
    e.preventDefault()
    if (!accessToken || communityId == null) return
    setSaving(true)
    setError('')
    setOk('')
    try {
      const capRaw = poolMaxOccupancy.trim()
      let capPayload = null
      if (capRaw !== '') {
        const n = Number.parseInt(capRaw, 10)
        if (!Number.isInteger(n) || n < 1 || n > 5000) {
          throw new Error('Aforo instalación: número entero entre 1 y 5000, o vacío para sin límite.')
        }
        capPayload = n
      }

      const body = {
        communityId,
        poolAccessSystemEnabled,
        poolSeasonActive,
        poolSeasonStart: poolSeasonStart.trim() || null,
        poolSeasonEnd: poolSeasonEnd.trim() || null,
        poolHoursNote: poolHoursNote.trim() || null,
        poolMaxOccupancy: capPayload,
      }
      const ac = communityAccessCode?.trim()
      if (ac) body.accessCode = ac
      const res = await fetch(apiUrl('/api/pool-access/community-settings'), {
        method: 'PATCH',
        headers: { ...jsonAuthHeaders(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || d.message || `Error ${res.status}`)
      setPoolSeasonStart(d.poolSeasonStart || '')
      setPoolSeasonEnd(d.poolSeasonEnd || '')
      setPoolMaxOccupancy(d.poolMaxOccupancy != null ? String(d.poolMaxOccupancy) : '')
      setOk('Guardado.')
    } catch (err) {
      setError(err.message || 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  if (communityId == null) return null

  const routerBase = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/, '')
  const selfCheckinUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${routerBase}/pool-self-checkin`
      : ''
  const selfCheckinQrSrc = selfCheckinUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(selfCheckinUrl)}`
    : null

  return (
    <section className="community-admin-section community-pool-settings">
      <h2 className="community-admin-section-title">Piscina — ajustes de comunidad</h2>
      <p className="community-admin-section-intro">
        {name ? <>Comunidad activa: <strong>{name}</strong>.</> : null} Activa el sistema y la temporada; los vecinos
        podrán generar código cuando todo esté permitido.
      </p>
      {selfCheckinUrl ? (
        <div className="card community-pool-self-qr-card">
          <p className="community-pool-self-qr-intro">
            <strong>QR de autoregistro en puerta:</strong> imprime esta imagen o usa la URL (clic derecho en la imagen →
            guardar). El vecino debe estar <strong>logueado</strong> y tener <strong>código de piscina vigente</strong>{' '}
            generado en la app. La opción con socorrista no cambia.
          </p>
          <p className="community-pool-self-qr-url">{selfCheckinUrl}</p>
          {selfCheckinQrSrc ? (
            <div className="community-pool-self-qr-img-wrap">
              <img
                src={selfCheckinQrSrc}
                alt="Código QR entrada autónoma piscina"
                className="community-pool-self-qr-img"
                width={220}
                height={220}
              />
              <p className="community-pool-self-qr-hint">
                Si no ves la imagen, copia la URL y genera el QR en{' '}
                <a href="https://goqr.me" target="_blank" rel="noopener noreferrer">
                  goqr.me
                </a>{' '}
                o similar.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
      {loading ? (
        <p className="community-admin-section-intro">Cargando…</p>
      ) : (
        <form className="card community-pool-settings-form" onSubmit={(e) => void save(e)}>
          {error ? <p className="auth-error">{error}</p> : null}
          {ok ? <p className="auth-vec-ok">{ok}</p> : null}
          <label className="admin-checkbox-label community-pool-check">
            <input
              type="checkbox"
              checked={poolAccessSystemEnabled}
              onChange={(e) => setPoolAccessSystemEnabled(e.target.checked)}
            />
            <span>Sistema de acceso piscina activo</span>
          </label>
          <label className="admin-checkbox-label community-pool-check">
            <input
              type="checkbox"
              checked={poolSeasonActive}
              onChange={(e) => setPoolSeasonActive(e.target.checked)}
            />
            <span>Temporada activa</span>
          </label>
          <div className="community-pool-row">
            <label className="admin-label" htmlFor="pool-start-ca">
              Inicio temporada
            </label>
            <input
              id="pool-start-ca"
              type="date"
              className="admin-input"
              value={poolSeasonStart}
              onChange={(e) => setPoolSeasonStart(e.target.value)}
            />
          </div>
          <div className="community-pool-row">
            <label className="admin-label" htmlFor="pool-end-ca">
              Fin temporada
            </label>
            <input
              id="pool-end-ca"
              type="date"
              className="admin-input"
              value={poolSeasonEnd}
              onChange={(e) => setPoolSeasonEnd(e.target.value)}
            />
          </div>
          <div className="community-pool-row">
            <label className="admin-label" htmlFor="pool-hours-ca">
              Horario (texto)
            </label>
            <input
              id="pool-hours-ca"
              type="text"
              className="admin-input"
              maxLength={255}
              value={poolHoursNote}
              onChange={(e) => setPoolHoursNote(e.target.value)}
              placeholder="Ej. 10:00–20:00"
            />
          </div>
          <div className="community-pool-row">
            <label className="admin-label" htmlFor="pool-max-occ-ca">
              Aforo máximo en instalación (opcional)
            </label>
            <input
              id="pool-max-occ-ca"
              type="number"
              className="admin-input"
              min={1}
              max={5000}
              inputMode="numeric"
              value={poolMaxOccupancy}
              onChange={(e) => setPoolMaxOccupancy(e.target.value)}
              placeholder="Vacío = sin límite global"
            />
            <p className="admin-field-hint">
              Si lo rellenas, el socorrista no podrá registrar entradas que superen este total en piscina (además del
              límite por ficha).
            </p>
          </div>
          <div className="community-pool-actions">
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar ajustes piscina'}
            </button>
            <button type="button" className="btn btn--ghost" disabled={saving} onClick={() => void load()}>
              Recargar
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
