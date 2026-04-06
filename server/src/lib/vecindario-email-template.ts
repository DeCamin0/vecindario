import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Rădăcina vecindario-app (server/src/lib → ../../../) */
function appRootDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
}

/**
 * URL absolut pentru <img> în HTML mail.
 *
 * Gmail și alți clienți nu afișează corect `data:image/...;base64` în email → icon spart.
 * În producție: `EMAIL_LOGO_URL` sau `APP_PUBLIC_URL` (https) + fișierul din `public/`.
 *
 * Data URI doar dacă `EMAIL_LOGO_DATA_URI=true` (ex. Mailhog local).
 */
export function getEmailLogoSrc(): string | null {
  const custom = process.env.EMAIL_LOGO_URL?.trim()
  if (custom) return custom

  const logoFile = (process.env.EMAIL_LOGO_PATH || 'Vencindario_logo.png').trim().replace(/^\/+/, '')
  const appPublic = process.env.APP_PUBLIC_URL?.trim().replace(/\/+$/, '')
  if (appPublic?.startsWith('https://')) {
    return `${appPublic}/${logoFile}`
  }

  if (process.env.EMAIL_LOGO_DATA_URI === 'true') {
    const root = appRootDir()
    const pngPath = join(root, 'public', 'Vencindario_logo.png')
    if (existsSync(pngPath)) {
      const b64 = readFileSync(pngPath).toString('base64')
      return `data:image/png;base64,${b64}`
    }
    const svgPath = join(root, 'public', 'vecindario-mark.svg')
    if (existsSync(svgPath)) {
      const raw = readFileSync(svgPath, 'utf-8')
      return `data:image/svg+xml;base64,${Buffer.from(raw, 'utf-8').toString('base64')}`
    }
  }

  return null
}

const BRAND_PURPLE = '#5b21b6'
const BRAND_PURPLE_DARK = '#4c1d95'
const BRAND_ACCENT = '#7c3aed'
const CARD_BG = '#f8fafc'
const BORDER = '#e2e8f0'

function emailShell(innerBody: string, logoSrc: string | null): string {
  const logoHtml = logoSrc
    ? `<img src="${logoSrc}" alt="Vecindario" width="132" height="auto" style="display:block;margin:0 auto 12px;max-width:160px;height:auto;border:0;" />`
    : `<div style="font-size:26px;font-weight:800;color:#f5f3ff;letter-spacing:-0.03em;text-align:center;margin-bottom:8px;">Vecindario</div>`

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vecindario</title>
</head>
<body style="margin:0;padding:0;background-color:#e8edf5;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#e8edf5;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;border-collapse:collapse;">
          <tr>
            <td style="background:linear-gradient(135deg, ${BRAND_PURPLE} 0%, ${BRAND_ACCENT} 48%, ${BRAND_PURPLE_DARK} 100%);border-radius:14px 14px 0 0;padding:28px 24px;text-align:center;">
              ${logoHtml}
              <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.88);font-weight:500;">Comunidad conectada</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:28px 24px 24px;border-radius:0 0 14px 14px;border:1px solid ${BORDER};border-top:none;">
              ${innerBody}
              <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid ${BORDER};font-size:12px;color:#64748b;text-align:center;line-height:1.5;">
                Mensaje enviado por <strong style="color:#475569;">Vecindario</strong> · De Camino Servicios Auxiliares<br />
                Si no solicitaste este correo, puedes ignorarlo.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** Mismo envoltorio que altas / invitaciones (logo + pie). */
export function wrapVecindarioEmailHtml(innerBody: string): string {
  return emailShell(innerBody, getEmailLogoSrc())
}

