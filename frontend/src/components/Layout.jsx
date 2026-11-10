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
  { to: '/panel', label: 'Panel de control', short: 'Panel', icon: 'grid' },
  { to: '/grupos', label: 'Grupos financieros', short: 'Grupos', icon: 'layers' },
  { to: '/gastos', label: 'Registro de gastos', short: 'Gastos', icon: 'receipt' },
  { to: '/historial', label: 'Historial financiero', short: 'Historial', icon: 'chart' },
  { to: '/analisis', label: 'Análisis y predicciones', short: 'Análisis', icon: 'trend' },
  { to: '/educacion', label: 'Educación financiera', short: 'Aprender', icon: 'brain' },
  { to: '/escanear', label: 'Escanear', short: 'Escanear', icon: 'scan', badge: 'IA' },
  { to: '/soporte', label: 'Soporte', short: 'Soporte', icon: 'ticket' },
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
  const navigation = user?.rol === 'supervisor'
    ? [
        { to: '/supervision', label: 'Supervisión de usuarios', short: 'Supervisión', icon: 'users' },
        { to: '/administracion', label: 'Administración', short: 'Admin', icon: 'shield' },
        { to: '/auditoria', label: 'Auditoría', short: 'Auditoría', icon: 'file' },
        { to: '/estado-sistema', label: 'Estado del sistema', short: 'Estado', icon: 'shield' },
        { to: '/educacion', label: 'Control educativo', short: 'Educación', icon: 'brain' },
      ]
    : user?.rol === 'moderador'
      ? [
        { to: '/moderacion', label: 'Panel de moderación', short: 'Panel', icon: 'grid' },
        { to: '/administracion', label: 'Administración', short: 'Admin', icon: 'shield' },
        { to: '/soporte', label: 'Soporte', short: 'Soporte', icon: 'ticket' },
        { to: '/educacion', label: 'Moderación educativa', short: 'Educación', icon: 'brain' },
      ]
      : NAV_BASE

  useEffect(() => { setOpen(false); window.scrollTo(0, 0) }, [location.pathname])
  useEffect(() => {
    document.body.classList.toggle('no-scroll', open)
    return () => document.body.classList.remove('no-scroll')
  }, [open])

  return (
    <div className="shell">
      <aside className={`sidebar${open ? ' sidebar-open' : ''}`} aria-label="Navegación principal">
        <div className="sidebar-top">
          <Logo />
          <button className="icon-btn sidebar-close" onClick={() => setOpen(false)} aria-label="Cerrar menú"><Icon name="close" /></button>
        </div>
        <nav className="nav">
          {navigation.map(item => (
            <NavLink key={item.to} to={item.to} className="nav-link">
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
              {item.badge && <em className="badge-ia">{item.badge}</em>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink to="/perfil" className="user-card">
            <Avatar user={user} size={36} />
            <span>
              <strong>{firstName(user.nombre)}</strong>
              <small>{user.rol ? `${user.rol[0].toUpperCase() + user.rol.slice(1)} · Mi perfil` : 'Mi perfil'}</small>
            </span>
          </NavLink>
          <button className="nav-link nav-logout" onClick={onLogout}>
            <Icon name="logout" size={18} /><span>Cerrar sesión</span>
          </button>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Abrir menú"><Icon name="menu" size={22} /></button>
          <span className="topbar-brand"><Logo /></span>
          <span className="topbar-text">FT-GROUP · Sistema de gestión financiera colaborativa</span>
          {usesLocalFinance(user) && <span className="demo-mode-label">EXPOSICIÓN · DATOS DE EJEMPLO</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CurrencySwitch />
            <ThemeSwitch compact />
            <LanguageSwitch />
            <span className={`status${online ? '' : ' status-off'}`}><i />{online ? 'En línea' : 'Sin conexión'}</span>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>

      <nav className="tabbar" aria-label="Navegación rápida">
        {navigation.map(item => (
          <NavLink key={item.to} to={item.to} className="tab">
            <Icon name={item.icon} size={20} />
            <span>{item.short}</span>
          </NavLink>
        ))}
      </nav>
      <HelpAssistant />
    </div>
  )
}
