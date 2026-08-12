/**
 * Tests recuperación de contraseña (repo en memoria + bcrypt real).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import bcrypt from 'bcrypt'
import {
  FORGOT_GENERIC_MESSAGE,
  FORGOT_RATE_LIMIT_EMAIL,
  FORGOT_RATE_WINDOW_EMAIL_MS,
  ForgotPasswordRateLimitError,
  SlidingWindowRateLimiter,
  completePasswordReset,
  createMemoryPasswordResetRepo,
  generatePasswordResetTokenPlain,
  hashPasswordResetToken,
  normalizeResetEmail,
  passwordResetExpiresAt,
  requestPasswordReset,
  validateNewPasswordPair,
} from './password-reset.js'
import { buildPasswordResetEmailContent } from './password-reset-mail.js'

describe('password-reset helpers', () => {
  it('token plano 32 bytes base64url y hash SHA-256 hex (nunca igual al plano)', () => {
    const plain = generatePasswordResetTokenPlain()
    assert.ok(plain.length >= 40)
    assert.match(plain, /^[A-Za-z0-9_-]+$/)
    const hash = hashPasswordResetToken(plain)
    assert.equal(hash.length, 64)
    assert.match(hash, /^[a-f0-9]{64}$/)
    assert.notEqual(hash, plain)
    assert.equal(hashPasswordResetToken(plain), hash)
  })

  it('TTL ~60 minutos', () => {
    const from = new Date('2026-08-12T12:00:00.000Z')
    const exp = passwordResetExpiresAt(from)
    assert.equal(exp.getTime() - from.getTime(), 60 * 60 * 1000)
  })

  it('validateNewPasswordPair: mismatch y corta', () => {
    assert.equal(validateNewPasswordPair('abcdef', 'abcdeg').ok, false)
    assert.equal(validateNewPasswordPair('abc', 'abc').ok, false)
    assert.equal(validateNewPasswordPair('abcdef', 'abcdef').ok, true)
  })

  it('normalizeResetEmail', () => {
    assert.equal(normalizeResetEmail('  A@B.com '), 'a@b.com')
    assert.equal(normalizeResetEmail('nope'), null)
    assert.equal(normalizeResetEmail(null), null)
  })

  it('email content no incluye token en subject; sí URL', () => {
    const c = buildPasswordResetEmailContent({
      resetUrl: 'https://example.com/restablecer-contrasena?token=ABC',
      ttlMinutes: 60,
    })
    assert.match(c.subject, /Restablecer/)
    assert.match(c.text, /60 minutos/)
    assert.match(c.html, /ABC/)
    assert.match(c.text, /ignora/i)
  })
})

describe('forgot + reset flow (memory repo)', () => {
  it('1+2: email existente e inexistente → mismo mensaje', async () => {
    const oldHash = await bcrypt.hash('oldpass1', 12)
    const repo = createMemoryPasswordResetRepo({
      users: [{ id: 1, email: 'user@example.com', passwordHash: oldHash, passwordPlainSnapshot: 'oldpass1' }],
    })
    const limiter = new SlidingWindowRateLimiter()
    const sent: Array<{ to: string; text: string }> = []

    const a = await requestPasswordReset({
      emailRaw: 'user@example.com',
      ip: '1.1.1.1',
      repo,
      limiter,
      mailConfigured: () => true,
      send: async (m) => {
        sent.push({ to: m.to, text: m.text })
      },
      exposeTokenForTests: true,
    })
    const b = await requestPasswordReset({
      emailRaw: 'nobody@example.com',
      ip: '1.1.1.2',
      repo,
      limiter,
      mailConfigured: () => true,
      send: async () => {
        throw new Error('should not send')
      },
    })
    assert.equal(a.message, FORGOT_GENERIC_MESSAGE)
    assert.equal(b.message, FORGOT_GENERIC_MESSAGE)
    assert.equal(a.message, b.message)
    assert.equal(a.userFound, true)
    assert.equal(b.userFound, false)
    assert.equal(a.emailSent, true)
    assert.equal(sent.length, 1)
  })

  it('3: usuario sin email no es encontrado por correo', async () => {
    const repo = createMemoryPasswordResetRepo({
      users: [{ id: 2, email: null, passwordHash: await bcrypt.hash('x', 12) }],
    })
    const r = await requestPasswordReset({
      emailRaw: 'ghost@example.com',
      ip: '2.2.2.2',
      repo,
      limiter: new SlidingWindowRateLimiter(),
      mailConfigured: () => true,
      send: async () => {},
    })
    assert.equal(r.userFound, false)
    assert.equal(r.message, FORGOT_GENERIC_MESSAGE)
  })

  it('4–8 + 12–14 + 17: token válido, usado, reuso, login bcrypt, snapshot null, hash en DB', async () => {
    const oldHash = await bcrypt.hash('oldpass99', 12)
    const repo = createMemoryPasswordResetRepo({
      users: [
        {
          id: 10,
          email: 'reset@example.com',
          passwordHash: oldHash,
          passwordPlainSnapshot: 'oldpass99',
        },
      ],
    })
    const limiter = new SlidingWindowRateLimiter()
    const forgot = await requestPasswordReset({
      emailRaw: 'reset@example.com',
      ip: '3.3.3.3',
      repo,
      limiter,
      mailConfigured: () => true,
      send: async () => {},
      exposeTokenForTests: true,
    })
    const plain = forgot._testPlainToken!
    const storedHash = forgot._testTokenHash!
    assert.ok(plain)
    assert.equal(storedHash, hashPasswordResetToken(plain))
    assert.ok(repo.tokens.every((t) => t.tokenHash !== plain))
    assert.ok(repo.tokens.some((t) => t.tokenHash === storedHash))

    const badTok = await completePasswordReset({
      tokenRaw: 'not-a-real-token',
      newPassword: 'newpass1',
      confirmPassword: 'newpass1',
      repo,
    })
    assert.equal(badTok.ok, false)

    const expiredRepo = createMemoryPasswordResetRepo({
      users: [{ id: 11, email: 'e@x.com', passwordHash: oldHash }],
    })
    const expiredPlain = generatePasswordResetTokenPlain()
    const expiredHash = hashPasswordResetToken(expiredPlain)
    await expiredRepo.createResetToken({
      userId: 11,
      tokenHash: expiredHash,
      expiresAt: new Date(Date.now() - 1000),
      requestIp: null,
      userAgent: null,
    })
    const exp = await completePasswordReset({
      tokenRaw: expiredPlain,
      newPassword: 'newpass1',
      confirmPassword: 'newpass1',
      repo: expiredRepo,
    })
    assert.equal(exp.ok, false)

    const ok = await completePasswordReset({
      tokenRaw: plain,
      newPassword: 'newpass42',
      confirmPassword: 'newpass42',
      repo,
    })
    assert.equal(ok.ok, true)
    const user = await repo.findUserById(10)
    assert.ok(user)
    assert.equal(user.passwordPlainSnapshot, null)
    assert.ok(await bcrypt.compare('newpass42', user.passwordHash))
    assert.equal(await bcrypt.compare('oldpass99', user.passwordHash), false)

    const reuse = await completePasswordReset({
      tokenRaw: plain,
      newPassword: 'another1',
      confirmPassword: 'another1',
      repo,
    })
    assert.equal(reuse.ok, false)
  })

  it('9: segundo forgot invalida token anterior', async () => {
    const repo = createMemoryPasswordResetRepo({
      users: [{ id: 20, email: 'twice@example.com', passwordHash: await bcrypt.hash('a', 12) }],
    })
    const limiter = new SlidingWindowRateLimiter()
    const first = await requestPasswordReset({
      emailRaw: 'twice@example.com',
      ip: '4.4.4.4',
      repo,
      limiter,
      mailConfigured: () => true,
      send: async () => {},
      exposeTokenForTests: true,
    })
    const second = await requestPasswordReset({
      emailRaw: 'twice@example.com',
      ip: '4.4.4.5',
      repo,
      limiter,
      mailConfigured: () => true,
      send: async () => {},
      exposeTokenForTests: true,
    })
    const r1 = await completePasswordReset({
      tokenRaw: first._testPlainToken,
      newPassword: 'bbbbbb',
      confirmPassword: 'bbbbbb',
      repo,
    })
    assert.equal(r1.ok, false)
    const r2 = await completePasswordReset({
      tokenRaw: second._testPlainToken,
      newPassword: 'cccccc',
      confirmPassword: 'cccccc',
      repo,
    })
    assert.equal(r2.ok, true)
  })

  it('10–11: mismatch y corta', async () => {
    const repo = createMemoryPasswordResetRepo({
      users: [{ id: 30, email: 'm@x.com', passwordHash: await bcrypt.hash('z', 12) }],
    })
    const forgot = await requestPasswordReset({
      emailRaw: 'm@x.com',
      ip: '5.5.5.5',
      repo,
      limiter: new SlidingWindowRateLimiter(),
      mailConfigured: () => true,
      send: async () => {},
      exposeTokenForTests: true,
    })
    const mismatch = await completePasswordReset({
      tokenRaw: forgot._testPlainToken,
      newPassword: 'abcdef',
      confirmPassword: 'abcdeg',
      repo,
    })
    assert.equal(mismatch.ok, false)
    if (!mismatch.ok) assert.match(mismatch.error, /coinciden/)

    const short = await completePasswordReset({
      tokenRaw: forgot._testPlainToken,
      newPassword: 'abc',
      confirmPassword: 'abc',
      repo,
    })
    assert.equal(short.ok, false)
    if (!short.ok) assert.match(short.error, /6/)
  })

  it('15: rate limit email', async () => {
    const repo = createMemoryPasswordResetRepo({
      users: [{ id: 40, email: 'rl@example.com', passwordHash: await bcrypt.hash('z', 12) }],
    })
    const limiter = new SlidingWindowRateLimiter()
    for (let i = 0; i < FORGOT_RATE_LIMIT_EMAIL; i += 1) {
      await requestPasswordReset({
        emailRaw: 'rl@example.com',
        ip: `9.9.9.${i}`,
        repo,
        limiter,
        mailConfigured: () => true,
        send: async () => {},
      })
    }
    await assert.rejects(
      () =>
        requestPasswordReset({
          emailRaw: 'rl@example.com',
          ip: '9.9.9.99',
          repo,
          limiter,
          mailConfigured: () => true,
          send: async () => {},
        }),
      (e: unknown) => e instanceof ForgotPasswordRateLimitError,
    )
    assert.ok(limiter.peekCount('email:rl@example.com', FORGOT_RATE_WINDOW_EMAIL_MS) >= FORGOT_RATE_LIMIT_EMAIL)
  })

  it('16: fallo SMTP no filtra existencia (mismo mensaje)', async () => {
    const repo = createMemoryPasswordResetRepo({
      users: [{ id: 50, email: 'smtp@example.com', passwordHash: await bcrypt.hash('z', 12) }],
    })
    const r = await requestPasswordReset({
      emailRaw: 'smtp@example.com',
      ip: '6.6.6.6',
      repo,
      limiter: new SlidingWindowRateLimiter(),
      mailConfigured: () => true,
      send: async () => {
        throw new Error('SMTP down')
      },
    })
    assert.equal(r.message, FORGOT_GENERIC_MESSAGE)
    assert.equal(r.userFound, true)
    assert.equal(r.emailSent, false)
  })
})
