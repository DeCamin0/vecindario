import jwt from 'jsonwebtoken'

export function getJwtSecret(): string {
  const s = process.env.JWT_SECRET
  if (!s || s.length < 16) {
    throw new Error('JWT_SECRET must be set (min 16 characters)')
  }
  return s
}

export function signAccessToken(payload: { sub: string; email: string; role: string }): string {
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d'
  return jwt.sign(payload, getJwtSecret(), { expiresIn } as jwt.SignOptions)
}

export function verifyAccessToken(token: string): { sub: string; email: string; role: string } {
  const decoded = jwt.verify(token, getJwtSecret()) as { sub: string; email: string; role: string }
  return decoded
}
