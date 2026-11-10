import { useState } from 'react'
import { authApi } from '../services/authApi'
import { financeApi, usesLocalFinance } from '../services/financeApi'
import { Alert, Avatar, PageHeader } from '../components/ui'
import Icon from '../components/Icon'
import { useI18n } from '../i18n/I18nContext'
import LanguageSwitch from '../components/LanguageSwitch'
import { useTheme } from '../theme/ThemeContext'
import { useCurrency, SUPPORTED_CURRENCIES } from '../currency/CurrencyContext'

export default function Profile({ user, setUser, onLogout }) {
  const [form, setForm] = useState({ nombre: user.nombre || '', telefono: user.telefono || '' })
  const [msg, setMsg] = useState({ type: 'success', text: '' })
  const [saving, setSaving] = useState(false)
  const { t, lang, deviceLang } = useI18n()
  const { isVivid, toggleTheme } = useTheme()
  const { currency, setCurrency, loading: loadingRates, lastUpdated, refreshRates, currentRate } = useCurrency()

  const change = e => setForm({ ...form, [e.target.name]: e.target.value })

  const save = async e => {
    e.preventDefault(); setSaving(true); setMsg({ text: '' })
    try {
      const u = await authApi.updateProfile({ nombre: form.nombre.trim(), telefono: form.telefono.trim() || null })
      setUser(u); setMsg({ type: 'success', text: t('profile_updated') })
    } catch (err) { setMsg({ type: 'error', text: err.message }) } finally { setSaving(false) }
  }

  const deactivate = async () => {
    if (!window.confirm(t('deactivate_confirm'))) return
    try { await authApi.deactivate(); await onLogout() } catch (err) { setMsg({ type: 'error', text: err.message }) }
  }

  const resetData = async empty => {
    const txt = empty ? t('demo_empty_confirm') : t('demo_restore_confirm')
    if (!window.confirm(txt)) return
    await financeApi.resetDemo(user, { empty })
    setMsg({ type: 'success', text: empty ? t('demo_cleared_msg') : t('demo_restored_msg') })
  }

  const dateLocale = {
    es: 'es-CO',
    en: 'en-US',
    pt: 'pt-BR',
    fr: 'fr-FR',
    de: 'de-DE',
    it: 'it-IT',
  }[lang] || 'es-CO'
  const registrado = user.fechaRegistro
    ? new Date(user.fechaRegistro).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  const copPerUnit = currentRate > 0 && currency !== 'COP' ? Math.round(1 / currentRate) : 1

  return (
    <>
      <PageHeader title={t('profile_title')} subtitle={t('profile_subtitle')} />
      <Alert type={msg.type}>{msg.text}</Alert>
      <div className="profile-grid">
        <section className="card">
          <div className="profile-head">
            <Avatar user={user} size={56} />
            <div>
              <strong className="profile-name">{user.nombre}</strong>
              <small className="muted">{user.email}</small>
            </div>
          </div>
          <form className="form" onSubmit={save}>
            <div className="field">
              <label htmlFor="p-nombre">{t('field_fullname')}</label>
              <input id="p-nombre" name="nombre" value={form.nombre} onChange={change} minLength={2} maxLength={120} required />
            </div>
            <div className="field">
              <label htmlFor="p-email">{t('field_email')}</label>
              <input id="p-email" value={user.email} disabled />
            </div>
            <div className="field">
              <label htmlFor="p-tel">{t('field_phone')}</label>
              <input id="p-tel" name="telefono" type="tel" value={form.telefono} onChange={change} maxLength={20} />
            </div>
            <button className="btn btn-primary" disabled={saving}>{saving ? t('saving') : t('save_changes')}</button>
          </form>
        </section>

        <div className="stack">
          {/* Theme Settings */}
          <section className="card">
            <h2 className="card-title">{t('theme')}</h2>
            <p className="muted small" style={{ marginBottom: '14px' }}>
              {t('theme_description')}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                type="button"
                className={`theme-pick-card ${!isVivid ? 'active' : ''}`}
                onClick={() => isVivid && toggleTheme()}
              >
                <span>🌙 {t('theme_dark')}</span>
              </button>
              <button
                type="button"
                className={`theme-pick-card ${isVivid ? 'active' : ''}`}
                onClick={() => !isVivid && toggleTheme()}
              >
                <span>☀️ {t('theme_vivid')}</span>
              </button>
            </div>
          </section>

          {/* Currency Settings */}
          <section className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <h2 className="card-title">{t('currency')}</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={refreshRates}
                disabled={loadingRates}
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                <Icon name="refresh" size={13} className={loadingRates ? 'spin' : ''} />
                <span>{loadingRates ? t('syncing_rates') : t('refresh_rates')}</span>
              </button>
            </div>
            <p className="muted small" style={{ marginBottom: '14px' }}>
              {t('currency_hint')}
            </p>
            <div className="field">
              <select
                id="p-currency"
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
              >
                {SUPPORTED_CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code} — {c.name} ({c.symbol})
                  </option>
                ))}
              </select>
            </div>
            {currency !== 'COP' && (
              <div className="rate-info-box" style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '10px', background: 'var(--surface-2)', border: '1px solid var(--line-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="small muted">{t('live_rate')}:</span>
                  <span className="badge-ia" style={{ fontSize: '11px' }}>{t('live_rate')}</span>
                </div>
                <div style={{ fontSize: '15px', fontWeight: '700', marginTop: '4px', color: 'var(--accent-hi)' }}>
                  1 {currency} ≈ ${copPerUnit.toLocaleString()} COP
                </div>
                {lastUpdated && (
                  <div className="small muted" style={{ marginTop: '4px', fontSize: '11px' }}>
                    {t('last_sync')}: {new Date(lastUpdated).toLocaleTimeString(dateLocale)}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Language Settings */}
          <section className="card">
            <h2 className="card-title">{t('language')}</h2>
            <p className="muted small" style={{ marginBottom: '14px' }}>
              {t('language_hint')}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <LanguageSwitch />
            </div>
            <div className="small muted" style={{ marginTop: '10px' }}>
              {t('device_language')}: <strong style={{ textTransform: 'uppercase', color: 'var(--text)' }}>{deviceLang}</strong>
            </div>
          </section>

          {/* Account Section */}
          <section className="card">
            <h2 className="card-title">{t('account_section')}</h2>
            <dl className="dl">
              <dt>{t('account_status')}</dt><dd><span className={`pill ${user.estado === 'activo' ? 'pill-ok' : ''}`}>{user.estado === 'activo' ? t('active') : t('inactive')}</span></dd>
              <dt>{t('account_role')}</dt><dd>{user.rol || t('user_role')}</dd>
              {registrado && <><dt>{t('account_member_since')}</dt><dd>{registrado}</dd></>}
            </dl>
            <div className="btn-row">
              <button className="btn btn-ghost" onClick={onLogout}><Icon name="logout" size={16} />{t('nav_logout')}</button>
              <button className="btn btn-danger-ghost" onClick={deactivate}>{t('deactivate_account')}</button>
            </div>
          </section>

          {usesLocalFinance(user) && (
            <section className="card">
              <h2 className="card-title">{t('demo_section_title')}</h2>
              <p className="muted small">{t('demo_section_desc')}</p>
              <div className="btn-row">
                <button className="btn btn-ghost btn-sm" onClick={() => resetData(false)}>{t('demo_reset_btn')}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => resetData(true)}>{t('demo_empty_btn')}</button>
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  )
}
