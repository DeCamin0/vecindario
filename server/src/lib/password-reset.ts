/**
 * Recuperación de contraseña (self-serve).
 *
 * - Token: 32 bytes random → base64url (solo en email; DB = SHA-256 hex).
 * - TTL: 60 minutos.
 * - Un solo uso; al forgot se invalidan tokens activos previos del usuario.
 * - passwordPlainSnapshot: se pone null al reset (no guardar nueva clave en claro).
 * - JWT previos: no se revocan (sin denylist hoy); caducan con JWT_EXPIRES_IN.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcrypt'
import { prisma } from './prisma.js'
import { isMailConfigured, sendMail } from './mail.js'
import { vecindarioPublicBaseUrl } from './public-app-url.js'
import { buildPasswordResetEmailContent } from './password-reset-mail.js'

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000
export const PASSWORD_MIN_LENGTH = 6
export const FORGOT_GENERIC_MESSAGE =
  'Si existe una cuenta con ese correo, te hemos enviado instrucciones para restablecer la contraseña. Revisa tu bandeja de entrada y el spam.'

/** Rate limit: por IP (ventana 15 min). */
export const FORGOT_RATE_LIMIT_IP = 10
export const FORGOT_RATE_WINDOW_IP_MS = 15 * 60 * 1000
/** Rate limit: por email normalizado (ventana 1 h). */
export const FORGOT_RATE_LIMIT_EMAIL = 5
export const FORGOT_RATE_WINDOW_EMAIL_MS = 60 * 60 * 1000

export function normalizeResetEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim().toLowerCase()
  if (!t || !t.includes('@') || t.length > 255) return null
  return t
}

export function generatePasswordResetTokenPlain(): string {
  return randomBytes(32).toString('base64url')
}

export function hashPasswordResetToken(plainToken: string): string {
  return createHash('sha256').update(plainToken, 'utf8').digest('hex')
}

export function passwordResetExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + PASSWORD_RESET_TTL_MS)
}

export function vecindarioPasswordResetUrl(plainToken: string): string {
  const base = vecindarioPublicBaseUrl()
  const q = encodeURIComponent(plainToken)
  return `${base}/restablecer-contrasena?token=${q}`
}

export function vecindarioForgotPasswordUrl(): string {
  return `${vecindarioPublicBaseUrl()}/olvidar-contrasena`
}

export type NewPasswordValidation =
  | { ok: true; password: string }
  | { ok: false; error: string }

export function validateNewPasswordPair(
  newPassword: unknown,
  confirmPassword: unknown,
): NewPasswordValidation {
  if (typeof newPassword !== 'string' || typeof confirmPassword !== 'string') {
    return { ok: false, error: 'Indica la nueva contraseña y su confirmación.' }
  }
  if (!newPassword || !confirmPassword) {
    return { ok: false, error: 'Indica la nueva contraseña y su confirmación.' }
  }
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    }
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: 'La contraseña y la confirmación no coinciden.' }
  }
  return { ok: true, password: newPassword }
}

/** Comparación timing-safe de hashes hex SHA-256. */
export function tokenHashesEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex')
    const bb = Buffer.from(b, 'hex')
    if (ba.length !== bb.length || ba.length === 0) return false
    return timingSafeEqual(ba, bb)
  } catch {
    return false
  }
}

/** Rate limiter en memoria (proceso). Suficiente para un solo nodo API. */
export class SlidingWindowRateLimiter {
  private hits = new Map<string, number[]>()

  constructor(private readonly nowFn: () => number = () => Date.now()) {}

  /** true = permitido; false = limitado. */
  allow(key: string, limit: number, windowMs: number): boolean {
    const now = this.nowFn()
    const cutoff = now - windowMs
    const prev = this.hits.get(key) ?? []
    const recent = prev.filter((t) => t > cutoff)
    if (recent.length >= limit) {
      this.hits.set(key, recent)
      return false
    }
    recent.push(now)
    this.hits.set(key, recent)
    return true
  }

  reset(): void {
    this.hits.clear()
  }

  peekCount(key: string, windowMs: number): number {
    const cutoff = this.nowFn() - windowMs
    return (this.hits.get(key) ?? []).filter((t) => t > cutoff).length
  }
}

export const forgotPasswordRateLimiter = new SlidingWindowRateLimiter()

export function checkForgotPasswordRateLimits(opts: {
  ip: string
  email: string
  limiter?: SlidingWindowRateLimiter
}): { ok: true } | { ok: false; retryAfterHint: string } {
  const limiter = opts.limiter ?? forgotPasswordRateLimiter
  const ipKey = `ip:${opts.ip || 'unknown'}`
  const emailKey = `email:${opts.email}`
  if (!limiter.allow(ipKey, FORGOT_RATE_LIMIT_IP, FORGOT_RATE_WINDOW_IP_MS)) {
    return {
      ok: false,
      retryAfterHint: 'Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.',
    }
  }
  if (!limiter.allow(emailKey, FORGOT_RATE_LIMIT_EMAIL, FORGOT_RATE_WINDOW_EMAIL_MS)) {
    return {
      ok: false,
      retryAfterHint: 'Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.',
    }
  }
  return { ok: true }
}

