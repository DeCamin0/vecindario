import { useCallback, useEffect, useState } from 'react'

/**
 * Galería de fotos de solicitud de servicio: miniaturas + lightbox (ESC / clic fuera / botón cerrar).
 */
export default function ServiceRequestPhotoGallery({ photos, heading = 'Fotos' }) {
  const [lightboxSrc, setLightboxSrc] = useState(null)

  const close = useCallback(() => setLightboxSrc(null), [])

  useEffect(() => {
    if (!lightboxSrc) return
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxSrc, close])

  if (!Array.isArray(photos) || photos.length === 0) return null

  return (
    <>
      <section className="sr-gallery" aria-label={heading}>
        <h2 className="sr-gallery__h">{heading}</h2>
        <div className="sr-gallery__grid">
          {photos.map((src, i) => (
            <button
              key={i}
              type="button"
              className="sr-gallery__cell sr-gallery__cell--btn"
              onClick={() => setLightboxSrc(src)}
            >
              <img src={src} alt={`Foto ${i + 1} de la solicitud`} className="sr-gallery__img" />
              <span className="sr-gallery__zoom">Ver grande</span>
            </button>
          ))}
        </div>
      </section>

      {lightboxSrc ? (
        <div
          className="sr-photo-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Vista ampliada de la foto"
          onClick={close}
        >
          <button
            type="button"
            className="sr-photo-lightbox__close"
            onClick={close}
            aria-label="Cerrar"
          >
            ×
          </button>
          <img
            src={lightboxSrc}
            alt=""
            className="sr-photo-lightbox__img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  )
}
