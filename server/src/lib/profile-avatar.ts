import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const AVATARS_DIR = path.resolve(__dirname, '../../../uploads/avatars')
export const MAX_AVATAR_FILE_BYTES = 900_000

const MIME_TO_EXT: Record<string, 'jpg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export function profileAvatarPublicPath(userId: number, ext: 'jpg' | 'png' | 'webp'): string {
  return `/api/uploads/avatars/${userId}.${ext}`
}

export async function ensureAvatarsDir(): Promise<void> {
  await fs.mkdir(AVATARS_DIR, { recursive: true })
}

export function parseAvatarDataUrl(
  raw: unknown,
): { ok: true; buffer: Buffer; ext: 'jpg' | 'png' | 'webp' } | { ok: false; error: string } {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Envía la imagen en formato data URL (data:image/...;base64,...).' }
  }
  const trimmed = raw.trim()
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(trimmed)
  if (!match) {
    return { ok: false, error: 'Formato de imagen no válido. Usa JPEG, PNG o WebP.' }
  }
  const mime = match[1].toLowerCase().replace('image/jpg', 'image/jpeg')
  const ext = MIME_TO_EXT[mime]
  if (!ext) {
    return { ok: false, error: 'Solo se permiten imágenes JPEG, PNG o WebP.' }
  }
  let buffer: Buffer
  try {
    buffer = Buffer.from(match[2], 'base64')
  } catch {
    return { ok: false, error: 'No se pudo leer la imagen.' }
  }
  if (!buffer.length) {
    return { ok: false, error: 'La imagen está vacía.' }
  }
  if (buffer.length > MAX_AVATAR_FILE_BYTES) {
    return {
      ok: false,
      error: `La imagen es demasiado grande (máx. ${Math.round(MAX_AVATAR_FILE_BYTES / 1024)} KB).`,
    }
  }
  return { ok: true, buffer, ext }
}

export async function deleteAvatarFilesForUser(userId: number): Promise<void> {
  for (const ext of ['jpg', 'png', 'webp'] as const) {
    try {
      await fs.unlink(path.join(AVATARS_DIR, `${userId}.${ext}`))
    } catch {
      /* missing file */
    }
  }
}

export async function writeAvatarFile(
  userId: number,
  buffer: Buffer,
  ext: 'jpg' | 'png' | 'webp',
): Promise<string> {
  await ensureAvatarsDir()
  await deleteAvatarFilesForUser(userId)
  const fileName = `${userId}.${ext}`
  await fs.writeFile(path.join(AVATARS_DIR, fileName), buffer)
  return profileAvatarPublicPath(userId, ext)
}