export class ForgotPasswordRateLimitError extends Error {
  status = 429
  constructor(message: string) {
    super(message)
    this.name = 'ForgotPasswordRateLimitError'
  }
}

export type PasswordResetTokenRow = {
  id: number
  userId: number
  tokenHash: string
  expiresAt: Date
  usedAt: Date | null
}

export type PasswordResetUserRow = {
  id: number
  email: string
  passwordHash: string
  passwordPlainSnapshot: string | null
}

/** Abstracción para tests (memoria) y producción (Prisma). */
export type PasswordResetRepo = {
  findUserByEmail: (email: string) => Promise<{ id: number; email: string } | null>
  createResetToken: (data: {
    userId: number
    tokenHash: string
    expiresAt: Date
    requestIp: string | null
    userAgent: string | null
  }) => Promise<void>
  /** Marca usedAt en tokens activos (usedAt null) del usuario. */
  invalidateActiveTokens: (userId: number, usedAt: Date) => Promise<void>
  findTokenByHash: (tokenHash: string) => Promise<PasswordResetTokenRow | null>
  applyPasswordReset: (data: {
    tokenId: number
    userId: number
    passwordHash: string
    usedAt: Date
  }) => Promise<void>
  findUserById: (id: number) => Promise<PasswordResetUserRow | null>
}

export function createPrismaPasswordResetRepo(): PasswordResetRepo {
  return {
    async findUserByEmail(email) {
      const u = await prisma.vecindarioUser.findFirst({
        where: { email },
        select: { id: true, email: true },
      })
      if (!u?.email) return null
      return { id: u.id, email: u.email }
    },
    async createResetToken(data) {
      await prisma.passwordResetToken.create({ data })
    },
    async invalidateActiveTokens(userId, usedAt) {
      await prisma.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt },
      })
    },
    async findTokenByHash(tokenHash) {
      return prisma.passwordResetToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          userId: true,
          tokenHash: true,
          expiresAt: true,
          usedAt: true,
        },
      })
    },
    async applyPasswordReset({ tokenId, userId, passwordHash, usedAt }) {
      await prisma.$transaction(async (tx) => {
        await tx.vecindarioUser.update({
          where: { id: userId },
          data: { passwordHash, passwordPlainSnapshot: null },
        })
        await tx.passwordResetToken.update({
          where: { id: tokenId },
          data: { usedAt },
        })
        await tx.passwordResetToken.updateMany({
          where: { userId, usedAt: null, id: { not: tokenId } },
          data: { usedAt },
        })
      })
    },
    async findUserById(id) {
      return prisma.vecindarioUser.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          passwordPlainSnapshot: true,
        },
      }) as Promise<PasswordResetUserRow | null>
    },
  }
}

export type ForgotPasswordResult = {
  message: string
  emailSent: boolean
  userFound: boolean
  /** Solo tests: token plano emitido (nunca loguear en prod). */
  _testPlainToken?: string
  /** Solo tests: hash guardado. */
  _testTokenHash?: string
}

/**
 * Solicitud forgot: respuesta exterior siempre genérica.
 */
export async function requestPasswordReset(opts: {
  emailRaw: unknown
  ip?: string | null
  userAgent?: string | null
  send?: typeof sendMail
  mailConfigured?: () => boolean
  limiter?: SlidingWindowRateLimiter
  repo?: PasswordResetRepo
  /** Solo tests: devolver token plano en resultado. */
  exposeTokenForTests?: boolean
}): Promise<ForgotPasswordResult> {
  const message = FORGOT_GENERIC_MESSAGE
  const email = normalizeResetEmail(opts.emailRaw)
  if (!email) {
    return { message, emailSent: false, userFound: false }
  }

  const rate = checkForgotPasswordRateLimits({
    ip: (opts.ip || '').trim() || 'unknown',
    email,
    limiter: opts.limiter,
  })
  if (!rate.ok) {
    throw new ForgotPasswordRateLimitError(rate.retryAfterHint)
  }

  const repo = opts.repo ?? createPrismaPasswordResetRepo()
  const user = await repo.findUserByEmail(email)
  if (!user?.email) {
    return { message, emailSent: false, userFound: false }
  }

  const mailOk = (opts.mailConfigured ?? isMailConfigured)()
  if (!mailOk) {
    console.error('[password-reset] SMTP no configurado; forgot sin envío')
    return { message, emailSent: false, userFound: true }
  }

  const plainToken = generatePasswordResetTokenPlain()
  const tokenHash = hashPasswordResetToken(plainToken)
  const expiresAt = passwordResetExpiresAt()
  const now = new Date()

  await repo.invalidateActiveTokens(user.id, now)
  await repo.createResetToken({
    userId: user.id,
    tokenHash,
    expiresAt,
    requestIp: opts.ip?.slice(0, 64) || null,
    userAgent: opts.userAgent?.slice(0, 512) || null,
  })

  const resetUrl = vecindarioPasswordResetUrl(plainToken)
  const content = buildPasswordResetEmailContent({ resetUrl, ttlMinutes: 60 })
  const baseResult: ForgotPasswordResult = {
    message,
    emailSent: false,
    userFound: true,
    ...(opts.exposeTokenForTests
      ? { _testPlainToken: plainToken, _testTokenHash: tokenHash }
      : {}),
  }

  try {
    const send = opts.send ?? sendMail
    await send({
      to: user.email,
      subject: content.subject,
      text: content.text,
      html: content.html,
    })
    return { ...baseResult, emailSent: true }
  } catch (e) {
    console.error(
      '[password-reset] fallo SMTP (sin filtrar al cliente)',
      e instanceof Error ? e.message : e,
    )
    return baseResult
  }
}

