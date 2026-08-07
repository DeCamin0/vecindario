/**
 * Minimal Cloudflare R2 / S3-compatible client for Vecindario.
 *
 * Env (same names as DeCamino):
 *   R2_ENABLED=true
 *   R2_ACCOUNT_ID=
 *   R2_ACCESS_KEY_ID=
 *   R2_SECRET_ACCESS_KEY=
 *   R2_BUCKET=
 *   R2_ENDPOINT=   (optional; defaults to https://{ACCOUNT_ID}.r2.cloudflarestorage.com)
 *   R2_REGION=auto
 *
 * If R2 is not fully configured, helpers no-op / return false so disk fallback stays active.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

export type R2Object = {
  body: Buffer
  contentType?: string
  contentLength?: number
}

type R2Config = {
  enabled: boolean
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  endpoint: string
  region: string
}

let cachedClient: S3Client | null = null
let cachedConfigKey = ''

function readConfig(): R2Config {
  const enabled = String(process.env.R2_ENABLED || '').toLowerCase() === 'true'
  const accountId = (process.env.R2_ACCOUNT_ID || '').trim()
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim()
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim()
  const bucket = (process.env.R2_BUCKET || '').trim()
  const region = (process.env.R2_REGION || '').trim() || 'auto'
  const endpoint =
    (process.env.R2_ENDPOINT || '').trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '')
  return { enabled, accessKeyId, secretAccessKey, bucket, endpoint, region }
}

/** True when R2_ENABLED=true and credentials + bucket + endpoint are present. */
export function isR2Enabled(): boolean {
  const cfg = readConfig()
  return (
    cfg.enabled &&
    Boolean(cfg.accessKeyId) &&
    Boolean(cfg.secretAccessKey) &&
    Boolean(cfg.bucket) &&
    Boolean(cfg.endpoint)
  )
}

function getClient(): { client: S3Client; bucket: string } {
  const cfg = readConfig()
  if (!isR2Enabled()) {
    throw new Error('R2 is not enabled or not fully configured')
  }
  const key = `${cfg.endpoint}|${cfg.accessKeyId}|${cfg.bucket}|${cfg.region}`
  if (!cachedClient || cachedConfigKey !== key) {
    cachedClient = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
      forcePathStyle: true,
    })
    cachedConfigKey = key
  }
  return { client: cachedClient, bucket: cfg.bucket }
}

export async function r2Put(params: {
  key: string
  body: Buffer
  contentType: string
  metadata?: Record<string, string>
}): Promise<{ key: string; bucket: string }> {
  const { client, bucket } = getClient()
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      Metadata: params.metadata,
    }),
  )
  return { key: params.key, bucket }
}

export async function r2Get(key: string): Promise<R2Object> {
  const { client, bucket } = getClient()
  const result = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  )
  const bytes = await result.Body?.transformToByteArray()
  if (!bytes) {
    throw new Error(`R2 get returned empty body for key=${key}`)
  }
  return {
    body: Buffer.from(bytes),
    contentType: result.ContentType,
    contentLength: result.ContentLength,
  }
}

export async function r2Delete(key: string): Promise<void> {
  const trimmed = key.trim()
  if (!trimmed || !isR2Enabled()) return
  const { client, bucket } = getClient()
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: trimmed,
    }),
  )
}

/** Best-effort delete; logs and swallows errors. */
export async function r2DeleteQuiet(key: string | null | undefined): Promise<void> {
  const trimmed = key ? String(key).trim() : ''
  if (!trimmed || !isR2Enabled()) return
  try {
    await r2Delete(trimmed)
  } catch (err) {
    console.warn(`[r2] delete failed key=${trimmed}:`, (err as Error)?.message || err)
  }
}
