import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import {
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_POLICY_LAST_UPDATED,
  privacyPolicyPosterSections,
} from '../content/privacyPolicyPoster.js'
import { getPublicAppOrigin } from './communityLoginUrl.js'

const BRAND_PURPLE = [91, 33, 182]
const TEXT_DARK = [15, 23, 42]
const TEXT_MUTED = [71, 85, 105]
const PAGE_W = 210
const MARGIN = 16
const CONTENT_W = PAGE_W - MARGIN * 2

async function loadImageDataUrl(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`No se pudo cargar imagen: ${url}`)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function addWrappedText(doc, text, x, y, maxWidth, lineHeight = 4.8) {
  const lines = doc.splitTextToSize(text, maxWidth)
  doc.text(lines, x, y)
  return y + lines.length * lineHeight
}

function fileSafeSlug(raw) {
  return String(raw || 'comunidad')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .slice(0, 48)
}

/**
 * Cartel A4 para conserjería: página 1 acceso (logo, VEC, QR, enlace) + página 2 privacidad resumida.
 * @param {{ communityName: string, address?: string, accessCode?: string, loginUrl: string, loginSlug?: string }} params
 */
export async function generateCommunityPosterPdf(params) {
  const { communityName, address, accessCode, loginUrl, loginSlug } = params
  if (!loginUrl?.trim()) {
    throw new Error('La comunidad necesita un slug de acceso para generar el cartel.')
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = MARGIN

  const logoPath = `${import.meta.env.BASE_URL || '/'}Vencindario_logo.png`.replace(/\/{2,}/g, '/')
  const logoUrl = new URL(logoPath, window.location.origin).href
  try {
    const logoData = await loadImageDataUrl(logoUrl)
    const logoW = 42
    const logoH = 42
    doc.addImage(logoData, 'PNG', (PAGE_W - logoW) / 2, y, logoW, logoH)
    y += logoH + 6
  } catch {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.setTextColor(...BRAND_PURPLE)
    doc.text('Vecindario', PAGE_W / 2, y + 8, { align: 'center' })
    y += 14
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...TEXT_MUTED)
  doc.text('Acceso digital para vecinos', PAGE_W / 2, y, { align: 'center' })
  y += 7

  doc.setFontSize(15)
  doc.setTextColor(...TEXT_DARK)
  const nameLines = doc.splitTextToSize(communityName?.trim() || 'Comunidad', CONTENT_W)
  doc.text(nameLines, PAGE_W / 2, y, { align: 'center' })
  y += nameLines.length * 6.5 + 2

  if (address?.trim()) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_MUTED)
    const addrLines = doc.splitTextToSize(address.trim(), CONTENT_W - 10)
    doc.text(addrLines, PAGE_W / 2, y, { align: 'center' })
    y += addrLines.length * 4.2 + 3
  }

  const vec = (accessCode || '').trim()
  if (vec) {
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    const boxH = 16
    doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 2, 2, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...TEXT_MUTED)
    doc.text('CÓDIGO DE LA COMUNIDAD (VEC)', PAGE_W / 2, y + 5, { align: 'center' })
    doc.setFont('courier', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(...BRAND_PURPLE)
    doc.text(vec, PAGE_W / 2, y + 12, { align: 'center' })
    y += boxH + 6
  }

  const qrDataUrl = await QRCode.toDataURL(loginUrl.trim(), {
    margin: 1,
    width: 320,
    color: { dark: '#0f172a', light: '#ffffff' },
  })
  const qrSize = 52
  doc.addImage(qrDataUrl, 'PNG', (PAGE_W - qrSize) / 2, y, qrSize, qrSize)
  y += qrSize + 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...TEXT_MUTED)
  doc.text('Escanea el código o abre este enlace:', PAGE_W / 2, y, { align: 'center' })
  y += 4
  doc.setFont('courier', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...BRAND_PURPLE)
  const urlLines = doc.splitTextToSize(loginUrl.trim(), CONTENT_W - 4)
  doc.text(urlLines, PAGE_W / 2, y, { align: 'center' })
  y += urlLines.length * 3.6 + 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...TEXT_DARK)
  const bullets = [
    'En la app o web, elige el acceso como vecino e inicia sesión con el email y contraseña de tu vivienda.',
    'Si es tu primer acceso, la comunidad o conserjería te facilitará una contraseña temporal.',
    'Para incidencias, reservas y avisos de la finca, usa siempre este acceso oficial.',
    'Conserjería: coloca este cartel en un lugar visible para los vecinos.',
  ]
  for (const line of bullets) {
    y = addWrappedText(doc, `• ${line}`, MARGIN + 2, y, CONTENT_W - 6, 4.5)
    y += 1.5
  }

  const origin = getPublicAppOrigin() || loginUrl.split('/c/')[0] || ''
  const privacyUrl = origin ? `${origin.replace(/\/$/, '')}/privacy` : '/privacy'
  doc.setFontSize(7.5)
  doc.setTextColor(...TEXT_MUTED)
  doc.text(
    `Política de privacidad (resumen en página 2) · ${PRIVACY_CONTACT_EMAIL}`,
    PAGE_W / 2,
    285,
    { align: 'center' },
  )

  doc.addPage()
  y = MARGIN
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...BRAND_PURPLE)
  doc.text('Política de privacidad', MARGIN, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...TEXT_MUTED)
  doc.text(
    `Vecindario · Resumen para cartel · Actualización: ${PRIVACY_POLICY_LAST_UPDATED}`,
    MARGIN,
    y,
  )
  y += 5
  doc.text(`Texto completo: ${privacyUrl}`, MARGIN, y)
  y += 8

  for (const section of privacyPolicyPosterSections) {
    if (y > 268) {
      doc.addPage()
      y = MARGIN
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_DARK)
    doc.text(section.title, MARGIN, y)
    y += 4.5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...TEXT_MUTED)
    y = addWrappedText(doc, section.body, MARGIN, y, CONTENT_W, 4.2)
    y += 3
  }

  doc.setFontSize(7)
  doc.setTextColor(...TEXT_MUTED)
  doc.text(
    `Dudas y derechos RGPD: ${PRIVACY_CONTACT_EMAIL}`,
    MARGIN,
    290,
  )

  const slug = fileSafeSlug(loginSlug || communityName)
  doc.save(`vecindario-cartel-${slug}.pdf`)
}
