import { escapeHtml, wrapVecindarioEmailHtml } from './vecindario-email-template.js'
import { SUPPORT_AREA_LABELS, type SupportAreaCode } from './support-catalog.js'

export function buildSupportNewTicketEmail(params: {
  ticketId: number
  subject: string
  area: SupportAreaCode
  creatorName: string | null
  creatorEmail: string | null
  creatorRole: string
  communityName: string | null
}): { subject: string; html: string; text: string } {
  const areaLabel = SUPPORT_AREA_LABELS[params.area] || params.area
  const subject = `Vecindario Soporte — Ticket #${params.ticketId}: ${params.subject}`
  const who = [params.creatorName, params.creatorEmail].filter(Boolean).join(' · ') || 'Usuario'
  const text = [
    `Nuevo ticket #${params.ticketId}`,
    `Asunto: ${params.subject}`,
    `Área: ${areaLabel}`,
    `De: ${who} (${params.creatorRole})`,
    params.communityName ? `Comunidad: ${params.communityName}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const inner = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">Nuevo ticket #${params.ticketId}</h1>
    <p style="margin:0 0 8px;"><strong>Asunto:</strong> ${escapeHtml(params.subject)}</p>
    <p style="margin:0 0 8px;"><strong>Área:</strong> ${escapeHtml(areaLabel)}</p>
    <p style="margin:0 0 8px;"><strong>De:</strong> ${escapeHtml(who)} (${escapeHtml(params.creatorRole)})</p>
    ${
      params.communityName
        ? `<p style="margin:0 0 8px;"><strong>Comunidad:</strong> ${escapeHtml(params.communityName)}</p>`
        : ''
    }
  `
  return { subject, text, html: wrapVecindarioEmailHtml(inner) }
}

export function buildSupportStaffReplyEmail(params: {
  ticketId: number
  subject: string
  preview: string
}): { subject: string; html: string; text: string } {
  const subject = `Vecindario Soporte — Respuesta al ticket #${params.ticketId}`
  const text = [
    `Hemos respondido a tu ticket #${params.ticketId}: ${params.subject}`,
    '',
    params.preview,
    '',
    'Entra en Vecindario → Perfil → Soporte para continuar la conversación.',
  ].join('\n')
  const inner = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">Respuesta de soporte</h1>
    <p style="margin:0 0 10px;">Hemos respondido a tu ticket <strong>#${params.ticketId}</strong>
      («${escapeHtml(params.subject)}»).</p>
    <div style="background:#f8fafc;border-left:4px solid #5b21b6;padding:12px 14px;margin:12px 0;border-radius:0 8px 8px 0;">
      <p style="margin:0;white-space:pre-wrap;color:#334155;">${escapeHtml(params.preview)}</p>
    </div>
    <p style="margin:0;font-size:13px;color:#64748b;">Abre Vecindario → Perfil → Soporte para ver el hilo completo.</p>
  `
  return { subject, text, html: wrapVecindarioEmailHtml(inner) }
}

export function buildSupportUserReplyEmail(params: {
  ticketId: number
  subject: string
  preview: string
}): { subject: string; html: string; text: string } {
  const subject = `Vecindario Soporte — Mensaje usuario #${params.ticketId}`
  const text = `Ticket #${params.ticketId} (${params.subject}):\n\n${params.preview}`
  const inner = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">Mensaje del usuario</h1>
    <p style="margin:0 0 8px;">Ticket <strong>#${params.ticketId}</strong> — ${escapeHtml(params.subject)}</p>
    <div style="background:#f8fafc;border-left:4px solid #0f766e;padding:12px 14px;margin:12px 0;border-radius:0 8px 8px 0;">
      <p style="margin:0;white-space:pre-wrap;color:#334155;">${escapeHtml(params.preview)}</p>
    </div>
  `
  return { subject, text, html: wrapVecindarioEmailHtml(inner) }
}
