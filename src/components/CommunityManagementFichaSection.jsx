import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import { buildCommunityLoginUrl } from '../utils/communityLoginUrl.js'
import CommunityLoginQrModal from './CommunityLoginQrModal.jsx'

function communityStatusLabel(status) {
  if (status === 'demo') return 'Demo'
  if (status === 'inactive') return 'Inactiva'
  if (status === 'pending_approval') return 'Pendiente de aprobación'
  return 'Activa'
}

export default function CommunityManagementFichaSection() {
  const { accessToken, communityId, communityAccessCode } = useAuth()
  const [ficha, setFicha] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copyOk, setCopyOk] = useState('')
  const [qrModal, setQrModal] = useState(null)

  const load = useCallback(async () => {
    if (!accessToken || communityId == null) {
      setFicha(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    setCopyOk('')
    try {
      const q = new URLSearchParams({ communityId: String(communityId) })
      const ac = communityAccessCode?.trim()
      if (ac) q.set('accessCode', ac.toUpperCase())
      const res = await fetch(apiUrl(`/api/community/management-ficha?${q}`), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.message || `Error ${res.status}`)
      setFicha(data)
    } catch (e) {
      setFicha(null)
      setError(e.message || 'No se pudo cargar la ficha')
    } finally {
      setLoading(false)
    }
  }, [accessToken, communityId, communityAccessCode])

  useEffect(() => {
    void load()
  }, [load])

  const copyLoginUrl = async () => {
    const slug = ficha?.loginSlug?.trim()
    const url = buildCommunityLoginUrl(slug)
    if (!url) {
      setError('Sin slug configurado para el enlace de acceso.')
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopyOk('Enlace copiado al portapapeles.')
      setError('')
    } catch {
      setError('No se pudo copiar. Copia el enlace manualmente.')
    }
  }

  if (loading) {
    return (
      <section className="community-admin-section community-mgmt-ficha">
        <p className="community-admin-section-intro">Cargando ficha de la comunidad…</p>
      </section>
    )
  }

  if (error && !ficha) {
    return (
      <section className="community-admin-section community-mgmt-ficha">
        <p className="auth-error" role="alert">
          {error}
        </p>
      </section>
    )
  }

  if (!ficha) return null

  const loginUrl = buildCommunityLoginUrl(ficha.loginSlug)
  const statusClass = `admin-community-status admin-community-status--${ficha.status || 'active'}`

  return (
    <section className="community-admin-section community-mgmt-ficha">
      <h2 className="community-admin-section-title">Datos de la comunidad</h2>
      <p className="community-admin-section-intro">
        Información de la ficha (solo lectura). Para editarla, el super administrador o la empresa
        gestora deben actualizar la comunidad en su panel.
      </p>
      <article className="admin-community-row card community-mgmt-ficha-card">
        <div className="admin-community-info">
          <div className="admin-community-head">
            <h3 className="admin-community-name">{ficha.name || '—'}</h3>
            <span className={statusClass}>{communityStatusLabel(ficha.status)}</span>
          </div>
          <div className="admin-community-details">
            <span className="admin-community-detail">
              <span className="admin-community-detail-label">ID</span>
              {ficha.id}
            </span>
            <span className="admin-community-detail">
              <span className="admin-community-detail-label">Empresa</span>
              {ficha.companyName || '—'}
            </span>
            <span className="admin-community-detail">
              <span className="admin-community-detail-label">NIF/CIF</span>
              {ficha.nifCif || '—'}
            </span>
            <span className="admin-community-detail admin-community-detail--block">
              <span className="admin-community-detail-label">Dirección</span>
              <span className="admin-address-preview">{ficha.address || '—'}</span>
            </span>
            <span className="admin-community-detail">
              <span className="admin-community-detail-label">Code</span>
              <code>{ficha.accessCode || '—'}</code>
            </span>
            <span className="admin-community-detail admin-community-detail--block">
              <span className="admin-community-detail-label">Enlace acceso (vecinos)</span>
              {loginUrl ? (
                <span className="admin-public-link-block">
                  <code className="admin-code-break">{loginUrl}</code>
                  <span className="admin-public-link-actions">
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => void copyLoginUrl()}>
                      Copiar
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() =>
                        setQrModal({
                          url: loginUrl,
                          fileSafeName: ficha.loginSlug || String(ficha.id),
                        })
                      }
                    >
                      QR
                    </button>
                  </span>
                </span>
              ) : (
                <p className="admin-field-hint admin-field-hint--block">
                  Sin slug corto en la ficha. Pide al super administrador que configure el «Slug enlace de
                  acceso».
                </p>
              )}
            </span>
          </div>
        </div>
      </article>
      {copyOk ? (
        <p className="community-admin-section-intro" role="status">
          {copyOk}
        </p>
      ) : null}
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      {qrModal?.url ? (
        <CommunityLoginQrModal
          url={qrModal.url}
          fileSafeName={qrModal.fileSafeName}
          onClose={() => setQrModal(null)}
        />
      ) : null}
    </section>
  )
}
