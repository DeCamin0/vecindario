/**
 * postinstall server: evită două `prisma generate` simultan (EPERM pe Windows).
 * Generează doar dacă lipsește engine-ul; apoi sincronizează în server/node_modules.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const engine = join(root, 'node_modules', '.prisma', 'client', 'query_engine-windows.dll.node')
const schema = join(root, 'prisma', 'schema.prisma')

if (!existsSync(engine)) {
  console.log('[ensure-prisma-for-server] Lipsește query engine — prisma generate…')
  const r = spawnSync('npx', ['prisma', 'generate', `--schema=${schema}`], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
} else {
  console.log('[ensure-prisma-for-server] Client Prisma deja generat — skip generate')
}

const sync = spawnSync('node', ['scripts/sync-prisma-to-server.mjs'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
})
process.exit(sync.status ?? 0)
