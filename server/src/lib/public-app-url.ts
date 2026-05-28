/**
 * URL pública de la app web Vecindario (correos, enlaces «Entrar», logo en SMTP).
 *
 * Prioridad: VECINDARIO_PUBLIC_URL → APP_PUBLIC_URL → http://localhost:5175
 *
 * En local, APP_PUBLIC_URL=http://localhost:5173/vecindario era el shell DeCamino;
 * la PWA Vecindario corre en :5175 sin prefijo — se corrige automáticamente.
 */

function trimBase(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

/** Origen web Vecindario sin barra final (ej. http://localhost:5175). */
export function vecindarioPublicBaseUrl(): string {
  const fromEnv =
    process.env.VECINDARIO_PUBLIC_URL?.trim() || process.env.APP_PUBLIC_URL?.trim() || ''
  let base = trimBase(fromEnv || 'http://localhost:5175')

  if (/^https?:\/\/localhost:5173\/vecindario$/i.test(base)) {
    base = 'http://localhost:5175'
  } else if (/^https?:\/\/localhost:5173$/i.test(base)) {
    base = 'http://localhost:5175'
  }

  return base
}

/** Ruta de login en la PWA (ej. http://localhost:5175/login). */
export function vecindarioLoginUrl(): string {
  const base = vecindarioPublicBaseUrl()
  return `${base}/login`
}

/** Texto para correos cuando no hay URL absoluta configurada. */
export function vecindarioLoginHint(): string {
  const u = vecindarioLoginUrl()
  return u || 'el enlace de acceso a Vecindario (web)'
}
