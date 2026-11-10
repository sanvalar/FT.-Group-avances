import { useState, useRef, useEffect } from 'react'
import { useCurrency } from '../currency/CurrencyContext'
import { useI18n } from '../i18n/I18nContext'
import Icon from './Icon'

export default function CurrencySwitch({ compact = false }) {
  const { currency, currentCurrency, allCurrencies, setCurrency, currentRateDisplay, isSyncing, syncRates } = useCurrency()
  const { t } = useI18n()
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

  return (
    <div className={`currency-switch-container${compact ? ' compact' : ''}`} ref={ref}>
      <button
        type="button"
        className="currency-switch-btn"
        onClick={() => setOpen(!open)}
        aria-label={t('currency')}
        title={`${t('currency')}: ${currentCurrency.name} (${currency})`}
      >
        <span className="currency-flag">{currentCurrency.flag}</span>
        <span className="currency-code">{currency}</span>
        <span className="currency-symbol">{currentCurrency.symbol}</span>
        <Icon name="arrow" size={12} className={`currency-arrow${open ? ' rotated' : ''}`} />
      </button>

      {open && (
        <div className="currency-dropdown">
          <div className="currency-dropdown-header">
            <div>
              <small>{t('currency')}</small>
              {currentRateDisplay && <span className="rate-badge">{currentRateDisplay}</span>}
            </div>
            <button
              type="button"
              className="sync-btn"
              onClick={(e) => {
                e.stopPropagation()
                syncRates()
              }}
              title={t('syncing_rates')}
            >
              <Icon name="refresh" size={14} className={isSyncing ? 'spinning' : ''} />
            </button>
          </div>

          <div className="currency-list">
            {allCurrencies.map((c) => {
              const active = currency === c.code
              return (
                <button
                  type="button"
                  key={c.code}
                  className={`currency-option${active ? ' active' : ''}`}
                  onClick={() => {
                    setCurrency(c.code)
                    setOpen(false)
                  }}
                >
                  <span className="currency-option-main">
                    <span className="currency-option-flag">{c.flag}</span>
                    <strong className="currency-option-code">{c.code}</strong>
                    <span className="currency-option-name">{c.name}</span>
                  </span>
                  <span className="currency-option-symbol">{c.symbol}</span>
                  {active && <Icon name="check" size={14} className="pos" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
