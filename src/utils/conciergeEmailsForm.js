/** @typedef {{ email: string, name: string, active: boolean }} ConciergeFormSlot */

export const emptyConciergeSlot = () => ({ email: '', name: '', active: true })

const MAX_STAFF = 30

function parseActive(raw) {
  if (raw === false || raw === 0 || raw === '0' || raw === 'false') return false
  return true
}

function pushSlot(list, seen, emailRaw, nameRaw, activeRaw) {
  const t = (emailRaw || '').trim()
  if (!t) return
  const n = t.toLowerCase()
  if (seen.has(n) || list.length >= MAX_STAFF) return
  seen.add(n)
  list.push({
    email: t,
    name: (nameRaw || '').trim(),
    active: parseActive(activeRaw),
  })
}

function parseJsonList(json, legacyEmails = []) {
  const seen = new Set()
  /** @type {ConciergeFormSlot[]} */
  const list = []
  if (Array.isArray(json)) {
    for (const item of json) {
      if (typeof item === 'string') {
        pushSlot(list, seen, item, '', true)
        continue
      }
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        pushSlot(list, seen, item.email, item.name, item.active)
      }
    }
  }
  if (!list.length) {
    for (const raw of legacyEmails) {
      pushSlot(list, seen, raw, '', true)
    }
  }
  return list
}

/** @param {import('../../server/src/lib/concierge-emails.js').ConciergeEmailFields} c */
export function conciergeEmailsFromCommunity(c) {
  const conciergeStaff = parseJsonList(c?.conciergeEmailsJson, [
    c?.conciergeEmail,
    c?.conciergeEmail2,
  ])
  const conciergeSubstitutes = parseJsonList(c?.conciergeSubstitutesJson, [
    c?.conciergeSubstituteEmail,
  ])
  if (
    conciergeSubstitutes.length === 1 &&
    !conciergeSubstitutes[0].name &&
    (c?.conciergeSubstituteName || '').trim()
  ) {
    conciergeSubstitutes[0].name = (c.conciergeSubstituteName || '').trim()
  }

  return {
    conciergeStaff: conciergeStaff.length ? conciergeStaff : [emptyConciergeSlot()],
    conciergeSubstitutes,
  }
}

function formatSlotLabel(slot, suffix = '') {
  if (!slot?.email) return ''
  const nm = (slot.name || '').trim()
  const inactive = slot.active === false ? ' (inactivo)' : ''
  const base = nm ? `${nm} <${slot.email}>` : slot.email
  return `${base}${suffix}${inactive}`
}

/** Texto para checkbox de correos de alta (lista + suplentes). */
export function conciergeEmailsSummary(c) {
  const { conciergeStaff, conciergeSubstitutes } = conciergeEmailsFromCommunity(c)
  const parts = conciergeStaff.map((s) => formatSlotLabel(s)).filter(Boolean)
  for (const s of conciergeSubstitutes) {
    parts.push(formatSlotLabel(s, ' (supl.)'))
  }
  return parts.length ? parts.join(', ') : ''
}

export function hasAnyConciergeEmail(c) {
  return Boolean(conciergeEmailsSummary(c))
}

function slotsToPayload(slots) {
  return (slots || [])
    .map((s) => ({
      email: String(s?.email ?? '').trim(),
      name: String(s?.name ?? '').trim(),
      active: s?.active !== false,
    }))
    .filter((s) => s.email)
    .map((s) => ({
      email: s.email,
      ...(s.name ? { name: s.name } : {}),
      ...(s.active === false ? { active: false } : {}),
    }))
}

export function conciergePayloadFromForm(form) {
  /** @type {Record<string, unknown>} */
  const payload = {
    conciergeStaff: slotsToPayload(form.conciergeStaff),
    conciergeSubstitutes: slotsToPayload(form.conciergeSubstitutes),
  }
  return payload
}

export function conciergeDisplayItems(c) {
  const { conciergeStaff, conciergeSubstitutes } = conciergeEmailsFromCommunity(c)
  const titulars = conciergeStaff
    .filter((s) => (s.email || '').trim())
    .map((s) => ({
      name: (s.name || '').trim() || 'Conserje',
      email: s.email.trim(),
      kind: 'titular',
      active: s.active !== false,
    }))
  const subs = conciergeSubstitutes
    .filter((s) => (s.email || '').trim())
    .map((s) => ({
      name: (s.name || '').trim() || 'Suplente',
      email: s.email.trim(),
      kind: 'suplente',
      active: s.active !== false,
    }))
  return [...titulars, ...subs]
}
