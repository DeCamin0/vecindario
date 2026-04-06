/**
 * Migrări + generate Prisma + copiere client în server/.
 * Pe Windows, `prisma generate` poate da EPERM dacă engine-ul e blocat — reîncearcă de câteva ori.
 */
import { spawnSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shell = process.platform === 'win32'
const run = (cmd, args) =>
  spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell })

async function main() {
  let r = run('npx', ['prisma', 'migrate', 'deploy'])
  if (r.status !== 0) process.exit(r.status ?? 1)

  const attempts = 4
  for (let i = 0; i < attempts; i++) {
    r = run('npx', ['prisma', 'generate'])
    if (r.status === 0) break
    if (i < attempts - 1) {
      console.warn(`[db-prepare] prisma generate failed (try ${i + 1}/${attempts}), retrying…`)
      await sleep(2000)
    }
  }
  if (r.status !== 0) {
    console.error(
      '[db-prepare] prisma generate failed after retries. Close apps locking .prisma (IDE, antivirus) and run: npm run db:generate',
    )
    process.exit(r.status ?? 1)
  }

  r = run('node', ['scripts/sync-prisma-to-server.mjs'])
  process.exit(r.status ?? 0)
}

main()
