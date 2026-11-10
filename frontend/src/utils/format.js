let activeCurrencyFormatter = null
let activeCurrencyShortFormatter = null

export function setCurrencyFormatter(fn, shortFn) {
  activeCurrencyFormatter = fn
  activeCurrencyShortFormatter = shortFn
}

const cop = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })

/** Formato de moneda con conversión sincronizada en tiempo real */
export function money(value, { sign = false, showCode = false } = {}) {
  if (activeCurrencyFormatter) {
    return activeCurrencyFormatter(value, { sign, showCode })
  }
  const n = Math.round(Number(value) || 0)
  const abs = `$ ${cop.format(Math.abs(n))}`
  if (n < 0) return `-${abs}`
  if (sign && n > 0) return `+${abs}`
  return abs
}

/** Versión compacta para tarjetas pequeñas: $1,2M / $850K */
export function moneyShort(value) {
  if (activeCurrencyShortFormatter) {
    return activeCurrencyShortFormatter(value)
  }
  const n = Math.abs(Math.round(Number(value) || 0))
  const s = n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')}M`
    : n >= 1_000 ? `${Math.round(n / 1_000)}K` : String(n)
  return `${value < 0 ? '-' : ''}$${s}`
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export const monthLabel = isoDate => {
  const [y, m] = isoDate.split('-').map(Number)
  return `${MESES[m - 1]} ${y}`
}
export const currentMonthLabel = () => {
  const d = new Date()
  return `${MESES[d.getMonth()]} de ${d.getFullYear()}`
}
export const today = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
/** 2026-09-07 -> 26/09/07 (formato del prototipo) */
export const shortDate = iso => iso ? `${iso.slice(2, 4)}/${iso.slice(5, 7)}/${iso.slice(8, 10)}` : ''

export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || 'U'

export const firstName = (name = '') => name.trim().split(/\s+/)[0] || name

export const CATEGORIAS = [
  { id: 'vivienda', label: 'Vivienda', icon: 'home' },
  { id: 'servicios', label: 'Servicios', icon: 'bolt' },
  { id: 'alimentacion', label: 'Alimentación', icon: 'cart' },
  { id: 'transporte', label: 'Transporte', icon: 'car' },
  { id: 'alojamiento', label: 'Alojamiento', icon: 'bed' },
  { id: 'oficina', label: 'Oficina', icon: 'briefcase' },
  { id: 'entretenimiento', label: 'Entretenimiento', icon: 'ticket' },
  { id: 'otro', label: 'Otro', icon: 'tag' },
]
export const categoria = id => CATEGORIAS.find(c => c.id === id) || CATEGORIAS.at(-1)

export const GROUP_ICONS = [
  { id: 'building', label: 'Hogar' },
  { id: 'plane', label: 'Viaje' },
  { id: 'safe', label: 'Trabajo' },
  { id: 'users', label: 'Amigos' },
  { id: 'heart', label: 'Pareja' },
  { id: 'cart', label: 'Compras' },
]

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#059669', '#dc2626', '#d97706', '#0891b2', '#db2777']
export const avatarColor = (id = '') => {
  let h = 0
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
