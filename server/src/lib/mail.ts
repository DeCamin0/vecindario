import nodemailer from 'nodemailer'

function envTrim(key: string): string {
  return (process.env[key] || '').trim()
}

/** SMTP listo para enviar (host + remitente From). User/pass opcionales según el servidor. */
export function isMailConfigured(): boolean {
  return Boolean(envTrim('SMTP_HOST') && envTrim('SMTP_FROM'))
}

function createTransport() {
  const host = envTrim('SMTP_HOST')
  const port = Number(envTrim('SMTP_PORT') || '587')
  const secure =
    envTrim('SMTP_SECURE') === 'true' || envTrim('SMTP_SECURE') === '1' || port === 465
  const user = envTrim('SMTP_USER')
  const pass = process.env.SMTP_PASS || ''

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  })
}

export async function sendMail(opts: {
  to: string
  subject: string
  text: string
  html?: string
}): Promise<void> {
  if (!isMailConfigured()) {
    throw new Error('SMTP no configurado (SMTP_HOST / SMTP_FROM)')
  }
  const from = envTrim('SMTP_FROM')
  const transporter = createTransport()
  await transporter.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html ?? opts.text.replace(/\n/g, '<br/>'),
  })
}