export function buildOfficialInviteEmailContent(params: {
  toEmail: string
  communityName: string
  accessCode: string | null
  loginUrl: string
  roleLabelEs: string
  passwordPlain: string | null
  existingAccount: boolean
}): { subject: string; html: string; text: string } {
  const {
    toEmail,
    communityName,
    accessCode,
    loginUrl,
    roleLabelEs,
    passwordPlain,
    existingAccount,
  } = params

  const subject =
    roleLabelEs.includes('presidente y') || roleLabelEs.includes('y administrador')
      ? `Vecindario — Acceso gestión «${communityName}»`
      : `Vecindario — Acceso ${roleLabelEs} «${communityName}»`

  const accessBlock = accessCode
    ? `<div style="background:${CARD_BG};border-left:4px solid ${BRAND_ACCENT};padding:14px 16px;margin:18px 0;border-radius:0 8px 8px 0;">
        <p style="margin:0 0 4px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Código de acceso de la comunidad</p>
        <p style="margin:0;font-size:20px;font-weight:700;color:${BRAND_PURPLE};letter-spacing:0.06em;font-family:Consolas,Monaco,monospace;">${escapeHtml(accessCode)}</p>
        <p style="margin:8px 0 0;font-size:13px;color:#475569;line-height:1.45;">Compártelo con vecinos y para enlazar la comunidad en la app.</p>
      </div>`
    : ''

  const credentialsBlock =
    passwordPlain && !existingAccount
      ? `<div style="background:#fefce8;border:1px solid #fde047;border-radius:10px;padding:16px 18px;margin:20px 0;">
          <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#854d0e;">Tus datos de acceso a la app</p>
          <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;font-size:14px;color:#422006;">
            <tr><td style="padding:6px 0;color:#713f12;width:100px;vertical-align:top;">Usuario</td><td style="padding:6px 0;font-weight:600;word-break:break-all;">${escapeHtml(toEmail)}</td></tr>
            <tr><td style="padding:6px 0;color:#713f12;vertical-align:top;">Contraseña</td><td style="padding:6px 0;font-family:Consolas,Monaco,monospace;font-size:15px;font-weight:700;letter-spacing:0.02em;word-break:break-all;">${escapeHtml(passwordPlain)}</td></tr>
          </table>
          <p style="margin:12px 0 0;font-size:12px;color:#a16207;line-height:1.45;">Cámbiala en cuanto entres. En el login elige el <strong>rol</strong> que te hayan indicado (Administrador, Presidente, Conserje…).</p>
        </div>`
      : `<div style="background:${CARD_BG};border-radius:10px;padding:16px 18px;margin:20px 0;border:1px solid ${BORDER};">
          <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#334155;">Usuario para iniciar sesión</p>
          <p style="margin:0;font-size:15px;font-weight:600;color:${BRAND_PURPLE};word-break:break-all;">${escapeHtml(toEmail)}</p>
          <p style="margin:12px 0 0;font-size:13px;color:#475569;line-height:1.5;">
            ${
              existingAccount
                ? 'Este correo <strong>ya tenía cuenta</strong> en Vecindario antes de dar de alta esta comunidad. Por eso <strong>no se genera ni se envía contraseña nueva por email</strong> (no la tenemos en claro). Entra con la <strong>misma contraseña de siempre</strong>. Si no la recuerdas, desde el panel de super administrador se puede asignar una <strong>contraseña temporal</strong> (una sola vez), o contacta con soporte de tu empresa.'
                : 'Si acabas de recibir una contraseña temporal en un recuadro amarillo más arriba, úsala al entrar y cámbiala después.'
            }
          </p>
        </div>`

  const ctaButton = `<div style="text-align:center;margin:24px 0 8px;">
    <a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:linear-gradient(135deg, ${BRAND_PURPLE}, ${BRAND_ACCENT});color:#ffffff !important;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:10px;box-shadow:0 4px 14px rgba(91,33,182,0.35);">Entrar a Vecindario</a>
  </div>
  <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;word-break:break-all;">${escapeHtml(loginUrl)}</p>`

  const inner = `
    <p style="margin:0 0 16px;font-size:16px;color:#0f172a;line-height:1.5;">Hola,</p>
    <p style="margin:0 0 18px;font-size:15px;color:#334155;line-height:1.55;">
      Se ha dado de alta en <strong>Vecindario</strong> la comunidad<br />
      <span style="color:${BRAND_PURPLE};font-weight:700;">«${escapeHtml(communityName)}»</span>
    </p>
    ${accessBlock}
    ${credentialsBlock}
    <p style="margin:18px 0 8px;font-size:14px;color:#475569;">Tu rol en la app: <strong style="color:${BRAND_PURPLE};">${escapeHtml(roleLabelEs)}</strong></p>
    ${ctaButton}
    <p style="margin:24px 0 0;font-size:14px;color:#334155;line-height:1.5;">Un saludo,<br /><strong>Equipo Vecindario</strong></p>
  `

  const logoSrc = getEmailLogoSrc()
  const html = emailShell(inner, logoSrc)

  let text = `Hola,

Se ha dado de alta en Vecindario la comunidad «${communityName}».

`
  if (accessCode) {
    text += `Código de acceso de la comunidad: ${accessCode}

`
  }
  text += `Usuario (email): ${toEmail}
`
  if (passwordPlain && !existingAccount) {
    text += `Contraseña temporal: ${passwordPlain}

Cámbiala en cuanto entres.
`
  } else if (existingAccount) {
    text += `Tu correo ya tenía cuenta en Vecindario: no enviamos contraseña nueva (no la almacenamos en claro). Usa tu contraseña habitual. Si no la recuerdas, pide una contraseña temporal desde el super administrador o contacta con soporte.

`
  }
  text += `Enlace para iniciar sesión: ${loginUrl}

Tu rol en la app: ${roleLabelEs}

Un saludo,
Vecindario`

  return { subject, html, text }
}

