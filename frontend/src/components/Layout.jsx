import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import Icon from './Icon'
import { Avatar } from './ui'
import { firstName } from '../utils/format'
import BrandMark from './BrandMark'
import CurrencySwitch from './CurrencySwitch'
import ThemeSwitch from './ThemeSwitch'
import LanguageSwitch from './LanguageSwitch'
import HelpAssistant from './HelpAssistant'
import { usesLocalFinance } from '../services/financeApi'
import { useI18n } from '../i18n/I18nContext'

const NAV_BASE = [
  { to: '/panel', labelKey: 'nav_dashboard', shortKey: 'short_dashboard', icon: 'grid' },
  { to: '/grupos', labelKey: 'nav_groups', shortKey: 'short_groups', icon: 'layers' },
  { to: '/gastos', labelKey: 'nav_expenses', shortKey: 'short_expenses', icon: 'receipt' },
  { to: '/historial', labelKey: 'nav_history', shortKey: 'short_history', icon: 'chart' },
  { to: '/analisis', labelKey: 'nav_analysis', shortKey: 'short_analysis', icon: 'trend' },
  { to: '/educacion', labelKey: 'nav_education', shortKey: 'nav_learning', icon: 'brain' },
  { to: '/escanear', labelKey: 'nav_scan', shortKey: 'short_scan', icon: 'scan', badge: 'IA' },
  { to: '/soporte', labelKey: 'nav_support', shortKey: 'nav_support', icon: 'ticket' },
]

export const NAV = NAV_BASE

function Logo() {
  return (
    <div className="brand">
      <BrandMark />
      <span className="brand-name">FT.<b> GROUP</b></span>
    </div>
  )
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

export default function Layout({ user, onLogout, children }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const online = useOnline()
  const { t } = useI18n()
  const navigation = user?.rol === 'supervisor'
    ? [
        { to: '/supervision', labelKey: 'nav_supervision', shortKey: 'nav_supervision_short', icon: 'users' },
        { to: '/administracion', labelKey: 'nav_administration', shortKey: 'nav_admin_short', icon: 'shield' },
        { to: '/auditoria', labelKey: 'nav_audit', shortKey: 'nav_audit_short', icon: 'file' },
        { to: '/estado-sistema', labelKey: 'nav_system_status', shortKey: 'nav_status_short', icon: 'shield' },
        { to: '/educacion', labelKey: 'nav_education_control', shortKey: 'nav_education_short', icon: 'brain' },
      ]
    : user?.rol === 'moderador'
      ? [
        { to: '/moderacion', labelKey: 'nav_moderation', shortKey: 'short_dashboard', icon: 'grid' },
        { to: '/administracion', labelKey: 'nav_administration', shortKey: 'nav_admin_short', icon: 'shield' },
        { to: '/soporte', labelKey: 'nav_support', shortKey: 'nav_support', icon: 'ticket' },
        { to: '/educacion', labelKey: 'nav_education_moderation', shortKey: 'nav_education_short', icon: 'brain' },
      ]
      : NAV_BASE

  useEffect(() => { setOpen(false); window.scrollTo(0, 0) }, [location.pathname])
  useEffect(() => {
    document.body.classList.toggle('no-scroll', open)
    return () => document.body.classList.remove('no-scroll')
  }, [open])

  return (
    <div className="shell">
      <aside className={`sidebar${open ? ' sidebar-open' : ''}`} aria-label={t('nav_primary')}>
        <div className="sidebar-top">
          <Logo />
          <button className="icon-btn sidebar-close" onClick={() => setOpen(false)} aria-label={t('nav_close')}><Icon name="close" /></button>
        </div>
        <nav className="nav">
          {navigation.map(item => (
            <NavLink key={item.to} to={item.to} className="nav-link">
              <Icon name={item.icon} size={18} />
              <span>{t(item.labelKey)}</span>
              {item.badge && <em className="badge-ia">{item.badge}</em>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink to="/perfil" className="user-card">
            <Avatar user={user} size={36} />
            <span>
              <strong>{firstName(user.nombre)}</strong>
              <small>{user.rol ? t('role_admin_profile', { role: user.rol[0].toUpperCase() + user.rol.slice(1) }) : t('nav_profile')}</small>
            </span>
          </NavLink>
          <button className="nav-link nav-logout" onClick={onLogout}>
            <Icon name="logout" size={18} /><span>{t('nav_logout')}</span>
          </button>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label={t('nav_open')}><Icon name="menu" size={22} /></button>
          <span className="topbar-brand"><Logo /></span>
          <span className="topbar-text">{t('app_subtitle')}</span>
          {usesLocalFinance(user) && <span className="demo-mode-label">{t('demo_badge')}</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CurrencySwitch />
            <ThemeSwitch compact />
            <LanguageSwitch />
            <span className={`status${online ? '' : ' status-off'}`}><i />{online ? t('status_online') : t('status_offline')}</span>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>

      <nav className="tabbar" aria-label={t('nav_quick')}>
        {navigation.map(item => (
          <NavLink key={item.to} to={item.to} className="tab">
            <Icon name={item.icon} size={20} />
            <span>{t(item.shortKey)}</span>
          </NavLink>
        ))}
      </nav>
      <HelpAssistant />
    </div>
  )
}
