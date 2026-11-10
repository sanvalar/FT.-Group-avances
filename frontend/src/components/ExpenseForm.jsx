import { useMemo, useState } from 'react'
import { financeApi } from '../services/financeApi'
import { splitEqual } from '../utils/balances'
import { CATEGORIAS, money, today } from '../utils/format'
import { Alert, Avatar } from './ui'

/** Formulario de gasto: grupo, monto, pagador y división (equitativa/personalizada). */
export default function ExpenseForm({ user, grupos, initial = {}, origen = 'manual', recibo, formId = 'expense-form', onSaved, onSavingChange }) {
  const me = String(user.id)
  const [grupoId, setGrupoId] = useState(initial.grupo_id || grupos[0]?.id || '')
  const grupo = grupos.find(g => g.id === grupoId)
  const miembros = grupo?.miembros || []

  const [form, setForm] = useState({
    descripcion: initial.descripcion || '',
    monto: initial.monto ? String(initial.monto) : '',
    fecha: initial.fecha || today(),
    categoria: initial.categoria || 'otro',
    pagador: me,
    tipo: 'equitativa',
  })
  const [participantes, setParticipantes] = useState(() => new Set(miembros.map(m => m.id)))
  const [custom, setCustom] = useState({})
  const [error, setError] = useState('')

  const change = e => setForm({ ...form, [e.target.name]: e.target.value })
  const total = Math.round(Number(form.monto.replace(/[^\d]/g, '')) || 0)

  const changeGroup = id => {
    setGrupoId(id)
    const g = grupos.find(x => x.id === id)
    setParticipantes(new Set(g?.miembros.map(m => m.id)))
    setCustom({})
    setForm(f => ({ ...f, pagador: me }))
  }

  const divisiones = useMemo(() => {
    if (form.tipo === 'equitativa') return splitEqual(total, miembros.filter(m => participantes.has(m.id)).map(m => m.id))
    return miembros.map(m => ({ usuario_id: m.id, monto_asignado: Math.round(Number(custom[m.id]) || 0) }))
  }, [form.tipo, total, miembros, participantes, custom])

  const asignado = divisiones.reduce((s, d) => s + d.monto_asignado, 0)
  const diferencia = total - asignado

  const toggle = id => setParticipantes(s => {
    const n = new Set(s)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  const submit = async e => {
    e.preventDefault(); setError('')
    if (!grupo) return setError('Selecciona un grupo.')
    if (total <= 0) return setError('Ingresa un monto mayor que cero.')
    if (!divisiones.some(d => d.monto_asignado > 0)) return setError('Selecciona al menos un participante.')
    if (diferencia !== 0) return setError(`La suma de las partes debe ser ${money(total)} (faltan ${money(diferencia)}).`)
    onSavingChange?.(true)
    try {
      await financeApi.createExpense(user, {
        grupo_id: grupoId, pagador_id: form.pagador, descripcion: form.descripcion, monto_total: total,
        fecha_gasto: form.fecha, categoria: form.categoria, tipo_division: form.tipo,
        divisiones, origen_registro: origen, recibo,
      })
      onSaved?.()
    } catch (err) { setError(err.message) } finally { onSavingChange?.(false) }
  }

  return (
    <form id={formId} className="form" onSubmit={submit}>
      <Alert>{error}</Alert>
      <div className="field">
        <label htmlFor="e-grupo">Grupo</label>
        <select id="e-grupo" value={grupoId} onChange={e => changeGroup(e.target.value)} required>
          {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="e-desc">Descripción</label>
        <input id="e-desc" name="descripcion" value={form.descripcion} onChange={change} placeholder="Ej. Mercado semanal" maxLength={255} required />
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="e-monto">Monto (COP)</label>
          <input id="e-monto" name="monto" inputMode="numeric" value={form.monto} onChange={change} placeholder="0" required />
        </div>
        <div className="field">
          <label htmlFor="e-fecha">Fecha</label>
          <input id="e-fecha" name="fecha" type="date" value={form.fecha} onChange={change} max={today()} required />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="e-cat">Categoría</label>
          <select id="e-cat" name="categoria" value={form.categoria} onChange={change}>
            {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="e-pagador">Pagado por</label>
          <select id="e-pagador" name="pagador" value={form.pagador} onChange={change}>
            {miembros.map(m => <option key={m.id} value={m.id}>{m.id === me ? `${m.nombre} (tú)` : m.nombre}</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <span className="label">División</span>
        <div className="segmented" role="radiogroup">
          {[['equitativa', 'Partes iguales'], ['personalizada', 'Personalizada']].map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={form.tipo === id}
              className={form.tipo === id ? 'active' : ''} onClick={() => setForm({ ...form, tipo: id })}>{label}</button>
          ))}
        </div>
        <ul className="split-list">
          {miembros.map(m => {
            const d = divisiones.find(x => x.usuario_id === m.id)
            return (
              <li key={m.id}>
                {form.tipo === 'equitativa' ? (
                  <label className="split-check">
                    <input type="checkbox" checked={participantes.has(m.id)} onChange={() => toggle(m.id)} />
                    <Avatar user={m} size={26} /><span>{m.id === me ? 'Tú' : m.nombre}</span>
                  </label>
                ) : (
                  <span className="split-check"><Avatar user={m} size={26} /><span>{m.id === me ? 'Tú' : m.nombre}</span></span>
                )}
                {form.tipo === 'equitativa'
                  ? <strong className="muted-strong">{d ? money(d.monto_asignado) : '—'}</strong>
                  : <input className="split-input" inputMode="numeric" aria-label={`Parte de ${m.nombre}`} placeholder="0"
                      value={custom[m.id] ?? ''} onChange={e => setCustom({ ...custom, [m.id]: e.target.value.replace(/[^\d]/g, '') })} />}
              </li>
            )
          })}
        </ul>
        {form.tipo === 'personalizada' && total > 0 && (
          <small className={diferencia === 0 ? 'hint pos' : 'hint neg'}>
            {diferencia === 0 ? 'Las partes cuadran con el total.' : diferencia > 0 ? `Faltan ${money(diferencia)} por asignar.` : `Te pasaste por ${money(-diferencia)}.`}
          </small>
        )}
      </div>
    </form>
  )
}
