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
      setUser(u); setMsg({ type: 'success', text: 'Perfil actualizado correctamente.' })
    } catch (err) { setMsg({ type: 'error', text: err.message }) } finally { setSaving(false) }
  }

  const deactivate = async () => {
    if (!window.confirm('¿Seguro que deseas desactivar tu cuenta? Se cerrarán todas tus sesiones y no podrás iniciar sesión hasta reactivarla.')) return
    try { await authApi.deactivate(); await onLogout() } catch (err) { setMsg({ type: 'error', text: err.message }) }
  }

  const resetData = async empty => {
    const txt = empty ? '¿Borrar todos los grupos y gastos guardados en este navegador?' : '¿Restaurar los datos de demostración?'
    if (!window.confirm(txt)) return
    await financeApi.resetDemo(user, { empty })
    setMsg({ type: 'success', text: empty ? 'Datos borrados. Empiezas desde cero.' : 'Datos de demostración restaurados.' })
  }

  const dateLocale = lang === 'en' ? 'en-US' : (lang === 'pt' ? 'pt-BR' : 'es-CO')
  const registrado = user.fechaRegistro
    ? new Date(user.fechaRegistro).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  const copPerUnit = currentRate > 0 && currency !== 'COP' ? Math.round(1 / currentRate) : 1

  return (
    <>
      <PageHeader title="Mi perfil" subtitle="Consulta y actualiza tus datos personales." />
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
              <label htmlFor="p-nombre">Nombre</label>
              <input id="p-nombre" name="nombre" value={form.nombre} onChange={change} minLength={2} maxLength={120} required />
            </div>
            <div className="field">
              <label htmlFor="p-email">Correo</label>
              <input id="p-email" value={user.email} disabled />
            </div>
            <div className="field">
              <label htmlFor="p-tel">Teléfono</label>
              <input id="p-tel" name="telefono" type="tel" value={form.telefono} onChange={change} maxLength={20} />
            </div>
            <button className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
          </form>
        </section>

        <div className="stack">
          {/* Theme Settings */}
          <section className="card">
            <h2 className="card-title">Apariencia y tema</h2>
            <p className="muted small" style={{ marginBottom: '14px' }}>
              Elige entre Modo Oscuro y Modo Vivo con alto contraste o sincronización automática con el sistema.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                type="button"
                className={`theme-pick-card ${!isVivid ? 'active' : ''}`}
                onClick={() => isVivid && toggleTheme()}
              >
                <span>🌙 Modo Oscuro</span>
              </button>
              <button
                type="button"
                className={`theme-pick-card ${isVivid ? 'active' : ''}`}
                onClick={() => !isVivid && toggleTheme()}
              >
                <span>☀️ Modo Vivo</span>
              </button>
            </div>
          </section>

          {/* Currency Settings */}
          <section className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <h2 className="card-title">Divisa y conversión en tiempo real</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={refreshRates}
                disabled={loadingRates}
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                <Icon name="refresh" size={13} className={loadingRates ? 'spin' : ''} />
                <span>{loadingRates ? 'Sincronizando...' : 'Actualizar tasas'}</span>
              </button>
            </div>
            <p className="muted small" style={{ marginBottom: '14px' }}>
              Selecciona tu moneda de preferencia; todos los saldos y gastos se recalculan automáticamente.
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
                  <span className="small muted">Tasa de cambio sincronizada:</span>
                  <span className="badge-ia" style={{ fontSize: '11px' }}>En vivo</span>
                </div>
                <div style={{ fontSize: '15px', fontWeight: '700', marginTop: '4px', color: 'var(--accent-hi)' }}>
                  1 {currency} ≈ ${copPerUnit.toLocaleString()} COP
                </div>
                {lastUpdated && (
                  <div className="small muted" style={{ marginTop: '4px', fontSize: '11px' }}>
                    Última sincronización: {new Date(lastUpdated).toLocaleTimeString()}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Language Settings */}
          <section className="card">
            <h2 className="card-title">Idioma</h2>
            <p className="muted small" style={{ marginBottom: '14px' }}>
              Detectado automáticamente según el sistema del dispositivo.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <LanguageSwitch />
            </div>
            <div className="small muted" style={{ marginTop: '10px' }}>
              Idioma detectado del dispositivo: <strong style={{ textTransform: 'uppercase', color: 'var(--text)' }}>{deviceLang}</strong>
            </div>
          </section>

          {/* Account Section */}
          <section className="card">
            <h2 className="card-title">Cuenta</h2>
            <dl className="dl">
              <dt>Estado</dt><dd><span className={`pill ${user.estado === 'activo' ? 'pill-ok' : ''}`}>{user.estado}</span></dd>
              <dt>Rol</dt><dd>{user.rol || 'usuario'}</dd>
              {registrado && <><dt>Miembro desde</dt><dd>{registrado}</dd></>}
            </dl>
            <div className="btn-row">
              <button className="btn btn-ghost" onClick={onLogout}><Icon name="logout" size={16} />Cerrar sesión</button>
              <button className="btn btn-danger-ghost" onClick={deactivate}>Desactivar cuenta</button>
            </div>
          </section>

          {usesLocalFinance(user) && (
            <section className="card">
              <h2 className="card-title">Datos de grupos y gastos</h2>
              <p className="muted small">Los datos de ejemplo se guardan solo en este navegador y no modifican el backend.</p>
              <div className="btn-row">
                <button className="btn btn-ghost btn-sm" onClick={() => resetData(false)}>Restaurar demostración</button>
                <button className="btn btn-ghost btn-sm" onClick={() => resetData(true)}>Empezar vacío</button>
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  )
}
