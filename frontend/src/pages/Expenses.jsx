import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { financeApi } from '../services/financeApi'
import { useData } from '../utils/useData'
import { categoria, firstName, money, shortDate } from '../utils/format'
import { Alert, Avatar, Chips, Empty, Loader, Modal, PageHeader } from '../components/ui'
import Icon from '../components/Icon'
import ExpenseForm from '../components/ExpenseForm'

function MyShare({ g }) {
  if (g.mi_estado === 'pagador') {
    return g.me_deben > 0
      ? <span className="share pos" title="Te deben">+{money(g.me_deben)}</span>
      : <span className="share pos"><Icon name="check" size={14} />Saldado</span>
  }
  if (g.mi_estado === 'no_participa') return <span className="muted">—</span>
  return g.mi_estado === 'pagado'
    ? <span className="share pos"><Icon name="check" size={14} />{money(g.mi_parte)}</span>
    : <span className="share neg">{money(g.mi_parte)}</span>
}

function ExpenseDetail({ gasto, user, onClose, onChanged }) {
  const me = String(user.id)
  const [busy, setBusy] = useState(null)
  const canMark = d => d.estado_pago === 'pendiente' && d.usuario_id !== gasto.pagador_id && (d.usuario_id === me || gasto.pagador_id === me)

  const pay = async d => {
    setBusy(d.usuario_id)
    await financeApi.payShare(user, gasto.id, d.usuario_id)
    setBusy(null); onChanged()
  }
  const remove = async () => {
    if (!window.confirm('¿Eliminar este gasto? Se recalcularán los balances del grupo.')) return
    await financeApi.deleteExpense(user, gasto.id)
    onChanged(true)
  }
  const cat = categoria(gasto.categoria)

  return (
    <Modal title={gasto.descripcion} onClose={onClose}
      footer={<>
        {gasto.pagador_id === me && <button className="btn btn-danger-ghost" onClick={remove}><Icon name="trash" size={16} />Eliminar</button>}
        <button className="btn btn-primary" onClick={onClose}>Listo</button>
      </>}>
      <div className="detail-head">
        <span className="tile-icon"><Icon name={cat.icon} size={20} /></span>
        <div>
          <strong className="detail-amount">{money(gasto.monto_total)}</strong>
          <small className="muted">{gasto.grupo?.nombre} · {cat.label} · {gasto.fecha_gasto}{gasto.origen_registro === 'ocr' ? ' · Escaneado' : ''}</small>
        </div>
      </div>
      <p className="muted">Pagado por <strong className="text">{gasto.pagador_id === me ? 'ti' : gasto.pagador?.nombre}</strong> · División {gasto.tipo_division}</p>
      <ul className="list">
        {gasto.divisiones.map(d => (
          <li key={d.usuario_id} className="list-row">
            <Avatar user={d.usuario} size={30} />
            <div className="list-main">
              <span className="list-title">{d.usuario_id === me ? 'Tú' : d.usuario?.nombre}</span>
              <small className={d.estado_pago === 'pagado' ? 'pos' : 'neg'}>
                {d.usuario_id === gasto.pagador_id ? 'Pagó el gasto' : d.estado_pago === 'pagado' ? 'Saldado' : 'Pendiente'}
              </small>
            </div>
            <div className="list-end">
              <strong>{money(d.monto_asignado)}</strong>
              {canMark(d) && (
                <button className="btn btn-ghost btn-xs" disabled={busy === d.usuario_id} onClick={() => pay(d)}>
                  {d.usuario_id === me ? 'Pagué' : 'Recibido'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

export default function Expenses({ user }) {
  const [params, setParams] = useSearchParams()
  const filtro = params.get('grupo') || 'todos'
  const { data, error, loading, reload } = useData(
    async () => ({ gastos: await financeApi.expenses(user), grupos: await financeApi.groups(user) }), [user.id])
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState(null)

  if (loading) return <Loader />
  if (error) return <Alert>{error}</Alert>

  const { gastos, grupos } = data
  const visibles = filtro === 'todos' ? gastos : gastos.filter(g => g.grupo_id === filtro)
  const me = String(user.id)
  const payer = g => (g.pagador_id === me ? 'Tú' : firstName(g.pagador?.nombre))
  const detalle = selected && gastos.find(g => g.id === selected)

  const action = grupos.length > 0 && <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={18} />Agregar gasto</button>

  return (
    <>
      <PageHeader title="Registro de gastos" subtitle={`${visibles.length} ${visibles.length === 1 ? 'gasto registrado' : 'gastos registrados'}`} action={action} />

      {grupos.length === 0 ? (
        <Empty icon="layers" title="Primero crea un grupo" text="Los gastos siempre pertenecen a un grupo."
          action={<Link className="btn btn-primary btn-sm" to="/grupos">Ir a grupos</Link>} />
      ) : (
        <>
          <Chips label="Filtrar por grupo" value={filtro}
            onChange={id => setParams(id === 'todos' ? {} : { grupo: id }, { replace: true })}
            options={[{ id: 'todos', label: 'Todos' }, ...grupos.map(g => ({ id: g.id, label: g.nombre }))]} />

          {visibles.length === 0 ? (
            <Empty icon="receipt" title="Sin gastos en este grupo" text="Agrega el primero o escanea un recibo."
              action={<Link className="btn btn-ghost btn-sm" to="/escanear"><Icon name="scan" size={16} />Escanear recibo</Link>} />
          ) : (
            <div className="table-card">
              <table className="table">
                <thead>
                  <tr><th>Descripción</th><th>Grupo</th><th className="num">Monto</th><th>Pagado por</th><th className="num">Mi parte</th></tr>
                </thead>
                <tbody>
                  {visibles.map(g => (
                    <tr key={g.id} onClick={() => setSelected(g.id)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && setSelected(g.id)}>
                      <td>
                        <div className="cell-main">{g.descripcion}</div>
                        <small className="muted">{shortDate(g.fecha_gasto)} · {categoria(g.categoria).label}</small>
                      </td>
                      <td className="muted">{g.grupo?.nombre}</td>
                      <td className="num"><strong>{money(g.monto_total)}</strong></td>
                      <td><span className="payer"><Avatar user={g.pagador} size={26} />{payer(g)}</span></td>
                      <td className="num"><MyShare g={g} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Vista de tarjetas para celular */}
              <ul className="expense-cards">
                {visibles.map(g => (
                  <li key={g.id}>
                    <button className="expense-card" onClick={() => setSelected(g.id)}>
                      <span className="tile-icon sm"><Icon name={categoria(g.categoria).icon} size={18} /></span>
                      <span className="list-main">
                        <span className="list-title">{g.descripcion}</span>
                        <small className="muted">{g.grupo?.nombre} · {g.pagador_id === me ? 'Pagaste' : `${payer(g)} pagó`} · {shortDate(g.fecha_gasto)}</small>
                      </span>
                      <span className="list-end">
                        <strong>{money(g.monto_total)}</strong>
                        <MyShare g={g} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {adding && (
        <Modal title="Agregar gasto" onClose={() => setAdding(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setAdding(false)}>Cancelar</button>
            <button className="btn btn-primary" form="expense-form" disabled={saving}>{saving ? 'Guardando…' : 'Guardar gasto'}</button>
          </>}>
          <ExpenseForm user={user} grupos={grupos} initial={{ grupo_id: filtro !== 'todos' ? filtro : undefined }}
            onSavingChange={setSaving} onSaved={() => { setAdding(false); reload() }} />
        </Modal>
      )}
      {detalle && (
        <ExpenseDetail gasto={detalle} user={user} onClose={() => setSelected(null)}
          onChanged={closed => { if (closed) setSelected(null); reload() }} />
      )}
    </>
  )
}
