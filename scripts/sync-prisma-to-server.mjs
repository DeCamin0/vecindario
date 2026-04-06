/**
 * După `prisma generate` la rădăcina vecindario-app, copiază clientul generat
 * în server/node_modules ca serverul Express să folosească același model.
 */
import { cpSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', '.prisma')
const dst = join(root, 'server', 'node_modules', '.prisma')

if (!existsSync(src)) {
  console.warn('[sync-prisma-to-server] Lipsește node_modules/.prisma — rulează mai întâi: npx prisma generate')
  process.exit(0)
}

cpSync(src, dst, { recursive: true })
console.log('[sync-prisma-to-server] Copiat .prisma → server/node_modules/.prisma')
