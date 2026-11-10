import { useState } from 'react'
import { Link } from 'react-router-dom'
import { financeApi } from '../services/financeApi'
import { useData } from '../utils/useData'
import { currentMonthLabel, firstName, money } from '../utils/format'
import { Alert, Avatar, Empty, Loader, PageHeader } from '../components/ui'
import Icon from '../components/Icon'
import MapView from '../components/MapView'

export default function Dashboard({ user }) {
  const me = String(user.id)
  const { data, error, loading, reload } = useData(() => financeApi.summary(user), [user.id])
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState('')

  if (loading) return <Loader />
  if (error) return <Alert>{error}</Alert>

  const { grupos, teDeben, debes, balance, liquidaciones } = data
  const nombre = u => (u?.id === me ? 'Tú' : firstName(u?.nombre))

  const settle = async p => {
    setBusy(`${p.grupo_id}${p.de}${p.para}`); setMsg('')
    try {
      await financeApi.settle(user, { grupo_id: p.grupo_id, de: p.de, para: p.para })
      setMsg(`Pago de ${money(p.monto)} registrado en ${p.grupo}.`)
      await reload()
    } finally { setBusy(null) }
  }

  return (
    <>
      <PageHeader title="Panel de control"
        subtitle={`${currentMonthLabel()} · ${grupos.length} ${grupos.length === 1 ? 'grupo activo' : 'grupos activos'}`} />

      <div className="stats">
        <div className="stat">
          <span className="stat-label">Balance neto</span>
          <strong className={`stat-value ${balance < 0 ? 'neg' : 'pos'}`}>{money(balance)}</strong>
          <small>Tu posición actual</small>
        </div>
        <div className="stat">
          <span className="stat-label">Te deben</span>
          <strong className="stat-value pos">{money(teDeben)}</strong>
          <small>Pendiente de cobro</small>
        </div>
        <div className="stat">
          <span className="stat-label">Debes</span>
          <strong className="stat-value neg">{money(-debes)}</strong>
          <small>Pendiente de pago</small>
        </div>
      </div>

      <Alert type="success">{msg}</Alert>

      <div className="dash-grid">
        <section className="section">
          <h2 className="section-title">Liquidaciones sugeridas</h2>
          {liquidaciones.length === 0 ? (
            <Empty icon="check" title="¡Todo al día!" text="No hay deudas pendientes en tus grupos." />
          ) : (
            <ul className="list">
              {liquidaciones.map(p => {
                const mine = p.de === me || p.para === me
                const key = `${p.grupo_id}${p.de}${p.para}`
                return (
                  <li key={key} className="list-row">
                    <Avatar user={p.deUsuario} size={34} />
                    <div className="list-main">
                      <span className="list-title">{nombre(p.deUsuario)} <Icon name="arrow" size={14} className="inline-icon" /> {nombre(p.paraUsuario)}</span>
                      <small className="muted">{p.grupo}</small>
                    </div>
                    <div className="list-end">
                      <strong className={`amount ${p.para === me ? 'pos' : p.de === me ? 'neg' : 'muted'}`}>{money(p.monto)}</strong>
                      {mine && (
                        <button className="btn btn-ghost btn-xs" disabled={busy === key} onClick={() => settle(p)}>
                          {busy === key ? '…' : p.de === me ? 'Pagué' : 'Recibí'}
                        </button>
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
            <h2 className="section-title">Mis grupos</h2>
            <Link to="/grupos" className="link small">Ver todos</Link>
          </div>
          {grupos.length === 0 ? (
            <Empty title="Aún no tienes grupos" text="Crea tu primer grupo para empezar a registrar gastos."
              action={<Link to="/grupos" className="btn btn-primary btn-sm"><Icon name="plus" size={16} />Nuevo grupo</Link>} />
          ) : (
            <ul className="list">
              {grupos.map(g => (
                <li key={g.id}>
                  <Link to={`/gastos?grupo=${g.id}`} className="list-row list-link">
                    <span className="tile-icon"><Icon name={g.icono} size={20} /></span>
                    <div className="list-main">
                      <span className="list-title">{g.nombre}</span>
                      <small className="muted">{g.miembros.length} miembros</small>
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
          <h2 className="section-title">Mapa de mis grupos</h2>
          <MapView grupos={grupos} />
        </section>
      )}
    </>
  )
}
