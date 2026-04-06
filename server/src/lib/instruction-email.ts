/** Email obligatorio para enviar instrucciones (contacto, presidente, administrador). */
export function parseInstructionEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s || s.length > 255) return null
  // Básico: local@dominio.tld
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null
  return s
}

/** Vacío → null; si hay texto debe ser email válido (invalidFormat si no). */
export function parseOptionalInstructionEmail(
  raw: unknown,
): { value: string | null; invalidFormat: boolean } {
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (!t) return { value: null, invalidFormat: false }
  const v = parseInstructionEmail(t)
  if (!v) return { value: null, invalidFormat: true }
  return { value: v, invalidFormat: false }
}
