import { randomBytes } from 'node:crypto'
import { prisma } from './prisma.js'

/** Código legible tipo VEC-A1B2C3D4; único en BD (reintenta si colisión). */
export async function generateUniqueAccessCode(): Promise<string> {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const suffix = randomBytes(4).toString('hex').toUpperCase()
    const code = `VEC-${suffix}`
    const taken = await prisma.community.findFirst({
      where: { accessCode: code },
      select: { id: true },
    })
    if (!taken) return code
  }
  throw new Error('No se pudo generar un código único')
}
