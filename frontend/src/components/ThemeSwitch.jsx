import { useTheme } from '../theme/ThemeContext'
import { useI18n } from '../i18n/I18nContext'
import Icon from './Icon'

export default function ThemeSwitch({ compact = false }) {
  const { theme, isVivid, toggleTheme } = useTheme()
  const { t } = useI18n()

  return (
    <button
      type="button"
      className={`theme-switch-btn${compact ? ' compact' : ''}`}
      onClick={toggleTheme}
      aria-label={t('theme_toggle')}
      title={isVivid ? t('theme_dark') : t('theme_vivid')}
    >
      <span className="theme-switch-icon">
        <Icon name={isVivid ? 'sun' : 'moon'} size={16} />
      </span>
      {!compact && (
        <span className="theme-switch-label">
          {isVivid ? t('theme_vivid') : t('theme_dark')}
        </span>
      )}
    </button>
  )
}
