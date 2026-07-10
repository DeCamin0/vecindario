import { prisma } from './prisma.js'
import { sendMail, isMailConfigured } from './mail.js'
import { escapeHtml, wrapVecindarioEmailHtml } from './vecindario-email-template.js'
import { vecindarioPublicBaseUrl } from './public-app-url.js'

function appBaseUrl(): string {
  return vecindarioPublicBaseUrl()
}

/**
 * Correo al vecino cuando conserjería registra un paquete (si tiene email y notifyEmail activo).
 */
export async function sendParcelCreatedNotificationEmail(params: {
  recipientUserId: number
  communityName: string
  portal: string
  piso: string
  puerta: string
  packageCount: number
  parcelId: number
  deliveryKind?: 'courier' | 'special'
  itemDescription?: string | null
}): Promise<void> {
  if (!isMailConfigured()) return

  const user = await prisma.vecindarioUser.findUnique({
    where: { id: params.recipientUserId },
    select: { email: true, notifyEmail: true, name: true },
  })
  if (!user) return
  const to = user.email?.trim()
  if (!to || user.notifyEmail === false) return

  const { communityName, portal, piso, puerta, packageCount, parcelId, deliveryKind, itemDescription } =
    params
  const isSpecial = deliveryKind === 'special'
  const countLabel = isSpecial
    ? itemDescription?.trim() || 'Entrega especial'
    : packageCount > 1
      ? `${packageCount} paquetes`
      : 'un paquete'
  const detailUrl = `${appBaseUrl()}/paqueteria/${parcelId}`
  const greeting = user.name?.trim() ? `Hola, ${user.name.trim()},` : 'Hola,'

  const detailRowsHtml = `
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;font-size:14px;color:#334155;margin:16px 0;border-collapse:collapse;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;width:120px;vertical-align:top;">Comunidad</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;">${escapeHtml(communityName)}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;vertical-align:top;">Vivienda</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">${escapeHtml(portal)} · piso ${escapeHtml(piso)} · puerta ${escapeHtml(puerta)}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;vertical-align:top;">${isSpecial ? 'Entrega' : 'Cantidad'}</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(countLabel)}</td></tr>
    </table>`

  const textDetails = `Comunidad: ${communityName}
Vivienda: ${portal}, piso ${piso}, puerta ${puerta}
${isSpecial ? 'Entrega' : 'Cantidad'}: ${countLabel}
Ver en la app: ${detailUrl}`

  const subject = isSpecial
    ? `Vecindario — Entrega en conserjería «${communityName}»`
    : packageCount > 1
      ? `Vecindario — ${packageCount} paquetes en conserjería «${communityName}»`
      : `Vecindario — Paquete en conserjería «${communityName}»`

  const intro = isSpecial
    ? 'La conserjería ha registrado <strong>una entrega especial</strong> a tu nombre. Puedes pasar a recogerla cuando te convenga.'
    : `La conserjería ha registrado <strong>${escapeHtml(countLabel)}</strong> a tu nombre. Puedes pasar a recogerlo cuando te convenga.`

  const inner = `
    <p style="margin:0 0 16px;font-size:16px;color:#0f172a;line-height:1.5;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 12px;font-size:15px;color:#334155;line-height:1.55;">
      ${intro}
    </p>
    ${detailRowsHtml}
    <p style="margin:20px 0 0;font-size:14px;color:#334155;">
      <a href="${escapeHtml(detailUrl)}" style="color:#2563eb;font-weight:600;">Abrir paquetería en Vecindario</a>
    </p>
    <p style="margin:20px 0 0;font-size:14px;color:#475569;line-height:1.5;">Un saludo,<br /><strong>Vecindario</strong></p>`

  try {
    await sendMail({
      to,
      subject,
      text: `${greeting}\n\nLa conserjería ha registrado ${countLabel} a tu nombre.\n\n${textDetails}\n\nUn saludo,\nVecindario`,
      html: wrapVecindarioEmailHtml(inner),
    })
  } catch (e) {
    console.error('[parcel-email] vecino', to, e)
  }
}

/**
 * Correo al vecino cuando conserjería añade bultos a un registro pendiente.
 */
export async function sendParcelPackageCountUpdatedEmail(params: {
  recipientUserId: number
  communityName: string
  portal: string
  piso: string
  puerta: string
  packageCount: number
  previousCount: number
  parcelId: number
}): Promise<void> {
  if (!isMailConfigured()) return

  const user = await prisma.vecindarioUser.findUnique({
    where: { id: params.recipientUserId },
    select: { email: true, notifyEmail: true, name: true },
  })
  if (!user) return
  const to = user.email?.trim()
  if (!to || user.notifyEmail === false) return

  const { communityName, portal, piso, puerta, packageCount, previousCount, parcelId } = params
  const detailUrl = `${appBaseUrl()}/paqueteria/${parcelId}`
  const greeting = user.name?.trim() ? `Hola, ${user.name.trim()},` : 'Hola,'
  const added = packageCount - previousCount
  const countLabel =
    packageCount > 1 ? `${packageCount} bultos en conserjería` : '1 bulto en conserjería'

  const detailRowsHtml = `
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;font-size:14px;color:#334155;margin:16px 0;border-collapse:collapse;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;width:120px;vertical-align:top;">Comunidad</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;">${escapeHtml(communityName)}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;vertical-align:top;">Vivienda</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">${escapeHtml(portal)} · piso ${escapeHtml(piso)} · puerta ${escapeHtml(puerta)}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;vertical-align:top;">Total</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(countLabel)}</td></tr>
    </table>`

  const subject =
    packageCount > 1
      ? `Vecindario — ${packageCount} bultos en conserjería «${communityName}»`
      : `Vecindario — Bulto añadido en conserjería «${communityName}»`

  const intro =
    added === 1
      ? `Se ha <strong>añadido un bulto</strong> a tu registro pendiente. Ahora constan <strong>${escapeHtml(countLabel)}</strong>.`
      : `Se han <strong>añadido ${added} bultos</strong> a tu registro pendiente. Ahora constan <strong>${escapeHtml(countLabel)}</strong>.`

  const inner = `
    <p style="margin:0 0 16px;font-size:16px;color:#0f172a;line-height:1.5;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 12px;font-size:15px;color:#334155;line-height:1.55;">
      ${intro}
    </p>
    ${detailRowsHtml}
    <p style="margin:20px 0 0;font-size:14px;color:#334155;">
      <a href="${escapeHtml(detailUrl)}" style="color:#2563eb;font-weight:600;">Abrir paquetería en Vecindario</a>
    </p>
    <p style="margin:20px 0 0;font-size:14px;color:#475569;line-height:1.5;">Un saludo,<br /><strong>Vecindario</strong></p>`

  try {
    await sendMail({
      to,
      subject,
      text: `${greeting}\n\nSe ha actualizado tu registro en conserjería. Total: ${countLabel}.\n\nVer en la app: ${detailUrl}\n\nUn saludo,\nVecindario`,
      html: wrapVecindarioEmailHtml(inner),
    })
  } catch (e) {
    console.error('[parcel-email] bulto-update vecino', to, e)
  }
}
