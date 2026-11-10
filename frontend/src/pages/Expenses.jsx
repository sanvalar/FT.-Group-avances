import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { financeApi, usesLocalFinance } from '../services/financeApi'
import { useData } from '../utils/useData'
import { categoria, firstName, shortDate } from '../utils/format'
import { formatGroupAmount } from '../utils/currency'
import { Alert, Avatar, Chips, Empty, Loader, Modal, PageHeader } from '../components/ui'
import Icon from '../components/Icon'
import ExpenseForm from '../components/ExpenseForm'

function MyShare({ g }) {
  if (g.mi_estado === 'pagador') {
    return g.me_deben > 0
      ? <span className="share pos" title="Te deben">+{formatGroupAmount(g.me_deben, g.grupo)}</span>
      : <span className="share pos"><Icon name="check" size={14} />Saldado</span>
  }
  if (g.mi_estado === 'no_participa') return <span className="muted">—</span>
  return g.mi_estado === 'pagado'
    ? <span className="share pos"><Icon name="check" size={14} />{formatGroupAmount(g.mi_parte, g.grupo)}</span>
    : <span className="share neg">{formatGroupAmount(g.mi_parte, g.grupo)}</span>
}

function ExpenseDetail({ gasto, user, onClose, onChanged }) {
  const me = String(user.id)
  const isLocal = usesLocalFinance(user)
  const [busy, setBusy] = useState(null)
  const [actionMessage, setActionMessage] = useState({ type: 'error', text: '' })
  const canMark = d => d.estado_pago === 'pendiente' && !d.pago_reportado
    && d.usuario_id === me && d.usuario_id !== gasto.pagador_id

  const pay = async d => {
    setBusy(d.usuario_id); setActionMessage({ type: 'error', text: '' })
    try {
      await financeApi.payShare(user, gasto.id)
      setActionMessage(isLocal
        ? { type: 'success', text: 'Pago registrado en los datos de demostración.' }
        : {
            type: 'warning',
            text: `Pago reportado. El balance se actualizará cuando el acreedor confirme la recepción desde el panel.${gasto.grupo?.instruccionesPago ? ` Instrucciones del grupo: ${gasto.grupo.instruccionesPago}` : ''}`,
          })
      onChanged()
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message })
    } finally {
      setBusy(null)
    }
  }
  const remove = async () => {
    if (!window.confirm('¿Eliminar este gasto? Se recalcularán los balances del grupo.')) return
    setActionMessage({ type: 'error', text: '' })
    try {
      await financeApi.deleteExpense(user, gasto.id)
      onChanged(true)
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message })
    }
  }
  const cat = categoria(gasto.categoria)

  return (
    <Modal title={gasto.descripcion} onClose={onClose}
      footer={<>
        {gasto.pagador_id === me && <button className="btn btn-danger-ghost" onClick={remove}><Icon name="trash" size={16} />Eliminar</button>}
        <button className="btn btn-primary" onClick={onClose}>Listo</button>
      </>}>
      <Alert type={actionMessage.type}>{actionMessage.text}</Alert>
      <div className="detail-head">
        <span className="tile-icon"><Icon name={cat.icon} size={20} /></span>
        <div>
          <strong className="detail-amount">{formatGroupAmount(gasto.monto_total, gasto.grupo)}</strong>
          <small className="muted">{gasto.grupo?.nombre} · {cat.label} · {gasto.fecha_gasto}
            {gasto.moneda_original && gasto.moneda_original !== gasto.grupo?.moneda
              ? ` · Original: ${gasto.monto_original} ${gasto.moneda_original} (tasa ${gasto.tasa_cambio})`
              : ''}
            {gasto.origen_registro === 'ocr' ? ' · Escaneado' : ''}
          </small>
        </div>
      </div>
      {gasto.articulos?.length > 0 && (
        <details className="expense-items">
          <summary>{gasto.articulos.length} artículo(s)</summary>
          <ul className="list">
            {gasto.articulos.map((item, index) => (
              <li key={`${item.descripcion}-${index}`} className="list-row">
                <span className="list-main">{item.descripcion} × {item.cantidad}</span>
                <strong>{formatGroupAmount(Number(item.montoTotal), gasto.grupo)}</strong>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="muted">Pagado por <strong className="text">{gasto.pagador_id === me ? 'ti' : gasto.pagador?.nombre}</strong> · División {gasto.tipo_division}</p>
      <ul className="list">
        {gasto.divisiones.map(d => (
          <li key={d.usuario_id} className="list-row">
            <Avatar user={d.usuario} size={30} />
            <div className="list-main">
              <span className="list-title">{d.usuario_id === me ? 'Tú' : d.usuario?.nombre}</span>
              <small className={d.estado_pago === 'pagado' ? 'pos' : 'neg'}>
                {d.usuario_id === gasto.pagador_id ? 'Pagó el gasto'
                  : d.estado_pago === 'pagado' ? 'Saldado'
                    : d.pago_reportado ? 'Pago reportado'
                      : 'Pendiente'}
              </small>
            </div>
            <div className="list-end">
              <strong>{formatGroupAmount(d.monto_asignado, gasto.grupo)}</strong>
              {canMark(d) && (
                <button className="btn btn-ghost btn-xs" disabled={busy === d.usuario_id} onClick={() => pay(d)}>
                  Reportar pago
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
    async () => {
      const grupos = await financeApi.groups(user)
      const [gastos, recurrencias] = await Promise.all([
        financeApi.expenses(user),
        Promise.all(grupos.map(grupo => financeApi.listRecurrences(user, grupo.id)
          .then(items => items.map(item => ({ ...item, grupoId: String(grupo.id), grupoNombre: grupo.nombre, rol: grupo.rol }))))),
      ])
      return { gastos, grupos, recurrencias: recurrencias.flat() }
    }, [user.id])
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [queueMessage, setQueueMessage] = useState('')

  if (loading) return <Loader />
  if (error) return <Alert>{error}</Alert>

  const { gastos, grupos, recurrencias } = data
  const needle = query.trim().toLocaleLowerCase()
  const visibles = gastos.filter(g =>
    (filtro === 'todos' || g.grupo_id === filtro)
    && (!needle || [
      g.descripcion, g.categoria, g.grupo?.nombre, g.pagador?.nombre,
      ...(g.articulos || []).map(item => item.descripcion),
    ].some(value => String(value || '').toLocaleLowerCase().includes(needle))),
  )
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
          <Alert type="warning">{queueMessage}</Alert>
          <div className="field search-field">
            <label htmlFor="expense-search">Buscar gastos</label>
            <input id="expense-search" type="search" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Descripción, grupo, categoría o artículo" />
          </div>
          <Chips label="Filtrar por grupo" value={filtro}
            onChange={id => setParams(id === 'todos' ? {} : { grupo: id }, { replace: true })}
            options={[{ id: 'todos', label: 'Todos' }, ...grupos.map(g => ({ id: g.id, label: g.nombre }))]} />

          {(filtro === 'todos' ? recurrencias : recurrencias.filter(item => item.grupoId === filtro)).length > 0 && (
            <section className="section">
              <h2 className="section-title">Gastos recurrentes</h2>
              <ul className="list">
                {(filtro === 'todos' ? recurrencias : recurrencias.filter(item => item.grupoId === filtro)).map(item => (
                  <li key={item.id} className="list-row">
                    <div className="list-main">
                      <span className="list-title">{item.descripcion}</span>
                      <small className="muted">{item.grupoNombre} · {item.frecuencia} · próxima fecha {String(item.proximaFecha).slice(0, 10)} · {item.activa ? 'activa' : 'pausada'}</small>
                    </div>
                    {item.rol === 'administrador' && (
                      <button className="btn btn-ghost btn-xs" onClick={async () => {
                        await financeApi.setRecurrenceActive(user, item.grupoId, item.id, !item.activa)
                        reload()
                      }}>{item.activa ? 'Pausar' : 'Reanudar'}</button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

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
                      <td className="num"><strong>{formatGroupAmount(g.monto_total, g.grupo)}</strong></td>
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
                        <strong>{formatGroupAmount(g.monto_total, g.grupo)}</strong>
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
            onSavingChange={setSaving} onSaved={result => {
              setAdding(false)
              setQueueMessage(result?.queued
                ? 'Gasto guardado en la cola sin conexión. Se sincronizará cuando vuelva la conexión; revisa el panel si necesita resolución.'
                : '')
              reload()
            }} />
        </Modal>
      )}
      {detalle && (
        <ExpenseDetail gasto={detalle} user={user} onClose={() => setSelected(null)}
          onChanged={closed => { if (closed) setSelected(null); reload() }} />
      )}
    </>
  )
}
