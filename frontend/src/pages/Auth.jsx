import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { authApi } from '../services/authApi'
import { Alert } from '../components/ui'
import Icon from '../components/Icon'
import BrandMark from '../components/BrandMark'
import ThemeSwitch from '../components/ThemeSwitch'
import LanguageSwitch from '../components/LanguageSwitch'

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <main className="auth">
      <section className="auth-hero" aria-hidden="true">
        <div className="brand brand-lg"><BrandMark /><span className="brand-name">FT.<b> GROUP</b></span></div>
        <h2>Divide gastos sin enredos.</h2>
        <p>Registra lo que paga cada quien, deja que el sistema calcule los balances y salda cuentas con el menor número de pagos.</p>
        <ul>
          <li><Icon name="layers" /> Grupos para el apartamento, viajes o el equipo</li>
          <li><Icon name="wallet" /> Balances y liquidaciones automáticas</li>
          <li><Icon name="scan" /> Escaneo de recibos con IA</li>
        </ul>
      </section>
      <section className="auth-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div className="brand auth-brand-mobile"><BrandMark /><span className="brand-name">FT.<b> GROUP</b></span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ThemeSwitch compact />
            <LanguageSwitch compact />
          </div>
        </div>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
        {children}
        <div className="auth-footer">{footer}</div>
      </section>
    </main>
  )
}

function PasswordField({ value, onChange, name = 'password', autoComplete, minLength }) {
  const [show, setShow] = useState(false)
  return (
    <div className="input-group">
      <input id={name} name={name} type={show ? 'text' : 'password'} value={value} onChange={onChange}
        autoComplete={autoComplete} minLength={minLength} maxLength={72} required />
      <button type="button" className="input-addon" onClick={() => setShow(s => !s)}>{show ? 'Ocultar' : 'Ver'}</button>
    </div>
  )
}

export function Login({ onLogin }) {
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const change = e => setForm({ ...form, [e.target.name]: e.target.value })

  const submit = async e => {
    e.preventDefault(); setError(''); setSending(true)
    try {
      authApi.logout().catch(() => {})
      const user = await authApi.login(form.email.trim(), form.password)
      onLogin(user)
      const home = ['moderador', 'supervisor'].includes(user.rol) ? '/administracion' : '/panel'
      navigate(location.state?.from || home, { replace: true })
    } catch (err) { setError(err.message) } finally { setSending(false) }
  }

  return (
    <AuthShell title="Bienvenido" subtitle="Inicia sesión para administrar tus gastos compartidos."
      footer={<>¿No tienes cuenta? <Link className="link" to="/registro">Crear cuenta</Link></>}>
      {location.state?.registered && <Alert type="success">Cuenta creada. Ya puedes iniciar sesión.</Alert>}
      <Alert>{error}</Alert>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">Correo electrónico</label>
          <input id="email" name="email" type="email" value={form.email} onChange={change} autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <PasswordField value={form.password} onChange={change} autoComplete="current-password" />
        </div>
        <button className="btn btn-primary btn-block" disabled={sending}>{sending ? 'Ingresando…' : 'Iniciar sesión'}</button>
      </form>
    </AuthShell>
  )
}

export function Register() {
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const navigate = useNavigate()
  const change = e => setForm({ ...form, [e.target.name]: e.target.value })

  const submit = async e => {
    e.preventDefault(); setError('')
    if (form.password !== form.confirm) return setError('Las contraseñas no coinciden.')
    setSending(true)
    try {
      await authApi.register(form)
      navigate('/login', { state: { registered: true } })
    } catch (err) { setError(err.message) } finally { setSending(false) }
  }

  return (
    <AuthShell title="Crear cuenta" subtitle="Regístrate para empezar a dividir gastos con tus grupos."
      footer={<>¿Ya tienes cuenta? <Link className="link" to="/login">Iniciar sesión</Link></>}>
      <Alert>{error}</Alert>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="nombre">Nombre completo</label>
          <input id="nombre" name="nombre" value={form.nombre} onChange={change} minLength={2} maxLength={120} autoComplete="name" required />
        </div>
        <div className="field">
          <label htmlFor="email">Correo electrónico</label>
          <input id="email" name="email" type="email" value={form.email} onChange={change} maxLength={150} autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="telefono">Teléfono <span className="muted">(opcional)</span></label>
          <input id="telefono" name="telefono" type="tel" value={form.telefono} onChange={change} maxLength={20} autoComplete="tel" />
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <PasswordField value={form.password} onChange={change} autoComplete="new-password" minLength={8} />
          </div>
          <div className="field">
            <label htmlFor="confirm">Confirmar</label>
            <PasswordField name="confirm" value={form.confirm} onChange={change} autoComplete="new-password" minLength={8} />
          </div>
        </div>
        <small className="hint">Mínimo 8 caracteres.</small>
        <button className="btn btn-primary btn-block" disabled={sending}>{sending ? 'Creando cuenta…' : 'Crear cuenta'}</button>
      </form>
    </AuthShell>
  )
}
