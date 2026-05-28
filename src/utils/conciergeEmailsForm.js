/** @typedef {{ email: string, name: string }} ConciergeFormSlot */

/** @param {import('../../server/src/lib/concierge-emails.js').ConciergeEmailFields} c */
export function conciergeEmailsFromCommunity(c) {
  const seen = new Set()
  /** @type {ConciergeFormSlot[]} */
  const list = []
  if (Array.isArray(c?.conciergeEmailsJson)) {
    for (const item of c.conciergeEmailsJson) {
      if (typeof item === 'string') {
        const t = item.trim()
        if (!t) continue
        const n = t.toLowerCase()
        if (seen.has(n) || list.length >= 5) continue
        seen.add(n)
        list.push({ email: t, name: '' })
        continue
      }
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const em = typeof item.email === 'string' ? item.email.trim() : ''
        if (!em) continue
        const n = em.toLowerCase()
        if (seen.has(n) || list.length >= 5) continue
        seen.add(n)
        const nm =
          item.name != null && String(item.name).trim() ? String(item.name).trim() : ''
        list.push({ email: em, name: nm })
      }
    }
  }
  if (!list.length) {
    for (const raw of [c?.conciergeEmail, c?.conciergeEmail2]) {
      const t = (raw || '').trim()
      if (!t) continue
      const n = t.toLowerCase()
      if (seen.has(n) || list.length >= 5) continue
      seen.add(n)
      list.push({ email: t, name: '' })
    }
  }
  const count = Math.max(1, Math.min(5, list.length || 1))
  /** @type {ConciergeFormSlot[]} */
  const slots = Array.from({ length: 5 }, () => ({ email: '', name: '' }))
  for (let i = 0; i < list.length && i < 5; i++) slots[i] = list[i]
  return {
    conciergeCount: count,
    conciergeStaff: slots,
    conciergeSubstituteEmail: (c?.conciergeSubstituteEmail || '').trim(),
    conciergeSubstituteName: (c?.conciergeSubstituteName || '').trim(),
  }
}

function formatSlotLabel(slot) {
  if (!slot?.email) return ''
  const nm = (slot.name || '').trim()
  return nm ? `${nm} <${slot.email}>` : slot.email
}

/** Texto para checkbox de correos de alta (lista + suplente). */
export function conciergeEmailsSummary(c) {
  const { conciergeStaff, conciergeSubstituteEmail, conciergeSubstituteName } =
    conciergeEmailsFromCommunity(c)
  const parts = conciergeStaff.map(formatSlotLabel).filter(Boolean)
  if (conciergeSubstituteEmail) {
    const nm = (conciergeSubstituteName || '').trim()
    parts.push(
      nm
        ? `${nm} <${conciergeSubstituteEmail}> (supl.)`
        : `${conciergeSubstituteEmail} (supl.)`,
    )
  }
  return parts.length ? parts.join(', ') : ''
}

export function hasAnyConciergeEmail(c) {
  return Boolean(conciergeEmailsSummary(c))
}

export function conciergePayloadFromForm(form) {
  const n = Math.min(5, Math.max(1, Number(form.conciergeCount) || 1))
  const staff = (form.conciergeStaff || [])
    .slice(0, n)
    .map((s) => ({
      email: String(s?.email ?? '').trim(),
      name: String(s?.name ?? '').trim(),
    }))
    .filter((s) => s.email)
    .map((s) => ({
      email: s.email,
      ...(s.name ? { name: s.name } : {}),
    }))
  /** @type {Record<string, unknown>} */
  const payload = { conciergeStaff: staff }
  const sub = String(form.conciergeSubstituteEmail ?? '').trim()
  payload.conciergeSubstituteEmail = sub
  const subName = String(form.conciergeSubstituteName ?? '').trim()
  if (subName) payload.conciergeSubstituteName = subName
  else if (sub === '') payload.conciergeSubstituteName = null
  return payload
}
