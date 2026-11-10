import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { financeApi, usesLocalFinance } from '../services/financeApi'
import { useData } from '../utils/useData'
import { firstName, money } from '../utils/format'
import { formatGroupAmount } from '../utils/currency'
import { Alert, Avatar, Empty, Loader, PageHeader } from '../components/ui'
import Icon from '../components/Icon'
import MapView from '../components/MapView'
import { useI18n } from '../i18n/I18nContext'

export default function Dashboard({ user }) {
  const { t, formatCurrentMonth } = useI18n()
  const me = String(user.id)
  const { data, error, loading, reload } = useData(async () => {
    const resumen = await financeApi.summary(user)
    const pendientes = await Promise.all((resumen?.grupos || []).map(async grupo => {
      const liquidaciones = await financeApi.pendingSettlements(user, grupo.id)
      return liquidaciones.map(liquidacion => ({
        ...liquidacion,
        grupo_id: String(grupo.id),
        grupo: grupo.nombre,
        de: String(liquidacion.deudorId),
        para: String(liquidacion.acreedorId),
      }))
    }))
    return { ...resumen, liquidacionesPendientes: pendientes.flat() }
  }, [user.id])
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState({ type: 'success', text: '' })
  const [offlineQueue, setOfflineQueue] = useState([])
  const [queueError, setQueueError] = useState('')
  const isLocal = usesLocalFinance(user)

  useEffect(() => {
    let active = true
    const syncQueue = async () => {
      try {
        const before = await financeApi.pendingOfflineExpenses(user)
        const after = navigator.onLine
          ? await financeApi.flushOfflineExpenses(user)
          : before
        if (!active) return
        setOfflineQueue(after)
        setQueueError('')
        if (before.length > after.length) reload()
      } catch (error) {
        if (active) setQueueError(error.message)
      }
    }
    const refreshQueue = () => syncQueue()
    syncQueue()
    window.addEventListener('online', refreshQueue)
    window.addEventListener('ft-offline-queue-updated', refreshQueue)
    return () => {
      active = false
      window.removeEventListener('online', refreshQueue)
      window.removeEventListener('ft-offline-queue-updated', refreshQueue)
    }
  }, [user.id])

  if (loading) return <Loader />
  if (error) return <Alert>{error}</Alert>

  const { grupos, teDeben, debes, balance, liquidaciones, liquidacionesPendientes } = data
  const nombre = u => (u?.id === me ? 'Tú' : firstName(u?.nombre))

  const settle = async p => {
    const key = `${p.grupo_id}${p.de}${p.para}`
    setBusy(key); setMsg({ text: '' })
    try {
      await financeApi.settle(user, { grupo_id: p.grupo_id, de: p.de, para: p.para, monto: p.montoGrupo ?? p.monto })
      const grupoPago = grupos.find(grupo => String(grupo.id) === String(p.grupo_id))
      const instrucciones = grupoPago?.instruccionesPago
      setMsg({
        type: 'success',
        text: isLocal
          ? t('settlement_local_success', { amount: formatGroupAmount(p.montoGrupo ?? p.monto, grupoPago) })
          : `${t('settlement_reported_success', { amount: formatGroupAmount(p.montoGrupo ?? p.monto, grupoPago), group: p.grupo })}${instrucciones ? ` ${t('payment_instructions', { instructions: instrucciones })}` : ''}`,
      })
      await reload()
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally { setBusy(null) }
  }

  const confirmar = async (p, pendiente) => {
    const key = `${p.grupo_id}${p.de}${p.para}`
    setBusy(key); setMsg({ text: '' })
    try {
      await financeApi.confirmSettlement(user, p.grupo_id, pendiente.id)
      const grupoPago = grupos.find(grupo => String(grupo.id) === String(p.grupo_id))
      setMsg({
        type: 'success',
        text: t('settlement_confirmed_success', { amount: formatGroupAmount(pendiente.monto, grupoPago), group: p.grupo }),
      })
      await reload()
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally { setBusy(null) }
  }

  return (
    <>
      <PageHeader title={t('dash_title')}
        subtitle={t('dash_subtitle', { month: formatCurrentMonth(), count: grupos.length })} />

      <div className="stats">
        <div className="stat">
          <span className="stat-label">{t('stat_net_balance')}</span>
          <strong className={`stat-value ${balance < 0 ? 'neg' : 'pos'}`}>{money(balance)}</strong>
          <small>{t('stat_net_balance_hint')}</small>
        </div>
        <div className="stat">
          <span className="stat-label">{t('stat_you_are_owed')}</span>
          <strong className="stat-value pos">{money(teDeben)}</strong>
          <small>{t('stat_you_are_owed_hint')}</small>
        </div>
        <div className="stat">
          <span className="stat-label">{t('stat_you_owe')}</span>
          <strong className="stat-value neg">{money(-debes)}</strong>
          <small>{t('stat_you_owe_hint')}</small>
        </div>
      </div>

      <Alert type={msg.type}>{msg.text}</Alert>
      <Alert>{queueError}</Alert>

      {offlineQueue.length > 0 && (
        <section className="section">
          <h2 className="section-title">{t('offline_queue_title')}</h2>
          <p className="muted">{t('offline_queue_hint')}</p>
          <ul className="list">
            {offlineQueue.map(item => (
              <li key={item.id} className="list-row">
                <div className="list-main">
                  <span className="list-title">{item.descripcion}</span>
                  <small className={item.status === 'needs_review' ? 'neg' : 'muted'}>
                    {item.status === 'needs_review' ? t('offline_needs_review', { error: item.error }) : t('offline_waiting')}
                  </small>
                </div>
                <div className="list-end">
                  {item.status === 'needs_review' && (
                    <button className="btn btn-ghost btn-xs" onClick={async () => {
                      const remaining = await financeApi.retryOfflineExpense(user, item.id)
                      setOfflineQueue(remaining)
                      if (remaining.length < offlineQueue.length) reload()
                    }}>{t('retry')}</button>
                  )}
                  <button className="btn btn-danger-ghost btn-xs" onClick={async () => {
                    setOfflineQueue(await financeApi.discardOfflineExpense(user, item.id))
                  }}>{t('discard')}</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="dash-grid">
        <section className="section">
          <h2 className="section-title">{t('settlements_title')}</h2>
          {liquidaciones.length === 0 ? (
            <Empty icon="check" title={t('settlements_empty_title')} text={t('settlements_empty_desc')} />
          ) : (
            <ul className="list">
              {liquidaciones.map(p => {
                const mine = p.de === me || p.para === me
                const key = `${p.grupo_id}${p.de}${p.para}`
                const grupoPago = grupos.find(g => String(g.id) === String(p.grupo_id))
                const pendiente = liquidacionesPendientes.find(item =>
                  item.grupo_id === String(p.grupo_id) && item.de === String(p.de) && item.para === String(p.para))
                return (
                  <li key={key} className="list-row">
                    <Avatar user={p.deUsuario} size={34} />
                    <div className="list-main">
                      <span className="list-title">{nombre(p.deUsuario)} <Icon name="arrow" size={14} className="inline-icon" /> {nombre(p.paraUsuario)}</span>
                      <small className="muted">{p.grupo}</small>
                    </div>
                    <div className="list-end">
                      <strong className={`amount ${p.para === me ? 'pos' : p.de === me ? 'neg' : 'muted'}`}>
                        {p.montoGrupo != null ? formatGroupAmount(p.montoGrupo, grupoPago) : money(p.monto)}
                      </strong>
                      {mine && p.de === me && grupoPago?.instruccionesPago
                        && <small className="muted">{grupoPago.instruccionesPago}</small>}
                      {mine && p.de === me && (
                        pendiente
                          ? <small className="muted">{t('settlement_waiting')}</small>
                          : <button className="btn btn-ghost btn-xs" disabled={busy === key} onClick={() => settle(p)}>
                              {busy === key ? '…' : t('report_payment')}
                            </button>
                      )}
                      {mine && p.para === me && (
                        pendiente
                          ? <button className="btn btn-ghost btn-xs" disabled={busy === key} onClick={() => confirmar(p, pendiente)}>
                              {busy === key ? '…' : t('confirm_receipt')}
                            </button>
                          : <small className="muted">{t('pending_payment')}</small>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{t('my_groups_title')}</h2>
            <Link to="/grupos" className="link small">{t('my_groups_view_all')}</Link>
          </div>
          {grupos.length === 0 ? (
            <Empty title={t('my_groups_empty_title')} text={t('my_groups_empty_desc')}
              action={<Link to="/grupos" className="btn btn-primary btn-sm"><Icon name="plus" size={16} />{t('new_group_btn')}</Link>} />
          ) : (
            <ul className="list">
              {grupos.map(g => (
                <li key={g.id}>
                  <Link to={`/gastos?grupo=${g.id}`} className="list-row list-link">
                    <span className="tile-icon"><Icon name={g.icono} size={20} /></span>
                    <div className="list-main">
                      <span className="list-title">{g.nombre}</span>
                      <small className="muted">{t('group_members_count', { count: g.miembros.length })}</small>
                    </div>
                    <strong className={`amount ${g.mi_balance < 0 ? 'neg' : 'pos'}`}>{money(g.mi_balance)}</strong>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {grupos.length > 0 && (
        <section className="section">
          <h2 className="section-title">{t('groups_map_title')}</h2>
          <MapView grupos={grupos} />
        </section>
      )}
    </>
  )
}
