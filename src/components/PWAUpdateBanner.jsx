import { useRegisterSW } from 'virtual:pwa-register/react'
import './PWAUpdateBanner.css'

export default function PWAUpdateBanner() {
  const {
    needRefresh: [needRefreshState, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      if (registration) {
        setInterval(() => registration.update(), 60 * 60 * 1000)
      }
    },
  })

  const handleUpdate = () => {
    setNeedRefresh(false)
    updateServiceWorker()
  }

  const handleDismiss = () => setNeedRefresh(false)

  if (!needRefreshState) return null

  return (
    <div className="pwa-update-banner" role="status" aria-live="polite">
      <p className="pwa-update-banner-text">Hay una nueva versión disponible.</p>
      <div className="pwa-update-banner-actions">
        <button
          type="button"
          className="btn btn--primary pwa-update-banner-btn"
          onClick={handleUpdate}
        >
          Actualizar
        </button>
        <button
          type="button"
          className="btn btn--ghost pwa-update-banner-btn"
          onClick={handleDismiss}
          aria-label="Cerrar"
        >
          Ahora no
        </button>
      </div>
    </div>
  )
}
