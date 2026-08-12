/**
 * Tests Soporte — catálogo, roles, unread, validación, scoping, admin, emails.
 */
import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import {
  isSupportAreaCode,
  isSupportPriority,
  isSupportStatus,
  supportAreasCatalog,
  SUPPORT_AREA_CODES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
} from './support-catalog.js'
import { canUseSupportSelfService } from './support-access.js'
import {
  SupportError,
  _resetSupportRateLimitersForTests,
  adminListSupportTickets,
  adminPatchSupportTicket,
  adminReplySupportTicket,
  createSupportTicket,
  getMySupportTicket,
  isStaffUnread,
  isUserUnread,
  listMySupportTickets,
  replyMySupportTicket,
} from './support-service.js'
import {
  buildSupportNewTicketEmail,
  buildSupportStaffReplyEmail,
} from './support-mail.js'
import { prisma } from './prisma.js'

describe('support catalog', () => {
  it('áreas cerradas estables', () => {
    assert.ok(SUPPORT_AREA_CODES.includes('account_access'))
    assert.ok(SUPPORT_AREA_CODES.includes('billing_plan'))
    assert.equal(isSupportAreaCode('other'), true)
    assert.equal(isSupportAreaCode('zendesk'), false)
    assert.equal(supportAreasCatalog().length, SUPPORT_AREA_CODES.length)
  })

  it('status y priority', () => {
    assert.equal(isSupportStatus('closed'), true)
    assert.equal(isSupportStatus('done'), false)
    assert.equal(isSupportPriority('urgent'), true)
    assert.equal(isSupportPriority('critical'), false)
    assert.deepEqual([...SUPPORT_STATUSES], [
      'open',
      'in_progress',
      'waiting_user',
      'resolved',
      'closed',
    ])
    assert.deepEqual([...SUPPORT_PRIORITIES], ['low', 'normal', 'high', 'urgent'])
  })
})

describe('support access roles', () => {
  it('1–4: concierge / community_admin / company_admin / super_admin permitidos', () => {
    assert.equal(canUseSupportSelfService('concierge'), true)
    assert.equal(canUseSupportSelfService('community_admin'), true)
    assert.equal(canUseSupportSelfService('company_admin'), true)
    assert.equal(canUseSupportSelfService('super_admin'), true)
  })

  it('5+9+10: resident/president/pool_staff denegados (web+móvil mismos helpers)', () => {
    assert.equal(canUseSupportSelfService('resident'), false)
    assert.equal(canUseSupportSelfService('president'), false)
    assert.equal(canUseSupportSelfService('pool_staff'), false)
  })
})

describe('support unread', () => {
  const t = new Date('2026-08-12T12:00:00.000Z')
  const earlier = new Date('2026-08-12T11:00:00.000Z')

  it('15 staff unread cuando último msg es del creador', () => {
    assert.equal(
      isStaffUnread({
        lastMessageAt: t,
        staffLastReadAt: null,
        lastAuthorIsCreator: true,
      }),
      true,
    )
    assert.equal(
      isStaffUnread({
        lastMessageAt: t,
        staffLastReadAt: earlier,
        lastAuthorIsCreator: true,
      }),
      true,
    )
    assert.equal(
      isStaffUnread({
        lastMessageAt: t,
        staffLastReadAt: t,
        lastAuthorIsCreator: true,
      }),
      false,
    )
  })

  it('14 user unread cuando último msg es staff', () => {
    assert.equal(
      isUserUnread({
        lastMessageAt: t,
        userLastReadAt: null,
        lastAuthorIsCreator: false,
      }),
      true,
    )
    assert.equal(
      isUserUnread({
        lastMessageAt: t,
        userLastReadAt: null,
        lastAuthorIsCreator: true,
      }),
      false,
    )
  })
})