export type ResetPasswordResult =
  | { ok: true; userId: number }
  | { ok: false; status: number; error: string }

export async function completePasswordReset(opts: {
  tokenRaw: unknown
  newPassword: unknown
  confirmPassword: unknown
  repo?: PasswordResetRepo
  now?: Date
}): Promise<ResetPasswordResult> {
  const plain = typeof opts.tokenRaw === 'string' ? opts.tokenRaw.trim() : ''
  if (!plain) {
    return { ok: false, status: 400, error: 'Enlace no válido o caducado.' }
  }

  const pwd = validateNewPasswordPair(opts.newPassword, opts.confirmPassword)
  if (!pwd.ok) {
    return { ok: false, status: 400, error: pwd.error }
  }

  const tokenHash = hashPasswordResetToken(plain)
  const now = opts.now ?? new Date()
  const repo = opts.repo ?? createPrismaPasswordResetRepo()

  const row = await repo.findTokenByHash(tokenHash)
  if (!row || !tokenHashesEqual(row.tokenHash, tokenHash)) {
    return { ok: false, status: 400, error: 'Enlace no válido o caducado.' }
  }
  if (row.usedAt != null) {
    return { ok: false, status: 400, error: 'Enlace no válido o caducado.' }
  }
  if (row.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, status: 400, error: 'Enlace no válido o caducado.' }
  }

  const passwordHash = await bcrypt.hash(pwd.password, 12)
  await repo.applyPasswordReset({
    tokenId: row.id,
    userId: row.userId,
    passwordHash,
    usedAt: now,
  })

  return { ok: true, userId: row.userId }
}

/** Repo en memoria para tests (sin Prisma). */
export function createMemoryPasswordResetRepo(seed?: {
  users?: Array<{
    id: number
    email: string | null
    passwordHash: string
    passwordPlainSnapshot?: string | null
  }>
}): PasswordResetRepo & {
  users: Map<
    number,
    {
      id: number
      email: string | null
      passwordHash: string
      passwordPlainSnapshot: string | null
    }
  >
  tokens: PasswordResetTokenRow[]
  nextTokenId: number
} {
  const users = new Map<
    number,
    {
      id: number
      email: string | null
      passwordHash: string
      passwordPlainSnapshot: string | null
    }
  >()
  for (const u of seed?.users ?? []) {
    users.set(u.id, {
      id: u.id,
      email: u.email,
      passwordHash: u.passwordHash,
      passwordPlainSnapshot: u.passwordPlainSnapshot ?? null,
    })
  }
  const tokens: PasswordResetTokenRow[] = []
  let nextTokenId = 1

  return {
    users,
    tokens,
    nextTokenId,
    async findUserByEmail(email) {
      for (const u of users.values()) {
        if (u.email && u.email.toLowerCase() === email) {
          return { id: u.id, email: u.email }
        }
      }
      return null
    },
    async createResetToken(data) {
      tokens.push({
        id: nextTokenId++,
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        usedAt: null,
      })
    },
    async invalidateActiveTokens(userId, usedAt) {
      for (const t of tokens) {
        if (t.userId === userId && t.usedAt == null) t.usedAt = usedAt
      }
    },
    async findTokenByHash(tokenHash) {
      return tokens.find((t) => t.tokenHash === tokenHash) ?? null
    },
    async applyPasswordReset({ tokenId, userId, passwordHash, usedAt }) {
      const u = users.get(userId)
      if (!u) throw new Error('user missing')
      u.passwordHash = passwordHash
      u.passwordPlainSnapshot = null
      const tok = tokens.find((t) => t.id === tokenId)
      if (!tok) throw new Error('token missing')
      tok.usedAt = usedAt
      for (const t of tokens) {
        if (t.userId === userId && t.usedAt == null && t.id !== tokenId) {
          t.usedAt = usedAt
        }
      }
    },
    async findUserById(id) {
      const u = users.get(id)
      if (!u) return null
      return {
        id: u.id,
        email: u.email ?? '',
        passwordHash: u.passwordHash,
        passwordPlainSnapshot: u.passwordPlainSnapshot,
      }
    },
  }
}
