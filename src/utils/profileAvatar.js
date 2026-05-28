import { apiUrl } from '../config/api.js'

const MAX_EDGE = 512
const JPEG_QUALITY = 0.85

/**
 * Redimensiona y devuelve data URL JPEG para subir al servidor.
 * @param {File} file
 * @returns {Promise<string>}
 */
export function resizeImageFileForAvatar(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Selecciona una imagen (JPEG, PNG o WebP).'))
      return
    }
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      const max = Math.max(width, height)
      if (max > MAX_EDGE) {
        const scale = MAX_EDGE / max
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('No se pudo procesar la imagen.'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      try {
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
      } catch {
        reject(new Error('No se pudo convertir la imagen.'))
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen.'))
    }
    img.src = url
  })
}

/** URL absoluta para mostrar la foto (con bust de caché opcional). */
export function profileAvatarSrc(profileImageUrl, cacheBust) {
  if (!profileImageUrl || typeof profileImageUrl !== 'string') return null
  const path = profileImageUrl.startsWith('/') ? profileImageUrl : `/${profileImageUrl}`
  const base = apiUrl(path)
  if (!cacheBust) return base
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}t=${encodeURIComponent(String(cacheBust))}`
}
