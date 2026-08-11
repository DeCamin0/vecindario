/**
 * Aritmética monetaria segura (2 decimales, half-up).
 * Usa Prisma.Decimal (decimal.js) — ya en el proyecto; sin queries DB.
 */
import { Prisma } from '@prisma/client'

export type MoneyInput = string | number | Prisma.Decimal

const D = Prisma.Decimal
const ROUND = D.ROUND_HALF_UP

export function money(value: MoneyInput): Prisma.Decimal {
  try {
    const d = value instanceof D ? value : new D(value)
    if (!d.isFinite()) {
      throw new Error('not finite')
    }
    return d
  } catch {
    throw new Error(`Importe inválido: ${String(value)}`)
  }
}

/** Redondeo comercial a céntimos (half-up). */
export function roundMoney(value: MoneyInput): Prisma.Decimal {
  return money(value).toDecimalPlaces(2, ROUND)
}

/** String fijo con 2 decimales (ej. "69.00"). */
export function formatMoney(value: MoneyInput): string {
  return roundMoney(value).toFixed(2)
}

export function addMoney(...parts: MoneyInput[]): Prisma.Decimal {
  return roundMoney(parts.reduce<Prisma.Decimal>((acc, p) => acc.plus(money(p)), new D(0)))
}

export function subMoney(a: MoneyInput, b: MoneyInput): Prisma.Decimal {
  return roundMoney(money(a).minus(money(b)))
}

export function mulMoney(a: MoneyInput, b: MoneyInput): Prisma.Decimal {
  return roundMoney(money(a).times(money(b)))
}

/** max(0, value) redondeado. */
export function clampMoneyNonNegative(value: MoneyInput): Prisma.Decimal {
  const d = roundMoney(value)
  return d.isNegative() ? new D('0.00') : d
}

/**
 * IVA sobre neto: vat = round(net * rate/100), gross = net + vat.
 */
export function computeVat(
  netEur: MoneyInput,
  vatRatePct: MoneyInput,
): { vatEur: Prisma.Decimal; grossEur: Prisma.Decimal; vatRatePct: Prisma.Decimal } {
  const net = roundMoney(netEur)
  const rate = money(vatRatePct)
  const vat = roundMoney(net.times(rate).dividedBy(100))
  const gross = roundMoney(net.plus(vat))
  return { vatEur: vat, grossEur: gross, vatRatePct: rate }
}
