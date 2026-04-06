import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import bcrypt from 'bcrypt'
import { prisma } from './lib/prisma.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
dotenv.config({ path: path.resolve(__dirname, '../.env') })

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.SUPER_ADMIN_PASSWORD
  if (!email || !password) {
    throw new Error('Setează SUPER_ADMIN_EMAIL și SUPER_ADMIN_PASSWORD în .env (vecindario-app)')
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const name = process.env.SUPER_ADMIN_NAME?.trim() || 'Super administrador'

  await prisma.vecindarioUser.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      name,
      role: 'super_admin',
    },
    update: {
      passwordHash,
      role: 'super_admin',
      name,
    },
  })

  console.log('Super admin OK:', email)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
