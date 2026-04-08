import { Link, useSearchParams } from 'react-router-dom'
import { useMemo } from 'react'
import {
  getStorePlatform,
  isMobileUserAgent,
} from '../utils/devicePlatform'
import { resolveNativeOpenHref } from '../utils/resolveNativeOpenHref'
import { getSignInPath } from '../utils/signInWebPath'
import { getAndroidStoreUrl, getIosStoreUrl } from '../config/mobileAppStores'
import DeveloperCredit from '../components/DeveloperCredit'
import { BRAND_LOGO_PNG } from '../syncBrandFavicon.js'
import './OpenAppLanding.css'

function webLoginPath(slug) {
  const s = String(slug || '').trim().toLowerCase()
  if (s) return `/c/${encodeURIComponent(s)}/login`
  return getSignInPath()
}

/**
 * Página para QR y enlaces “inteligentes”: explica app vs web y enlaza a tiendas.
 * El QR puede apuntar aquí: /open-app?slug=mi-comunidad
 * o directamente a la URL HTTPS de login (Universal Links abren la app si está instalada).
 */
export default function OpenAppLanding() {
  const [params] = useSearchParams()
  const slug = useMemo(() => {
    const raw = params.get('slug')
    return raw ? String(raw).trim().toLowerCase() : ''
  }, [params])

  const platform = typeof window !== 'undefined' ? getStorePlatform() : null
  const iosUrl = getIosStoreUrl()
  const androidUrl = getAndroidStoreUrl()
  const isMobile = typeof window !== 'undefined' && isMobileUserAgent()

  const webPath = webLoginPath(slug)

  const universalHttps = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return resolveNativeOpenHref({
      slug: slug || undefined,
      mode: 'https',
      win: window,
    })
  }, [slug])

  const androidIntentHref = useMemo(() => {
    if (typeof window === 'undefined') return '#'
    return resolveNativeOpenHref({
      slug: slug || undefined,
      mode: 'recommended',
      win: window,
    })
  }, [slug])

  const appSchemeHref = useMemo(() => {
    if (typeof window === 'undefined') return '#'
    return resolveNativeOpenHref({
      slug: slug || undefined,
      mode: 'scheme',
      win: window,
    })
  }, [slug])

  return (
    <div className="open-app-page">
      <div className="open-app-page__bg" aria-hidden="true" />
      <div className="open-app-page__shell">
        <div className="open-app-card card">
          <img src={BRAND_LOGO_PNG} alt="" className="open-app-card__logo" width={72} height={72} />
          <h1 className="open-app-card__title">Vecindario en tu móvil</h1>
          <p className="open-app-card__lead">
            {slug ? (
              <>
                Enlace para la comunidad con identificador <strong>{slug}</strong>. El sistema intentará abrir la app si
                la tienes instalada; si no, puedes continuar en el navegador.
              </>
            ) : (
              <>
                Descarga la aplicación Vecindario o entra desde el navegador. Si llegaste desde un QR de tu comunidad,
                usa el enlace que incluye el código de acceso.
              </>
            )}
          </p>

          <div className="open-app-card__block">
            <h2 className="open-app-card__h2">Opción recomendada (mismo enlace para todos)</h2>
            <p className="open-app-card__hint">
              Un QR con esta dirección HTTPS suele abrir la app automáticamente en Android e iOS cuando la app está
              instalada y el dominio está verificado (App Links / Universal Links). Si no hay app, se abre la web.
            </p>
            <code className="open-app-card__url" tabIndex={0}>
              {universalHttps}
            </code>
          </div>

          <div className="open-app-card__actions">
            {isMobile && platform === 'android' ? (
              <a className="btn btn--primary btn--block" href={androidIntentHref}>
                Abrir en la app (Android)
              </a>
            ) : null}
            {isMobile && platform === 'ios' ? (
              <a className="btn btn--primary btn--block" href={universalHttps}>
                Abrir en la app (iOS)
              </a>
            ) : null}
            <Link className="btn btn--secondary btn--block" to={webPath}>
              Continuar en la web
            </Link>
            {isMobile && platform === 'android' ? (
              <a className="btn btn--ghost btn--block" href={appSchemeHref}>
                Abrir con enlace vecindario:// (alternativa)
              </a>
            ) : null}
          </div>

          <div className="open-app-card__block open-app-card__block--stores">
            <h2 className="open-app-card__h2">Instalar la aplicación</h2>
            <p className="open-app-card__hint">
              {platform === 'ios'
                ? 'Parece que usas iPhone o iPad.'
                : platform === 'android'
                  ? 'Parece que usas Android.'
                  : 'Elige tu tienda:'}
            </p>
            <div className="open-app-card__store-row">
              {platform === 'ios' || platform === null ? (
                iosUrl ? (
                  <a className="btn btn--secondary" href={iosUrl} target="_blank" rel="noopener noreferrer">
                    App Store (iOS)
                  </a>
                ) : (
                  <span className="open-app-card__pending">App Store: configura VITE_VECINDARIO_IOS_APP_STORE_URL</span>
                )
              ) : null}
              {platform === 'android' || platform === null ? (
                <a className="btn btn--secondary" href={androidUrl} target="_blank" rel="noopener noreferrer">
                  Google Play (Android)
                </a>
              ) : null}
            </div>
            <p className="open-app-card__hint open-app-card__hint--tight">
              También puedes usar «Descargar app» en la pantalla de inicio de sesión si entras desde el móvil.
            </p>
          </div>

          <p className="open-app-card__foot">
            <Link to={getSignInPath({ forceGeneric: true })} className="auth-link">
              Volver al acceso general
            </Link>
          </p>
        </div>
        <div className="open-app-credit-wrap">
          <DeveloperCredit />
        </div>
      </div>
    </div>
  )
}
