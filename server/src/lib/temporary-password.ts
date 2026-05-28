import { randomBytes } from 'node:crypto'

/** Contraseña provisional legible (sin caracteres ambiguos 0/O, 1/l). */
export function generateTemporaryPasswordPlain(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(16)
  let s = ''
  for (let i = 0; i < 14; i += 1) {
    s += alphabet[bytes[i] % alphabet.length]
  }
  return s
}
