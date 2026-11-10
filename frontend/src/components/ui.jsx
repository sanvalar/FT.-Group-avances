import { useEffect } from 'react'
import Icon from './Icon'
import { avatarColor, initials } from '../utils/format'

export function Avatar({ user, size = 32, ring = false }) {
  return (
    <span className={`avatar${ring ? ' avatar-ring' : ''}`} title={user?.nombre}
      style={{ width: size, height: size, fontSize: size * 0.38, background: avatarColor(user?.id) }}>
      {initials(user?.nombre)}
    </span>
  )
}

export function AvatarStack({ users = [], max = 5 }) {
  const rest = users.length - max
  return (
    <div className="avatar-stack">
      {users.slice(0, max).map(u => <Avatar key={u.id} user={u} size={30} ring />)}
      {rest > 0 && <span className="avatar avatar-ring avatar-more" style={{ width: 30, height: 30 }}>+{rest}</span>}
    </div>
  )
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <header className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

export function Chips({ options, value, onChange, label }) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id}
          className={`chip${value === o.id ? ' chip-active' : ''}`} onClick={() => onChange(o.id)}>
          {o.icon && <Icon name={o.icon} size={15} />}{o.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.classList.add('no-scroll')
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('no-scroll') }
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Empty({ icon = 'layers', title, text, action }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon} size={26} /></span>
      <strong>{title}</strong>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}

export function Loader({ label = 'Cargando…' }) {
  return <div className="loader"><span className="spinner" />{label}</div>
}

export function Alert({ type = 'error', children }) {
  if (!children) return null
  return <div className={`alert alert-${type}`} role={type === 'error' ? 'alert' : 'status'}>{children}</div>
}
