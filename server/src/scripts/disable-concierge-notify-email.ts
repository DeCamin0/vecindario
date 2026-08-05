/**
 * One-shot: desactiva correo (notifyEmail) para todos los usuarios con rol conserje.
 * Uso (desde server/): npm run prefs:disable-concierge-email
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { prisma } from '../lib/prisma.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

async function main() {
  const before = await prisma.vecindarioUser.findMany({
    where: { role: 'concierge' },
    select: {
      id: true,
      email: true,
      name: true,
      notifyEmail: true,
      communityId: true,
    },
    orderBy: { id: 'asc' },
  })

  console.log(`Conserjes encontrados: ${before.length}`)
  for (const u of before) {
    console.log(
      `  id=${u.id} email=${u.email ?? '(sin email)'} notifyEmail=${u.notifyEmail} communityId=${u.communityId ?? 'null'}`,
    )
  }

  const stillOn = before.filter((u) => u.notifyEmail !== false)
  if (stillOn.length === 0) {
    console.log('Todos los conserjes ya tienen notifyEmail=false. Nada que actualizar.')
    return
  }

  const result = await prisma.vecindarioUser.updateMany({
    where: { role: 'concierge', notifyEmail: { not: false } },
    data: { notifyEmail: false },
  })

  console.log(`Actualizados a notifyEmail=false: ${result.count}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
