/**
 * Genera icon-192.png e icon-512.png para el manifest PWA.
 * Prioridad: public/Vencindario_logo.png (marca principal) → public/vecindario-mark.svg.
 */
import sharp from 'sharp'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const pngPath = resolve(root, 'public', 'Vencindario_logo.png')
const svgPath = resolve(root, 'public', 'vecindario-mark.svg')

const BG = { r: 232, g: 237, b: 245, alpha: 1 }
const iconOpts = { fit: 'contain', background: BG }

if (existsSync(pngPath)) {
  await sharp(pngPath).resize(192, 192, iconOpts).png().toFile(resolve(root, 'public', 'icon-192.png'))
  await sharp(pngPath).resize(512, 512, iconOpts).png().toFile(resolve(root, 'public', 'icon-512.png'))
  console.log('[generate-pwa-icons] OK desde Vencindario_logo.png → icon-192, icon-512')
} else if (existsSync(svgPath)) {
  const input = sharp(svgPath).png()
  await input.clone().resize(192, 192, iconOpts).toFile(resolve(root, 'public', 'icon-192.png'))
  await input.clone().resize(512, 512, iconOpts).toFile(resolve(root, 'public', 'icon-512.png'))
  console.log('[generate-pwa-icons] OK desde vecindario-mark.svg → icon-192, icon-512')
} else {
  console.warn('[generate-pwa-icons] Sin Vencindario_logo.png ni vecindario-mark.svg, se omite.')
  process.exit(0)
}