export function buildContactSummaryEmailContent(params: {
  communityName: string
  accessCode: string | null
  nifCif: string | null
  loginUrl: string
  invitedLines: string[]
}): { subject: string; html: string; text: string } {
  const { communityName, accessCode, nifCif, loginUrl, invitedLines } = params
  const subject = `Vecindario — Alta comunidad «${communityName}» (resumen)`

  const listHtml =
    invitedLines.length > 0
      ? `<ul style="margin:12px 0;padding-left:20px;color:#334155;line-height:1.6;">${invitedLines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`
      : '<p style="color:#64748b;font-size:14px;">Ninguna notificación adicional.</p>'

  const metaRows = [
    nifCif ? `<tr><td style="padding:8px 0;color:#64748b;width:120px;">NIF/CIF</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(nifCif)}</td></tr>` : '',
    accessCode
      ? `<tr><td style="padding:8px 0;color:#64748b;">Código acceso</td><td style="padding:8px 0;font-family:monospace;font-weight:700;color:${BRAND_PURPLE};">${escapeHtml(accessCode)}</td></tr>`
      : '',
  ]
    .filter(Boolean)
    .join('')

  const inner = `
    <p style="margin:0 0 12px;font-size:16px;color:#0f172a;">Resumen del alta</p>
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Comunidad <strong>«${escapeHtml(communityName)}»</strong> registrada en Vecindario.</p>
    ${metaRows ? `<table role="presentation" style="width:100%;margin:16px 0;font-size:14px;">${metaRows}</table>` : ''}
    <p style="margin:16px 0 8px;font-size:13px;font-weight:700;color:#475569;">Invitaciones enviadas a:</p>
    ${listHtml}
    <div style="text-align:center;margin:22px 0 0;">
      <a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:linear-gradient(135deg, ${BRAND_PURPLE}, ${BRAND_ACCENT});color:#ffffff !important;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px;">Abrir Vecindario</a>
    </div>
  `

  const html = emailShell(inner, getEmailLogoSrc())

  let text = `Resumen del alta — Vecindario

Comunidad: ${communityName}
`
  if (nifCif) text += `NIF/CIF: ${nifCif}\n`
  if (accessCode) text += `Código de acceso: ${accessCode}\n`
  text += `\nEnlace: ${loginUrl}\n\nInvitaciones:\n${invitedLines.map((l) => `• ${l}`).join('\n')}\n`

  return { subject, html, text }
}