describe('support create validation (pre-DB)', () => {
  it('17 area inválida', async () => {
    _resetSupportRateLimitersForTests()
    await assert.rejects(
      () =>
        createSupportTicket({
          userId: 1,
          area: 'nope',
          subject: 'Hola',
          body: 'Descripción válida',
        }),
      (e: unknown) => e instanceof SupportError && e.status === 400 && /Área/.test(e.message),
    )
  })

  it('18 subject/body vacíos', async () => {
    _resetSupportRateLimitersForTests()
    await assert.rejects(
      () =>
        createSupportTicket({
          userId: 1,
          area: 'other',
          subject: '   ',
          body: 'Descripción válida',
        }),
      (e: unknown) => e instanceof SupportError && e.status === 400 && /asunto/i.test(e.message),
    )
  })
})

describe('support mail builders', () => {
  it('builders producen subject/html sin lanzar', () => {
    const a = buildSupportNewTicketEmail({
      ticketId: 9,
      subject: 'Prueba',
      area: 'other',
      creatorName: 'Ada',
      creatorEmail: 'a@b.com',
      creatorRole: 'concierge',
      communityName: 'Demo',
    })
    assert.match(a.subject, /#9/)
    const b = buildSupportStaffReplyEmail({
      ticketId: 9,
      subject: 'Prueba',
      preview: 'Hola',
    })
    assert.match(b.subject, /Respuesta/)
  })
})

describe('support DB integration', () => {
  let userA: { id: number; communityId: number | null; role: string } | null = null
  let userB: { id: number; role: string } | null = null
  let resident: { id: number } | null = null
  let staff: { id: number } | null = null
  let ticketId = 0
  let dbOk = false
  const createdTicketIds: number[] = []

  before(async () => {
    try {
      await prisma.$queryRaw`SELECT 1 FROM support_tickets LIMIT 1`
      const allowed = await prisma.vecindarioUser.findMany({
        where: { role: { in: ['concierge', 'community_admin', 'company_admin'] } },
        select: { id: true, communityId: true, role: true },
        take: 6,
        orderBy: { id: 'asc' },
      })
      const sa = await prisma.vecindarioUser.findFirst({
        where: { role: 'super_admin' },
        select: { id: true },
      })
      const res = await prisma.vecindarioUser.findFirst({
        where: { role: 'resident' },
        select: { id: true },
      })
      if (allowed.length >= 1 && sa) {
        userA = allowed[0]!
        userB = allowed.find((u) => u.id !== userA!.id) ?? null
        staff = sa
        resident = res
        dbOk = true
      }
    } catch {
      dbOk = false
    }
  })

  after(async () => {
    if (!dbOk || !createdTicketIds.length) return
    try {
      await prisma.supportTicketMessage.deleteMany({
        where: { ticketId: { in: createdTicketIds } },
      })
      await prisma.supportTicket.deleteMany({ where: { id: { in: createdTicketIds } } })
    } catch {
      /* best-effort */
    }
  })

  it('5b: resident no puede crear', async (t) => {
    if (!dbOk || !resident) return t.skip('sin resident')
    _resetSupportRateLimitersForTests()
    await assert.rejects(
      () =>
        createSupportTicket({
          userId: resident!.id,
          area: 'other',
          subject: 'Intent resident',
          body: 'No debería poder crear.',
        }),
      (e: unknown) => e instanceof SupportError && e.status === 403,
    )
  })

  it('1+2+3: rol permitido crea; autor JWT; communityId server-side', async (t) => {
    if (!dbOk || !userA) return t.skip('sin DB')
    _resetSupportRateLimitersForTests()
    assert.ok(canUseSupportSelfService(userA.role))
    const created = await createSupportTicket({
      userId: userA.id,
      area: 'other',
      subject: `Test soporte ${Date.now()}`,
      body: 'Descripción inicial del ticket de prueba.',
    })
    ticketId = created.id
    createdTicketIds.push(ticketId)
    const row = await prisma.supportTicket.findUnique({ where: { id: ticketId } })
    assert.ok(row)
    assert.equal(row!.createdByUserId, userA.id)
    assert.equal(row!.communityId, userA.communityId)
  })

  it('4: super_admin puede crear ticket propio', async (t) => {
    if (!dbOk || !staff) return t.skip('sin SA')
    _resetSupportRateLimitersForTests()
    const created = await createSupportTicket({
      userId: staff.id,
      area: 'other',
      subject: `SA propio ${Date.now()}`,
      body: 'Ticket SA.',
    })
    createdTicketIds.push(created.id)
    const row = await prisma.supportTicket.findUnique({ where: { id: created.id } })
    assert.equal(row!.createdByUserId, staff.id)
  })

  it('7: rol permitido lista solo sus tickets', async (t) => {
    if (!dbOk || !userA || !ticketId) return t.skip('sin DB')
    const mine = await listMySupportTickets(userA.id)
    assert.ok(mine.some((x) => x.id === ticketId))
    if (userB) {
      const other = await listMySupportTickets(userB.id)
      assert.ok(!other.some((x) => x.id === ticketId))
    }
  })

  it('6: resident / ajeno no leen ticket', async (t) => {
    if (!dbOk || !ticketId) return t.skip('sin DB')
    if (resident) {
      await assert.rejects(
        () => getMySupportTicket(resident!.id, ticketId),
        (e: unknown) => e instanceof SupportError && e.status === 403,
      )
    }
    if (userB) {
      await assert.rejects(
        () => getMySupportTicket(userB.id, ticketId),
        (e: unknown) => e instanceof SupportError && e.status === 403,
      )
    }
  })

  it('6b: no responder ticket ajeno', async (t) => {
    if (!dbOk || !userB || !ticketId) return t.skip('sin segundo usuario')
    _resetSupportRateLimitersForTests()
    await assert.rejects(
      () =>
        replyMySupportTicket({
          userId: userB.id,
          ticketId,
          body: 'intento ajeno',
        }),
      (e: unknown) => e instanceof SupportError && e.status === 403,
    )
  })

  it('8: inbox global solo vía adminList (SA)', async (t) => {
    if (!dbOk || !ticketId) return t.skip('sin DB')
    const all = await adminListSupportTickets({})
    assert.ok(all.some((x) => x.id === ticketId))
    const byArea = await adminListSupportTickets({ area: 'other' })
    assert.ok(byArea.some((x) => x.id === ticketId))
  })

  it('11: SA responde → unread usuario', async (t) => {
    if (!dbOk || !staff || !userA || !ticketId) return t.skip('sin DB')
    _resetSupportRateLimitersForTests()
    await adminReplySupportTicket({
      staffUserId: staff.id,
      ticketId,
      body: 'Respuesta del equipo de soporte.',
    })
    const list = await listMySupportTickets(userA.id)
    const item = list.find((x) => x.id === ticketId)
    assert.ok(item?.unread === true)
    const detail = await getMySupportTicket(userA.id, ticketId)
    assert.equal(detail.unread, false)
  })

  it('11b: SA cambia status/priority; closed/reopen', async (t) => {
    if (!dbOk || !userA || !ticketId) return t.skip('sin DB')
    await adminPatchSupportTicket({ ticketId, priority: 'high' })
    await adminPatchSupportTicket({ ticketId, status: 'closed' })
    _resetSupportRateLimitersForTests()
    await assert.rejects(
      () =>
        replyMySupportTicket({
          userId: userA!.id,
          ticketId,
          body: 'después de cerrado',
        }),
      (e: unknown) => e instanceof SupportError && e.status === 400,
    )
    await adminPatchSupportTicket({ ticketId, status: 'open' })
    const row = await prisma.supportTicket.findUnique({ where: { id: ticketId } })
    assert.equal(row!.status, 'open')
    assert.equal(row!.closedAt, null)
  })

  it('20: Billing/password/incidencias/reservas intactos', async () => {
    const billing = await import('./billing/index.js')
    assert.ok(billing)
    const pr = await import('./password-reset.js')
    assert.equal(typeof pr.requestPasswordReset, 'function')
    const fs = await import('node:fs')
    const path = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'routes')
    const files = fs.readdirSync(root)
    assert.ok(files.includes('support.ts'))
    assert.ok(files.some((f) => /incident/i.test(f)))
    assert.ok(files.some((f) => /booking/i.test(f)))
  })
})
