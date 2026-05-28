import { getAndroidStoreUrl, isAndroidPlayStorePublished } from '../config/mobileAppStores.js'
import './LoginPlayStoreNotice.css'

/**
 * Aviso en pantalla inicial de login: app Android en Google Play (publicada o próximamente).
 */
export default function LoginPlayStoreNotice() {
  const published = isAndroidPlayStorePublished()
  const storeUrl = getAndroidStoreUrl()

  return (
    <p className="login-play-store-notice" role="note">
      <span className="login-play-store-notice__icon" aria-hidden>
        ▶
      </span>
      {published && storeUrl ? (
        <>
          App Android disponible en{' '}
          <a
            className="login-play-store-notice__link"
            href={storeUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Play
          </a>
        </>
      ) : (
        <>
          App Android: <strong>próximamente en Google Play</strong>
        </>
      )}
    </p>
  )
}
