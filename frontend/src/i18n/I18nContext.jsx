import { createContext, useContext, useEffect, useState } from 'react'
import { translations } from './translations'
import { money, moneyShort } from '../utils/format'

const I18nContext = createContext(null)
const STORAGE_KEY = 'ft_language'

export const SUPPORTED_LANGUAGES = [
  { id: 'auto', labelKey: 'auto_lang', flag: '🌐', short: 'AUTO' },
  { id: 'es', labelKey: 'spanish', flag: '🇪🇸', short: 'ES', name: 'Español' },
  { id: 'en', labelKey: 'english', flag: '🇬🇧', short: 'EN', name: 'English' },
  { id: 'pt', labelKey: 'portuguese', flag: '🇧🇷', short: 'PT', name: 'Português' },
  { id: 'fr', labelKey: 'french', flag: '🇫🇷', short: 'FR', name: 'Français' },
  { id: 'de', labelKey: 'german', flag: '🇩🇪', short: 'DE', name: 'Deutsch' },
  { id: 'it', labelKey: 'italian', flag: '🇮🇹', short: 'IT', name: 'Italiano' },
]

function getDeviceLanguage() {
  if (typeof navigator === 'undefined') return 'es'
  const navLangs = navigator.languages || [navigator.language || '']
  for (const l of navLangs) {
    if (!l) continue
    const clean = l.toLowerCase()
    if (clean.startsWith('en')) return 'en'
    if (clean.startsWith('es')) return 'es'
    if (clean.startsWith('pt')) return 'pt'
    if (clean.startsWith('fr')) return 'fr'
    if (clean.startsWith('de')) return 'de'
    if (clean.startsWith('it')) return 'it'
  }
  return 'es'
}

export function I18nProvider({ children }) {
  const [deviceLang, setDeviceLang] = useState(getDeviceLanguage)
  const [selectedLang, setSelectedLang] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'auto'
    } catch {
      return 'auto'
    }
  })

  // Detectar cambios en tiempo real en la configuración del dispositivo
  useEffect(() => {
    const handleLangChange = () => {
      setDeviceLang(getDeviceLanguage())
    }
    window.addEventListener('languagechange', handleLangChange)
    return () => window.removeEventListener('languagechange', handleLangChange)
  }, [])

  const currentLang = selectedLang === 'auto' ? deviceLang : selectedLang

  const setLanguage = (lang) => {
    setSelectedLang(lang)
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {}
  }

  const t = (key, params = {}) => {
    const dict = translations[currentLang] || translations.es
    let text = dict[key] || translations.es[key] || key

    if (params && 'count' in params) {
      const count = Number(params.count) || 0
      text = text.replace(/\{(\w+),\s*plural,\s*one\s*\{([^}]+)\}\s*other\s*\{([^}]+)\}\}/g, (_m, _v, one, other) => {
        return count === 1 ? one : other
      })
    }

    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replaceAll(`{${k}}`, v !== undefined && v !== null ? String(v) : '')
      }
    }

    return text
  }

  const formatMonth = (isoDate) => {
    if (!isoDate) return ''
    const [y, m] = isoDate.split('-').map(Number)
    const monthKey = `month_${m}`
    const monthName = t(monthKey)
    return `${monthName} ${y}`
  }

  const formatCurrentMonth = () => {
    const d = new Date()
    const monthKey = `month_${d.getMonth() + 1}`
    const monthName = t(monthKey)
    return currentLang === 'es' ? `${monthName} de ${d.getFullYear()}` : `${monthName} ${d.getFullYear()}`
  }

  const getCategoryLabel = (id) => t(`cat_${id}`) || id
  const getGroupIconLabel = (id) => t(`group_type_${id}`) || id

  const value = {
    lang: currentLang,
    selectedLang,
    isAuto: selectedLang === 'auto',
    deviceLang,
    setLanguage,
    t,
    formatMoney: (amount, opts) => money(amount, opts),
    formatMoneyShort: (amount) => moneyShort(amount),
    formatMonth,
    formatCurrentMonth,
    getCategoryLabel,
    getGroupIconLabel,
    supportedLanguages: SUPPORTED_LANGUAGES,
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n debe usarse dentro de un I18nProvider')
  return ctx
}
