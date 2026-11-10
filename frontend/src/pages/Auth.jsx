import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { authApi } from '../services/authApi'
import { Alert } from '../components/ui'
import Icon from '../components/Icon'
import BrandMark from '../components/BrandMark'
import ThemeSwitch from '../components/ThemeSwitch'
import LanguageSwitch from '../components/LanguageSwitch'
import { useI18n } from '../i18n/I18nContext'

function AuthShell({ title, subtitle, children, footer }) {
  const { t } = useI18n()
  return (
    <main className="auth">
      <section className="auth-hero" aria-hidden="true">
        <div className="brand brand-lg"><BrandMark /><span className="brand-name">FT.<b> GROUP</b></span></div>
        <h2>{t('hero_title')}</h2>
        <p>{t('hero_desc')}</p>
        <ul>
          <li><Icon name="layers" /> {t('hero_feature_1')}</li>
          <li><Icon name="wallet" /> {t('hero_feature_2')}</li>
          <li><Icon name="scan" /> {t('hero_feature_3')}</li>
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
  const { t } = useI18n()
  return (
    <div className="input-group">
      <input id={name} name={name} type={show ? 'text' : 'password'} value={value} onChange={onChange}
        autoComplete={autoComplete} minLength={minLength} maxLength={72} required />
      <button type="button" className="input-addon" onClick={() => setShow(s => !s)}>{show ? t('password_hide') : t('password_show')}</button>
    </div>
  )
}

export function Login({ onLogin }) {
  const { t } = useI18n()
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
    <AuthShell title={t('login_title')} subtitle={t('login_subtitle')}
      footer={<>{t('login_no_account')} <Link className="link" to="/registro">{t('login_register_link')}</Link></>}>
      {location.state?.registered && <Alert type="success">{t('login_account_created')}</Alert>}
      <Alert>{error}</Alert>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">{t('field_email')}</label>
          <input id="email" name="email" type="email" value={form.email} onChange={change} autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">{t('field_password')}</label>
          <PasswordField value={form.password} onChange={change} autoComplete="current-password" />
        </div>
        <button className="btn btn-primary btn-block" disabled={sending}>{sending ? t('login_submitting') : t('login_submit')}</button>
      </form>
    </AuthShell>
  )
}

export function Register() {
  const { t } = useI18n()
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const navigate = useNavigate()
  const change = e => setForm({ ...form, [e.target.name]: e.target.value })

  const submit = async e => {
    e.preventDefault(); setError('')
    if (form.password !== form.confirm) return setError(t('err_passwords_dont_match'))
    setSending(true)
    try {
      await authApi.register(form)
      navigate('/login', { state: { registered: true } })
    } catch (err) { setError(err.message) } finally { setSending(false) }
  }

  return (
    <AuthShell title={t('register_title')} subtitle={t('register_subtitle')}
      footer={<>{t('register_have_account')} <Link className="link" to="/login">{t('register_login_link')}</Link></>}>
      <Alert>{error}</Alert>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="nombre">{t('field_fullname')}</label>
          <input id="nombre" name="nombre" value={form.nombre} onChange={change} minLength={2} maxLength={120} autoComplete="name" required />
        </div>
        <div className="field">
          <label htmlFor="email">{t('field_email')}</label>
          <input id="email" name="email" type="email" value={form.email} onChange={change} maxLength={150} autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="telefono">{t('field_phone')} <span className="muted">{t('field_optional')}</span></label>
          <input id="telefono" name="telefono" type="tel" value={form.telefono} onChange={change} maxLength={20} autoComplete="tel" />
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="password">{t('field_password')}</label>
            <PasswordField value={form.password} onChange={change} autoComplete="new-password" minLength={8} />
          </div>
          <div className="field">
            <label htmlFor="confirm">{t('field_confirm_password')}</label>
            <PasswordField name="confirm" value={form.confirm} onChange={change} autoComplete="new-password" minLength={8} />
          </div>
        </div>
        <small className="hint">{t('field_password_hint')}</small>
        <button className="btn btn-primary btn-block" disabled={sending}>{sending ? t('register_submitting') : t('register_submit')}</button>
      </form>
    </AuthShell>
  )
}
