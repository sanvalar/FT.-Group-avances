import { createContext, useContext, useEffect, useState, useMemo } from 'react'
import { setCurrencyFormatter } from '../utils/format'

const CurrencyContext = createContext(null)
const CURRENCY_KEY = 'ft_currency'
const RATES_CACHE_KEY = 'ft_exchange_rates'

export const CURRENCIES = {
  COP: { code: 'COP', name: 'Peso colombiano', symbol: '$', flag: '🇨🇴', decimals: 0, locale: 'es-CO' },
  USD: { code: 'USD', name: 'Dólar estadounidense', symbol: '$', flag: '🇺🇸', decimals: 2, locale: 'en-US' },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺', decimals: 2, locale: 'de-DE' },
  MXN: { code: 'MXN', name: 'Peso mexicano', symbol: '$', flag: '🇲🇽', decimals: 2, locale: 'es-MX' },
  BRL: { code: 'BRL', name: 'Real brasileño', symbol: 'R$', flag: '🇧🇷', decimals: 2, locale: 'pt-BR' },
  GBP: { code: 'GBP', name: 'Libra esterlina', symbol: '£', flag: '🇬🇧', decimals: 2, locale: 'en-GB' },
  CAD: { code: 'CAD', name: 'Dólar canadiense', symbol: 'CA$', flag: '🇨🇦', decimals: 2, locale: 'en-CA' },
  CLP: { code: 'CLP', name: 'Peso chileno', symbol: '$', flag: '🇨🇱', decimals: 0, locale: 'es-CL' },
  PEN: { code: 'PEN', name: 'Sol peruano', symbol: 'S/', flag: '🇵🇪', decimals: 2, locale: 'es-PE' },
  ARS: { code: 'ARS', name: 'Peso argentino', symbol: '$', flag: '🇦🇷', decimals: 2, locale: 'es-AR' },
  JPY: { code: 'JPY', name: 'Yen japonés', symbol: '¥', flag: '🇯🇵', decimals: 0, locale: 'ja-JP' },
}

export const SUPPORTED_CURRENCIES = Object.values(CURRENCIES)

// Tasas de cambio base (1 COP = x moneda) de respaldo por si no hay conexión
const FALLBACK_RATES_FROM_COP = {
  COP: 1,
  USD: 1 / 4250,
  EUR: 1 / 4600,
  MXN: 1 / 220,
  BRL: 1 / 760,
  GBP: 1 / 5400,
  CAD: 1 / 3100,
  CLP: 1 / 4.5,
  PEN: 1 / 1140,
  ARS: 1 / 4.2,
  JPY: 1 / 28.5,
}

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState(() => {
    try {
      return localStorage.getItem(CURRENCY_KEY) || 'COP'
    } catch {
      return 'COP'
    }
  })

  const [rates, setRates] = useState(() => {
    try {
      const cached = localStorage.getItem(RATES_CACHE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (Date.now() - parsed.timestamp < 3600000 && parsed.rates) {
          return parsed.rates
        }
      }
    } catch {}
    return FALLBACK_RATES_FROM_COP
  })

  const [lastSync, setLastSync] = useState(() => new Date())
  const [isSyncing, setIsSyncing] = useState(false)

  // Obtener tasas de cambio en tiempo real sincronizadas
  const syncRates = async () => {
    setIsSyncing(true)
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/COP')
      if (res.ok) {
        const data = await res.json()
        if (data.rates) {
          const newRates = { ...FALLBACK_RATES_FROM_COP, ...data.rates }
          setRates(newRates)
          setLastSync(new Date())
          try {
            localStorage.setItem(RATES_CACHE_KEY, JSON.stringify({ rates: newRates, timestamp: Date.now() }))
          } catch {}
        }
      }
    } catch (e) {
      console.warn('Usando tasas de cambio de respaldo:', e)
    } finally {
      setIsSyncing(false)
    }
  }

  useEffect(() => {
    syncRates()
    const interval = setInterval(syncRates, 600000) // cada 10 min
    return () => clearInterval(interval)
  }, [])

  const setCurrency = (code) => {
    if (CURRENCIES[code]) {
      setCurrencyState(code)
      try {
        localStorage.setItem(CURRENCY_KEY, code)
      } catch {}
    }
  }

  // Convertir monto base COP a la moneda seleccionada
  const convertFromCOP = (amountCOP, targetCode = currency) => {
    const n = Number(amountCOP) || 0
    if (targetCode === 'COP') return n
    const rate = rates[targetCode] || FALLBACK_RATES_FROM_COP[targetCode] || 1
    return n * rate
  }

  // Convertir monto de una moneda a COP
  const convertToCOP = (amount, fromCode = currency) => {
    const n = Number(amount) || 0
    if (fromCode === 'COP') return n
    const rate = rates[fromCode] || FALLBACK_RATES_FROM_COP[fromCode] || 1
    return n / rate
  }

  // Formateador dinámico en tiempo real
  const formatMoney = (amountCOP, { sign = false, showCode = false } = {}) => {
    const curr = CURRENCIES[currency] || CURRENCIES.COP
    const converted = convertFromCOP(amountCOP, currency)
    const isNegative = converted < 0
    const abs = Math.abs(converted)

    const formatter = new Intl.NumberFormat(curr.locale, {
      minimumFractionDigits: curr.decimals,
      maximumFractionDigits: curr.decimals,
    })

    const formattedNumber = formatter.format(abs)
    let res = `${curr.symbol} ${formattedNumber}`
    if (showCode) res += ` ${curr.code}`

    if (isNegative) return `-${res}`
    if (sign && converted > 0) return `+${res}`
    return res
  }

  const formatMoneyShort = (amountCOP) => {
    const curr = CURRENCIES[currency] || CURRENCIES.COP
    const converted = convertFromCOP(amountCOP, currency)
    const isNegative = converted < 0
    const abs = Math.abs(converted)

    let s
    if (abs >= 1_000_000) {
      s = `${(abs / 1_000_000).toFixed(1).replace('.0', '')}M`
    } else if (abs >= 1_000) {
      s = `${(abs / 1_000).toFixed(1).replace('.0', '')}K`
    } else {
      s = curr.decimals > 0 ? abs.toFixed(curr.decimals) : String(Math.round(abs))
    }

    return `${isNegative ? '-' : ''}${curr.symbol}${s}`
  }

  const currentRateDisplay = useMemo(() => {
    if (currency === 'COP') return null
    const rateInCOP = 1 / (rates[currency] || FALLBACK_RATES_FROM_COP[currency] || 1)
    const formatted = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.round(rateInCOP))
    return `1 ${currency} ≈ $ ${formatted} COP`
  }, [currency, rates])

  useEffect(() => {
    setCurrencyFormatter(formatMoney, formatMoneyShort)
  }, [currency, rates])

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        currentCurrency: CURRENCIES[currency] || CURRENCIES.COP,
        allCurrencies: Object.values(CURRENCIES),
        setCurrency,
        rates,
        syncRates,
        refreshRates: syncRates,
        isSyncing,
        loading: isSyncing,
        lastSync,
        lastUpdated: lastSync,
        currentRateDisplay,
        currentRate: rates[currency] || 1,
        convertFromCOP,
        convertToCOP,
        formatMoney,
        formatMoneyShort,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error('useCurrency debe usarse dentro de CurrencyProvider')
  return ctx
}
