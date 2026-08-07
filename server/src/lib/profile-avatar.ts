import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from './prisma.js'
import { isR2Enabled, r2DeleteQuiet, r2Get, r2Put } from './r2-storage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const AVATARS_DIR = path.resolve(__dirname, '../../../uploads/avatars')
export const MAX_AVATAR_FILE_BYTES = 900_000

const MIME_TO_EXT: Record<string, 'jpg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const EXT_TO_MIME: Record<'jpg' | 'png' | 'webp', string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export function profileAvatarPublicPath(userId: number, ext: 'jpg' | 'png' | 'webp'): string {
  return `/api/uploads/avatars/${userId}.${ext}`
}

export function avatarContentType(ext: 'jpg' | 'png' | 'webp'): string {
  return EXT_TO_MIME[ext]
}

/** Docs key: vecindario/{companyId}/users/{userId}/avatar/{yyyy}/{mm}/{uuid}__avatar.{ext} */
export function buildAvatarObjectKey(
  companyId: number,
  userId: number,
  ext: 'jpg' | 'png' | 'webp',
  now = new Date(),
): string {
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `vecindario/${companyId}/users/${userId}/avatar/${yyyy}/${mm}/${randomUUID()}__avatar.${ext}`
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

export async function resolveCompanyIdForAvatar(userId: number): Promise<number> {
  const user = await prisma.vecindarioUser.findUnique({
    where: { id: userId },
    select: {
      companyAdminCompanyId: true,
      community: { select: { companyId: true } },
    },
  })
  return user?.companyAdminCompanyId ?? user?.community?.companyId ?? 0
}

/** Delete on-disk avatar files for a user (all known extensions). */
export async function deleteAvatarDiskFilesForUser(userId: number): Promise<void> {
  for (const ext of ['jpg', 'png', 'webp'] as const) {
    try {
      await fs.unlink(path.join(AVATARS_DIR, `${userId}.${ext}`))
    } catch {
      /* missing file */
    }
  }
}

/**
 * Remove disk + R2 artifacts for a user.
 * Pass storageKey when the DB row is already gone (or about to be).
 */
export async function deleteAvatarFilesForUser(
  userId: number,
  storageKey?: string | null,
): Promise<void> {
  let key = storageKey
  if (key === undefined) {
    const row = await prisma.vecindarioUser.findUnique({
      where: { id: userId },
      select: { profileImageStorageKey: true },
    })
    key = row?.profileImageStorageKey ?? null
  }
  await deleteAvatarDiskFilesForUser(userId)
  await r2DeleteQuiet(key)
}

export type WriteAvatarResult = {
  profileImageUrl: string
  profileImageStorageKey: string | null
}

/**
 * Persist avatar: R2 when configured, otherwise local disk.
 * Public URL stays `/api/uploads/avatars/{userId}.{ext}` for web + mobile.
 */
export async function writeAvatarFile(
  userId: number,
  buffer: Buffer,
  ext: 'jpg' | 'png' | 'webp',
): Promise<WriteAvatarResult> {
  const existing = await prisma.vecindarioUser.findUnique({
    where: { id: userId },
    select: { profileImageStorageKey: true },
  })
  const oldKey = existing?.profileImageStorageKey?.trim() || null
  const publicUrl = profileAvatarPublicPath(userId, ext)

  if (isR2Enabled()) {
    const companyId = await resolveCompanyIdForAvatar(userId)
    const key = buildAvatarObjectKey(companyId, userId, ext)
    await r2Put({
      key,
      body: buffer,
      contentType: avatarContentType(ext),
      metadata: {
        module: 'avatar',
        userId: String(userId),
        companyId: String(companyId),
      },
    })
    await deleteAvatarDiskFilesForUser(userId)
    if (oldKey && oldKey !== key) {
      await r2DeleteQuiet(oldKey)
    }
    return { profileImageUrl: publicUrl, profileImageStorageKey: key }
  }

  await ensureAvatarsDir()
  await deleteAvatarDiskFilesForUser(userId)
  const fileName = `${userId}.${ext}`
  await fs.writeFile(path.join(AVATARS_DIR, fileName), buffer)
  if (oldKey) {
    await r2DeleteQuiet(oldKey)
  }
  return { profileImageUrl: publicUrl, profileImageStorageKey: null }
}

const AVATAR_FILE_RE = /^(\d+)\.(jpg|png|webp)$/i

/**
 * Resolve avatar bytes for GET /api/uploads/avatars/:file — R2 first, then disk.
 */
export async function resolveAvatarFile(
  fileName: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const match = AVATAR_FILE_RE.exec(fileName)
  if (!match) return null
  const userId = Number(match[1])
  const ext = match[2].toLowerCase() as 'jpg' | 'png' | 'webp'
  if (!Number.isFinite(userId) || userId <= 0) return null

  const row = await prisma.vecindarioUser.findUnique({
    where: { id: userId },
    select: { profileImageStorageKey: true },
  })
  const key = row?.profileImageStorageKey?.trim() || ''
  if (key && isR2Enabled()) {
    try {
      const obj = await r2Get(key)
      return {
        buffer: obj.body,
        contentType: obj.contentType || avatarContentType(ext),
      }
    } catch (err) {
      console.warn(
        `[profile avatar] R2 get failed key=${key}:`,
        (err as Error)?.message || err,
      )
    }
  }

  const diskPath = path.join(AVATARS_DIR, `${userId}.${ext}`)
  try {
    const buffer = await fs.readFile(diskPath)
    return { buffer, contentType: avatarContentType(ext) }
  } catch {
    return null
  }
}
