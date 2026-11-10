import { useState, useRef, useEffect } from 'react'
import { useI18n } from '../i18n/I18nContext'
import Icon from './Icon'

export default function LanguageSwitch({ compact = false }) {
  const { lang, selectedLang, isAuto, setLanguage, t, supportedLanguages } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const currentLangObj = supportedLanguages.find((l) => l.id === lang) || supportedLanguages[1]

  return (
    <div className={`lang-switch-container${compact ? ' compact' : ''}`} ref={ref}>
      <button
        type="button"
        className="lang-switch-btn"
        onClick={() => setOpen(!open)}
        aria-label={t('language')}
        title={`${t('language')}: ${currentLangObj.name || currentLangObj.short}`}
      >
        <Icon name="globe" size={14} />
        <span className="lang-code">{lang.toUpperCase()}</span>
        {isAuto && <span className="lang-auto-tag">AUTO</span>}
        <Icon name="arrow" size={12} className={`lang-arrow${open ? ' rotated' : ''}`} />
      </button>

      {open && (
        <div className="lang-dropdown">
          <div className="lang-dropdown-header">
            <small>{t('language')}</small>
          </div>
          {supportedLanguages.map((opt) => {
            const active = selectedLang === opt.id
            const label = opt.id === 'auto'
              ? `${t(opt.labelKey)} (${lang.toUpperCase()})`
              : `${opt.name}`
            return (
              <button
                type="button"
                key={opt.id}
                className={`lang-option${active ? ' active' : ''}`}
                onClick={() => {
                  setLanguage(opt.id)
                  setOpen(false)
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="lang-chip">{opt.short}</span>
                  <span>{label}</span>
                </div>
                {active && <Icon name="check" size={14} className="pos" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
