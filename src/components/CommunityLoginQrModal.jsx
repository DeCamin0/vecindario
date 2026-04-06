import { useEffect, useState } from 'react'

/**
 * Modal: genera QR del URL de login (cliente) con librería qrcode.
 */
export default function CommunityLoginQrModal({ url, fileSafeName, onClose }) {
  const [dataUrl, setDataUrl] = useState('')
  const [genError, setGenError] = useState('')

  useEffect(() => {
    if (!url) return undefined
    let cancelled = false
    setDataUrl('')
    setGenError('')
    import('qrcode')
      .then((m) => {
        const QR = m.default
        return QR.toDataURL(url, {
          margin: 2,
          width: 280,
          color: { dark: '#0f172a', light: '#ffffff' },
        })
      })
      .then((u) => {
        if (!cancelled) setDataUrl(u)
      })
      .catch(() => {
        if (!cancelled) setGenError('No se pudo generar el código QR.')
      })
    return () => {
      cancelled = true
    }
  }, [url])

  const download = () => {
    if (!dataUrl) return
    const base = (fileSafeName || 'comunidad').replace(/[^a-z0-9-_]+/gi, '-').slice(0, 48)
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `vecindario-acceso-${base}.png`
    a.rel = 'noopener'
    a.click()
  }

  return (
    <div className="admin-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="admin-modal card"
        role="dialog"
        aria-labelledby="admin-qr-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 id="admin-qr-title" className="admin-modal-title">
          Código QR — acceso vecinos
        </h2>
        <p className="admin-field-hint admin-field-hint--block break-all">{url}</p>
        {genError && (
          <p className="auth-error" role="alert">
            {genError}
          </p>
        )}
        {dataUrl ? (
          <div className="admin-qr-preview">
            <img src={dataUrl} width={280} height={280} alt="Código QR de acceso a la comunidad" />
          </div>
        ) : !genError ? (
          <p className="admin-field-hint">Generando…</p>
        ) : null}
        <div className="admin-modal-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cerrar
          </button>
          <button type="button" className="btn btn--primary" disabled={!dataUrl} onClick={download}>
            Descargar PNG
          </button>
        </div>
      </div>
    </div>
  )
}
