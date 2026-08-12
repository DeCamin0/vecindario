/**
 * Email de recuperación de contraseña (HTML marca Vecindario).
 */
import { escapeHtml, wrapVecindarioEmailHtml } from './vecindario-email-template.js'

export function buildPasswordResetEmailContent(params: {
  resetUrl: string
  ttlMinutes: number
}): { subject: string; html: string; text: string } {
  const { resetUrl, ttlMinutes } = params
  const subject = 'Vecindario — Restablecer contraseña'
  const safeUrl = escapeHtml(resetUrl)

  const inner = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;font-weight:700;">Restablecer contraseña</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#334155;">
      Hemos recibido una solicitud para cambiar la contraseña de tu cuenta en Vecindario.
    </p>
    <p style="margin:0 0 18px;text-align:center;">
      <a href="${safeUrl}"
         style="display:inline-block;background:#5b21b6;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:10px;">
        Elegir nueva contraseña
      </a>
    </p>
    <p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:#64748b;">
      Este enlace caduca en <strong>${ttlMinutes} minutos</strong> y solo se puede usar una vez.
    </p>
    <p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:#64748b;">
      Si no has solicitado este cambio, ignora este correo: tu contraseña no se modificará.
    </p>
    <p style="margin:16px 0 0;font-size:12px;line-height:1.45;color:#94a3b8;word-break:break-all;">
      Si el botón no funciona, copia y pega este enlace en el navegador:<br/>${safeUrl}
    </p>
  `

  const text = [
    'Vecindario — Restablecer contraseña',
    '',
    'Hemos recibido una solicitud para cambiar la contraseña de tu cuenta.',
    '',
    `Abrir enlace (válido ${ttlMinutes} minutos, un solo uso):`,
    resetUrl,
    '',
    'Si no has solicitado este cambio, ignora este correo.',
  ].join('\n')

  return {
    subject,
    text,
    html: wrapVecindarioEmailHtml(inner),
  }
}
