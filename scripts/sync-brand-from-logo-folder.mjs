/**
 * Sincroniza desde `logo vecindario/` (raíz del repo):
 * - Principal.png → web (public/Vencindario_logo.png) + tamaños PWA + apple touch
 * - Principal.svg → public/vecindario-brand.svg (opcional, escalado vectorial)
 * - Expo: regenera icon.png, adaptive-icon.png, vecindario-logo.png, favicon.png, splash-icon.png
 * - appstore.png / playstore.png → vecindario-mobile/assets/store/ (subir manualmente en App Store Connect / Play Console)
 */
import sharp from 'sharp'
import { existsSync, mkdirSync, copyFileSync, unlinkSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const repoRoot = resolve(appRoot, '..')
const logoDir = resolve(repoRoot, 'logo vecindario')
const principalPng = join(logoDir, 'Principal.png')
const principalSvg = join(logoDir, 'Principal.svg')
const appStorePng = join(logoDir, 'appstore.png')
const playStorePng = join(logoDir, 'playstore.png')

const publicDir = resolve(appRoot, 'public')
const mobileAssets = resolve(repoRoot, 'vecindario-mobile', 'assets')
const mobileStore = join(mobileAssets, 'store')

const BG = { r: 232, g: 237, b: 245, alpha: 1 }

async function main() {
  if (!existsSync(principalPng)) {
    console.error('[brand-sync] Falta Principal.png en:', principalPng)
    process.exit(1)
  }

  await sharp(principalPng).png().toFile(join(publicDir, 'Vencindario_logo.png'))
  console.log('[brand-sync] public/Vencindario_logo.png')

  const brandSvgOut = join(publicDir, 'vecindario-brand.svg')
  if (existsSync(principalSvg)) {
    copyFileSync(principalSvg, brandSvgOut)
    console.log('[brand-sync] public/vecindario-brand.svg')
  } else if (existsSync(brandSvgOut)) {
    unlinkSync(brandSvgOut)
    console.log('[brand-sync] eliminado vecindario-brand.svg (no hay Principal.svg en logo vecindario/)')
  }

  const iconOpts = { fit: 'contain', background: BG }
  await sharp(principalPng).resize(192, 192, iconOpts).png().toFile(join(publicDir, 'icon-192.png'))
  await sharp(principalPng).resize(512, 512, iconOpts).png().toFile(join(publicDir, 'icon-512.png'))
  await sharp(principalPng).resize(180, 180, iconOpts).png().toFile(join(publicDir, 'apple-icon-180.png'))
  console.log('[brand-sync] public/icon-192.png, icon-512.png, apple-icon-180.png')

  const mobile1024 = await sharp(principalPng)
    .resize(1024, 1024, iconOpts)
    .png()
    .toBuffer()
  await sharp(mobile1024).toFile(join(mobileAssets, 'icon.png'))
  await sharp(mobile1024).toFile(join(mobileAssets, 'adaptive-icon.png'))
  await sharp(mobile1024).toFile(join(mobileAssets, 'vecindario-logo.png'))
  console.log('[brand-sync] vecindario-mobile/assets icon, adaptive-icon, vecindario-logo')

  await sharp(principalPng).resize(48, 48, { fit: 'contain', background: BG }).png().toFile(join(mobileAssets, 'favicon.png'))

  const logoInner = await sharp(principalPng).resize(900, 900, { fit: 'inside' }).png().toBuffer()
  const splashSize = 2048
  await sharp({
    create: { width: splashSize, height: splashSize, channels: 4, background: BG },
  })
    .composite([{ input: logoInner, gravity: 'center' }])
    .png()
    .toFile(join(mobileAssets, 'splash-icon.png'))
  console.log('[brand-sync] vecindario-mobile/assets favicon.png, splash-icon.png')

  mkdirSync(mobileStore, { recursive: true })
  if (existsSync(appStorePng)) {
    copyFileSync(appStorePng, join(mobileStore, 'appstore.png'))
    console.log('[brand-sync] vecindario-mobile/assets/store/appstore.png')
  }
  if (existsSync(playStorePng)) {
    copyFileSync(playStorePng, join(mobileStore, 'playstore.png'))
    console.log('[brand-sync] vecindario-mobile/assets/store/playstore.png')
  }

  console.log('[brand-sync] Listo.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
