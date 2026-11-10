import { money } from './format'

export function formatGroupAmount(amount, grupo) {
  const currency = grupo?.moneda || 'COP'
  if (currency === 'COP') return money(amount)
  const nativeAmount = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0)
  const copEquivalent = money((Number(amount) || 0) * (Number(grupo?.tasaCop) || 1))
  return `${nativeAmount} (${copEquivalent} equiv.)`
}
