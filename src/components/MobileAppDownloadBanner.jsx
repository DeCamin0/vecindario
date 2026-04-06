import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getStorePlatform,
  isMobileUserAgent,
  isProbablyStandalonePWA,
} from '../utils/devicePlatform'
import { getPreferredStoreUrl } from '../config/mobileAppStores'
import './MobileAppDownloadBanner.css'

const DISMISS_KEY = 'vecindario-mobile-app-banner-dismiss'

export default function MobileAppDownloadBanner() {
  const navigate = useNavigate()
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return
    } catch {
      /* ignore */
    }
    if (!isMobileUserAgent() || isProbablyStandalonePWA()) return
    setShow(true)
  }, [])

  if (!show) return null

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
    setShow(false)
  }

  const onDownload = () => {
    const platform = getStorePlatform()
    const storeUrl = getPreferredStoreUrl(platform)
    if (storeUrl) {
      window.open(storeUrl, '_blank', 'noopener,noreferrer')
      return
    }
    navigate('/open-app')
  }

  return (
    <div className="mobile-app-banner" role="region" aria-label="Aplicación móvil Vecindario">
      <div className="mobile-app-banner__inner">
        <p className="mobile-app-banner__text">
          ¿Usas el móvil? Descarga la app Vecindario para acceso directo y notificaciones.
        </p>
        <div className="mobile-app-banner__actions">
          <button type="button" className="btn btn--primary btn--sm mobile-app-banner__btn" onClick={onDownload}>
            Descargar app
          </button>
          <button type="button" className="mobile-app-banner__dismiss" onClick={dismiss} aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      </div>
    </div>
  )
}
