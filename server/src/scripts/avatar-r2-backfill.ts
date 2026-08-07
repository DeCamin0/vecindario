/**
 * Backfill disk avatars → Cloudflare R2.
 *
 * Reads uploads/avatars/{userId}.{ext}, puts to R2 with docs key pattern, sets
 * profile_image_storage_key (and normalizes profile_image_url). Optionally deletes disk files.
 *
 * Usage (from vecindario-app/server):
 *   npx tsx src/scripts/avatar-r2-backfill.ts --dry-run
 *   npx tsx src/scripts/avatar-r2-backfill.ts --limit=50
 *   npx tsx src/scripts/avatar-r2-backfill.ts --delete-disk
 *   npm run storage:avatar-backfill
 *
 * Requires R2_ENABLED=true and R2_* credentials. Never prints secrets.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import {
  AVATARS_DIR,
  buildAvatarObjectKey,
  avatarContentType,
  profileAvatarPublicPath,
  resolveCompanyIdForAvatar,
} from '../lib/profile-avatar.js'
import { isR2Enabled, r2Put } from '../lib/r2-storage.js'
import { prisma } from '../lib/prisma.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

type Flags = {
  dryRun: boolean
  deleteDisk: boolean
  limit: number | null
}

function parseArgs(argv: string[]): Flags {
  const flags: Flags = { dryRun: false, deleteDisk: false, limit: null }
  for (const a of argv) {
    if (a === '--dry-run') flags.dryRun = true
    else if (a === '--delete-disk') flags.deleteDisk = true
    else if (a.startsWith('--limit=')) {
      flags.limit = Math.max(1, parseInt(a.slice('--limit='.length), 10) || 0)
    }
  }
  return flags
}

const FILE_RE = /^(\d+)\.(jpg|png|webp)$/i

async function main() {
  const flags = parseArgs(process.argv.slice(2))
  if (!isR2Enabled()) {
    console.error(
      '[avatar-backfill] FAIL: R2_ENABLED is not true or R2_* credentials incomplete.',
    )
    process.exit(1)
  }

  let entries: string[]
  try {
    entries = await fs.readdir(AVATARS_DIR)
  } catch {
    console.log('[avatar-backfill] No avatars directory; nothing to do.')
    return
  }

  const files = entries.filter((f) => FILE_RE.test(f)).sort()
  const limited = flags.limit != null ? files.slice(0, flags.limit) : files
  console.log(
    `[avatar-backfill] found=${files.length} processing=${limited.length}` +
      ` dryRun=${flags.dryRun} deleteDisk=${flags.deleteDisk}`,
  )

  let ok = 0
  let skip = 0
  let fail = 0

  for (const file of limited) {
    const m = FILE_RE.exec(file)!
    const userId = Number(m[1])
    const ext = m[2].toLowerCase() as 'jpg' | 'png' | 'webp'
    const diskPath = path.join(AVATARS_DIR, file)

    const user = await prisma.vecindarioUser.findUnique({
      where: { id: userId },
      select: { id: true, profileImageStorageKey: true },
    })
    if (!user) {
      console.warn(`[avatar-backfill] skip orphan file=${file} (no user)`)
      skip++
      continue
    }
    if (user.profileImageStorageKey?.trim()) {
      console.log(`[avatar-backfill] skip userId=${userId} already has storage key`)
      skip++
      continue
    }

    let buffer: Buffer
    try {
      buffer = await fs.readFile(diskPath)
    } catch (err) {
      console.error(`[avatar-backfill] read fail ${file}:`, (err as Error).message)
      fail++
      continue
    }
    if (!buffer.length) {
      console.warn(`[avatar-backfill] skip empty ${file}`)
      skip++
      continue
    }

    const companyId = await resolveCompanyIdForAvatar(userId)
    const key = buildAvatarObjectKey(companyId, userId, ext)
    const publicUrl = profileAvatarPublicPath(userId, ext)

    if (flags.dryRun) {
      console.log(
        `[avatar-backfill] DRY would put userId=${userId} bytes=${buffer.length} key=${key}`,
      )
      ok++
      continue
    }

    try {
      await r2Put({
        key,
        body: buffer,
        contentType: avatarContentType(ext),
        metadata: {
          module: 'avatar',
          userId: String(userId),
          companyId: String(companyId),
          backfill: '1',
        },
      })
      await prisma.vecindarioUser.update({
        where: { id: userId },
        data: {
          profileImageUrl: publicUrl,
          profileImageStorageKey: key,
        },
      })
      if (flags.deleteDisk) {
        await fs.unlink(diskPath).catch(() => undefined)
      }
      console.log(`[avatar-backfill] OK userId=${userId} key=${key}`)
      ok++
    } catch (err) {
      console.error(`[avatar-backfill] FAIL userId=${userId}:`, (err as Error).message)
      fail++
    }
  }

  console.log(`[avatar-backfill] done ok=${ok} skip=${skip} fail=${fail}`)
  await prisma.$disconnect()
  if (fail > 0) process.exit(1)
}

main().catch(async (err) => {
  console.error('[avatar-backfill] fatal:', err)
  await prisma.$disconnect().catch(() => undefined)
  process.exit(1)
})
