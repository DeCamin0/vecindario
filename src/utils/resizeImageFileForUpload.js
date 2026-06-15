/** Redimensiona JPEG para subir en JSON (paquetería, servicios, etc.). */

export const MAX_UPLOAD_DATA_URL_CHARS = 900_000
const MAX_EDGE = 1280

export function isImageFile(file) {
  if (!file) return false
  if (typeof file.type === 'string' && file.type.startsWith('image/')) return true
  if (typeof file.name === 'string' && /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)) return true
  return false
}

function encodeCanvas(canvas, quality) {
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * @param {File} file
 * @returns {Promise<string>} data URL JPEG
 */
export function resizeImageFileForUpload(file) {
  return new Promise((resolve, reject) => {
    if (!isImageFile(file)) {
      reject(new Error('Selecciona una imagen (JPEG, PNG o WebP).'))
      return
    }
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let w = img.width
      let h = img.height
      if (!w || !h) {
        reject(new Error('No se pudo leer la imagen.'))
        return
      }

      const tryEncode = (edge, quality) => {
        let width = w
        let height = h
        const max = Math.max(width, height)
        if (max > edge) {
          const scale = edge / max
          width = Math.round(width * scale)
          height = Math.round(height * scale)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return null
        ctx.drawImage(img, 0, 0, width, height)
        try {
          return encodeCanvas(canvas, quality)
        } catch {
          return null
        }
      }

      const edges = [MAX_EDGE, 1024, 800, 640]
      const qualities = [0.85, 0.72, 0.58, 0.45]
      for (const edge of edges) {
        for (const q of qualities) {
          const dataUrl = tryEncode(edge, q)
          if (dataUrl && dataUrl.length <= MAX_UPLOAD_DATA_URL_CHARS) {
            resolve(dataUrl)
            return
          }
        }
      }
      reject(
        new Error(
          'La imagen sigue siendo demasiado grande tras comprimirla. Prueba otra foto o más cercana.',
        ),
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen. Prueba otra foto o desde galería.'))
    }
    img.src = url
  })
}
