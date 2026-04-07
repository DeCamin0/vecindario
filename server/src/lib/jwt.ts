import jwt from 'jsonwebtoken'

export function getJwtSecret(): string {
  const s = process.env.JWT_SECRET
  if (!s || s.length < 16) {
    throw new Error('JWT_SECRET must be set (min 16 characters)')
  }
  return s
}

export type AccessTokenPayload = {
  sub: string
  email: string
  role: string
  /** companyId para rol company_admin */
  cid?: string
}

export function signAccessToken(payload: {
  sub: string
  email: string
  role: string
  companyId?: number | null
}): string {
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d'
  const body: Record<string, string> = {
    sub: payload.sub,
    email: payload.email,
    role: payload.role,
  }
  if (payload.companyId != null && Number.isFinite(Number(payload.companyId))) {
    body.cid = String(payload.companyId)
  }
  return jwt.sign(body, getJwtSecret(), { expiresIn } as jwt.SignOptions)
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, getJwtSecret()) as AccessTokenPayload
  return decoded
}
