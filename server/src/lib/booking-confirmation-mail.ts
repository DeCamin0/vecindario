import type { Community, CommunityBooking } from '@prisma/client'
import { sendMail, isMailConfigured } from './mail.js'
import { escapeHtml, wrapVecindarioEmailHtml } from './vecindario-email-template.js'

function normEmail(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim().toLowerCase()
  return t || null
}

function fmtDateLongEs(isoYmd: string): string {
  const [y, m, d] = isoYmd.split('-').map(Number)
  if (!y || !m || !d) return isoYmd
  const dt = new Date(y, m - 1, d)
  if (Number.isNaN(dt.getTime())) return isoYmd
  return dt.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function facilityLine(row: CommunityBooking): string {
  return (row.facilityName && row.facilityName.trim()) || row.facilityId
}

function slotLine(row: CommunityBooking): string {
  const l = row.slotLabel?.trim()
  if (l) return l
  const h = (n: number) =>
    `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
  return `${h(row.startMinute)} – ${h(row.endMinute)}`
}

/**
 * Tras crear reserva en BD: correo al vecino (email de quien reserva) y al conserje si hay `conciergeEmail` distinto.
 * Si SMTP no está configurado, no hace nada. Los fallos se registran en consola y no relanzan.
 */
export async function sendBookingCreatedNotifications(params: {
  row: CommunityBooking
  community: Community
}): Promise<void> {
  if (!isMailConfigured()) return

  const { row, community } = params
  const toResident = row.actorEmail?.trim()
  if (!toResident) return

  const dateStr = row.bookingDate.toISOString().slice(0, 10)
  const fecha = fmtDateLongEs(dateStr)
  const espacio = facilityLine(row)
  const tramo = slotLine(row)
  const piso = row.actorPiso?.trim()
  const portal = row.actorPortal?.trim()
  const commName = community.name

  const detailRowsHtml = `
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;font-size:14px;color:#334155;margin:16px 0;border-collapse:collapse;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;width:120px;vertical-align:top;">Comunidad</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;">${escapeHtml(commName)}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;vertical-align:top;">Espacio</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;">${escapeHtml(espacio)}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;vertical-align:top;">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">${escapeHtml(fecha)}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;vertical-align:top;">Tramo</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(tramo)}</td></tr>
      ${portal ? `<tr><td style="padding:8px 0;color:#64748b;vertical-align:top;">Portal</td><td style="padding:8px 0;">${escapeHtml(portal)}</td></tr>` : ''}
      ${piso ? `<tr><td style="padding:8px 0;color:#64748b;vertical-align:top;">Piso / puerta</td><td style="padding:8px 0;">${escapeHtml(piso)}</td></tr>` : ''}
    </table>`

  const textDetails = `Comunidad: ${commName}
Espacio: ${espacio}
Fecha: ${fecha}
Tramo: ${tramo}${portal ? `\nPortal: ${portal}` : ''}${piso ? `\nPiso / puerta: ${piso}` : ''}`

  const subjectResident = `Vecindario — Reserva confirmada «${commName}»`
  const innerResident = `
    <p style="margin:0 0 16px;font-size:16px;color:#0f172a;line-height:1.5;">Hola,</p>
    <p style="margin:0 0 12px;font-size:15px;color:#334155;line-height:1.55;">
      Tu reserva queda <strong>confirmada</strong>.
    </p>
    ${detailRowsHtml}
    <p style="margin:20px 0 0;font-size:14px;color:#475569;line-height:1.5;">Un saludo,<br /><strong>Vecindario</strong></p>`

  try {
    await sendMail({
      to: toResident,
      subject: subjectResident,
      text: `Hola,\n\nTu reserva queda confirmada.\n\n${textDetails}\n\nUn saludo,\nVecindario`,
      html: wrapVecindarioEmailHtml(innerResident),
    })
  } catch (e) {
    console.error('[booking-email] residente', e)
  }

  const conciergeRaw = community.conciergeEmail?.trim()
  const cNorm = normEmail(conciergeRaw)
  const rNorm = normEmail(toResident)
  if (!conciergeRaw || !cNorm || cNorm === rNorm) return

  const subjectConc = `Vecindario — Nueva reserva «${commName}»`
  const innerConc = `
    <p style="margin:0 0 16px;font-size:16px;color:#0f172a;line-height:1.5;">Hola,</p>
    <p style="margin:0 0 12px;font-size:15px;color:#334155;line-height:1.55;">
      Se ha registrado una <strong>nueva reserva</strong> en tu comunidad.
    </p>
    ${detailRowsHtml}
    <p style="margin:16px 0 0;font-size:14px;color:#334155;"><strong>Reservado por:</strong> ${escapeHtml(toResident)}</p>
    <p style="margin:20px 0 0;font-size:14px;color:#475569;line-height:1.5;">Un saludo,<br /><strong>Vecindario</strong></p>`

  try {
    await sendMail({
      to: conciergeRaw,
      subject: subjectConc,
      text: `Hola,\n\nNueva reserva en «${commName}».\n\n${textDetails}\n\nReservado por: ${toResident}\n\nUn saludo,\nVecindario`,
      html: wrapVecindarioEmailHtml(innerConc),
    })
  } catch (e) {
    console.error('[booking-email] conserje', e)
  }
}
