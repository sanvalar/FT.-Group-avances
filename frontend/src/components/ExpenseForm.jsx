import { useEffect, useMemo, useState } from 'react'
import { financeApi, usesLocalFinance } from '../services/financeApi'
import { splitEqual, splitRatio } from '../utils/balances'
import { CATEGORIAS, today } from '../utils/format'
import { Alert, Avatar } from './ui'
import { CURRENCIES } from '../currency/CurrencyContext'

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
    moneda: CURRENCIES[initial.moneda] ? initial.moneda : (grupo?.moneda || 'COP'),
    tasa: '1',
    frecuencia: '',
    proximaFecha: '',
  })
  const [participantes, setParticipantes] = useState(() => new Set(miembros.map(m => m.id)))
  const [custom, setCustom] = useState({})
  const [proporciones, setProporciones] = useState(() => Object.fromEntries(
    miembros.map((m, i) => [m.id, miembros.length ? (i === miembros.length - 1 ? 100 - Math.floor(100 / miembros.length * 100) / 100 * (miembros.length - 1) : Math.floor(100 / miembros.length * 100) / 100) : 0]),
  ))
  const [articulos, setArticulos] = useState(() => initial.articulos || [])
  const [nombrePlantilla, setNombrePlantilla] = useState('')
  const [plantillas, setPlantillas] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`ft_split_templates_${user.id}`) || '{}') } catch { return {} }
  })
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    financeApi.listTemplates(user, grupoId).then(items => {
      if (!active) return
      setPlantillas(previous => ({
        ...previous,
        [grupoId]: items.map(item => {
          if (item.tipo) return item
          const asignaciones = item.asignaciones || []
          return {
            id: item.id,
            nombre: item.nombre,
            tipo: item.tipoDivision,
            participantes: asignaciones.map(a => String(a.usuarioId)),
            custom: Object.fromEntries(asignaciones.map(a => [String(a.usuarioId), String(a.valor)])),
            proporciones: Object.fromEntries(asignaciones.map(a => [String(a.usuarioId), String(a.valor)])),
          }
        }),
      }))
    }).catch(loadError => {
      if (active) setError(loadError.message)
    })
    return () => { active = false }
  }, [user.id, grupoId])

  const change = e => setForm({ ...form, [e.target.name]: e.target.value })
  const montoOriginal = Number(form.monto.replace(',', '.')) || 0
  const tasaCambio = form.moneda === (grupo?.moneda || 'COP') ? 1 : Number(form.tasa)
  const total = Math.round(montoOriginal * tasaCambio * 100) / 100
  const monedaGrupo = grupo?.moneda || 'COP'
  const formatoGrupo = new Intl.NumberFormat(CURRENCIES[monedaGrupo]?.locale || 'es-CO', {
    style: 'currency', currency: monedaGrupo, maximumFractionDigits: 2,
  })
  const mostrarMontoGrupo = monto => formatoGrupo.format(Number(monto) || 0)

  const changeGroup = id => {
    setGrupoId(id)
    const g = grupos.find(x => x.id === id)
    setParticipantes(new Set(g?.miembros.map(m => m.id)))
    setCustom({})
    const moneda = g?.moneda || 'COP'
    setProporciones(Object.fromEntries((g?.miembros || []).map((m, i) => [
      m.id,
      (g.miembros.length ? (i === g.miembros.length - 1 ? 100 - Math.floor(100 / g.miembros.length * 100) / 100 * (g.miembros.length - 1) : Math.floor(100 / g.miembros.length * 100) / 100) : 0),
    ])))
    setForm(f => ({ ...f, pagador: me, moneda, tasa: '1' }))
    setArticulos([])
  }

  const divisiones = useMemo(() => {
    if (form.tipo === 'equitativa') return splitEqual(Math.round(total * 100), miembros.filter(m => participantes.has(m.id)).map(m => m.id)).map(d => ({ ...d, monto_asignado: d.monto_asignado / 100 }))
    if (form.tipo === 'personalizada') return miembros.map(m => ({
      usuario_id: m.id,
      monto_asignado: Math.round((Number(String(custom[m.id] ?? '').replace(',', '.')) || 0) * 100) / 100,
    }))
    return splitRatio(Math.round(total * 100), miembros
      .filter(m => Number(proporciones[m.id]) > 0)
      .map(m => ({ usuario_id: m.id, value: Number(proporciones[m.id]) })))
  }, [form.tipo, total, miembros, participantes, custom, proporciones])

  const asignadoCentavos = divisiones.reduce((s, d) => s + Math.round(d.monto_asignado * 100), 0)
  const diferencia = Math.round(total * 100) - asignadoCentavos

  const toggle = id => setParticipantes(s => {
    const n = new Set(s)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  const aplicarPlantilla = nombre => {
    const plantilla = plantillas[grupoId]?.find(item => item.nombre === nombre)
    if (!plantilla) return
    setPlantillaSeleccionada(nombre)
    setForm(f => ({ ...f, tipo: plantilla.tipo }))
    setParticipantes(new Set(plantilla.participantes))
    setCustom(plantilla.custom)
    setProporciones(plantilla.proporciones)
  }

  const guardarPlantilla = async () => {
    const nombre = nombrePlantilla.trim()
    if (!nombre) return setError('Escribe un nombre para la plantilla.')
    const config = {
      nombre,
      tipo: form.tipo,
      participantes: [...participantes],
      custom,
      proporciones,
    }
    try {
      const asignaciones = form.tipo === 'equitativa'
        ? [...participantes].map(usuarioId => ({ usuarioId: Number(usuarioId), valor: 1 }))
        : miembros.filter(m => Number(form.tipo === 'personalizada' ? custom[m.id] : proporciones[m.id]) > 0)
          .map(m => ({
            usuarioId: Number(m.id),
            valor: Number(String(form.tipo === 'personalizada' ? custom[m.id] : proporciones[m.id]).replace(',', '.')),
          }))
      await financeApi.saveTemplate(user, grupoId, { ...config, asignaciones })
      const items = await financeApi.listTemplates(user, grupoId)
      const normalizadas = items.map(item => {
        if (item.tipo) return item
        const values = item.asignaciones || []
        return {
          id: item.id,
          nombre: item.nombre,
          tipo: item.tipoDivision,
          participantes: values.map(a => String(a.usuarioId)),
          custom: Object.fromEntries(values.map(a => [String(a.usuarioId), String(a.valor)])),
          proporciones: Object.fromEntries(values.map(a => [String(a.usuarioId), String(a.valor)])),
        }
      })
      const actualizadas = { ...plantillas, [grupoId]: normalizadas }
      if (usesLocalFinance(user)) localStorage.setItem(`ft_split_templates_${user.id}`, JSON.stringify(actualizadas))
      setPlantillas(actualizadas)
      setNombrePlantilla('')
      setPlantillaSeleccionada(nombre)
      setError('')
    } catch (saveError) {
      setError(saveError.message || 'No se pudo guardar la plantilla.')
    }
  }

  const eliminarPlantilla = async () => {
    const plantilla = plantillas[grupoId]?.find(item => item.nombre === plantillaSeleccionada)
    if (!plantilla) return
    try {
      await financeApi.deleteTemplate(user, grupoId, plantilla.id || plantilla.nombre)
      setPlantillas(previous => ({
        ...previous,
        [grupoId]: previous[grupoId].filter(item => item.nombre !== plantillaSeleccionada),
      }))
      setPlantillaSeleccionada('')
    } catch (deleteError) {
      setError(deleteError.message)
    }
  }

  const submit = async e => {
    e.preventDefault(); setError('')
    if (!grupo) return setError('Selecciona un grupo.')
    if (total <= 0) return setError('Ingresa un monto mayor que cero.')
    if (form.moneda !== monedaGrupo && !(tasaCambio > 0)) return setError('Ingresa una tasa de cambio válida.')
    if (!divisiones.some(d => d.monto_asignado > 0)) return setError('Selecciona al menos un participante.')
    if (form.tipo === 'porcentaje' && Math.abs(miembros.reduce((s, m) => s + (Number(proporciones[m.id]) || 0), 0) - 100) > 0.000001) {
      return setError('Los porcentajes deben sumar exactamente 100%.')
    }
    if (diferencia !== 0) return setError(`La suma de las partes debe ser ${mostrarMontoGrupo(total)} (faltan ${mostrarMontoGrupo(diferencia / 100)}).`)
    if (articulos.some(a => !a.descripcion.trim() || !(Number(a.cantidad) > 0) || !(Number(a.monto) > 0))) {
      return setError('Completa la descripción, cantidad y monto de cada artículo.')
    }
    if (articulos.length) {
      const sumaArticulos = articulos.reduce((sum, item) => sum + Number(item.monto), 0)
      if (Math.abs(Math.round(sumaArticulos * 100) - Math.round(montoOriginal * 100)) > 1) {
        return setError(`Los artículos deben sumar el total original (${montoOriginal.toFixed(2)} ${form.moneda}).`)
      }
    }
    onSavingChange?.(true)
    try {
      const solicitudId = globalThis.crypto?.randomUUID?.()
        || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
        })
      const resultado = await financeApi.createExpense(user, {
        grupo_id: grupoId, pagador_id: form.pagador, descripcion: form.descripcion, monto_total: total,
        fecha_gasto: form.fecha, categoria: form.categoria, tipo_division: form.tipo,
        divisiones,
        asignaciones: miembros.filter(m => Number(proporciones[m.id]) > 0)
          .map(m => ({ usuario_id: m.id, valor: Number(proporciones[m.id]) })),
        monto_original: montoOriginal,
        moneda_original: form.moneda,
        tasa_cambio: tasaCambio,
        articulos: articulos.filter(a => a.descripcion.trim()).map(a => ({
          descripcion: a.descripcion.trim(), cantidad: Number(a.cantidad),
          monto_total: Math.round(Number(a.monto) * tasaCambio * 100) / 100,
        })),
        recurrencia: form.frecuencia ? { frecuencia: form.frecuencia, proximaFecha: form.proximaFecha } : undefined,
        origen_registro: origen, recibo, solicitud_id: solicitudId,
      })
      onSaved?.(resultado)
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
          <label htmlFor="e-monto">Monto original ({form.moneda})</label>
          <input id="e-monto" name="monto" inputMode="decimal" value={form.monto} onChange={change} placeholder="0.00" required />
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="e-recurrencia">Gasto recurrente</label>
            <select id="e-recurrencia" name="frecuencia" value={form.frecuencia} onChange={change}>
              <option value="">No repetir</option>
              <option value="semanal">Cada semana</option>
              <option value="mensual">Cada mes</option>
              <option value="anual">Cada año</option>
            </select>
          </div>
          {form.frecuencia && <div className="field">
            <label htmlFor="e-proxima-fecha">Primera repetición</label>
            <input id="e-proxima-fecha" name="proximaFecha" type="date" min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} value={form.proximaFecha}
              onChange={change} required />
            <small className="hint">Se crea al consultar los gastos cuando llegue la fecha.</small>
          </div>}
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="e-moneda">Moneda del gasto</label>
            <select id="e-moneda" name="moneda" value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value, tasa: '1' }))}>
              {Object.values(CURRENCIES).map(currency => <option key={currency.code} value={currency.code}>{currency.code}</option>)}
            </select>
          </div>
          {form.moneda !== monedaGrupo && (
            <div className="field">
              <label htmlFor="e-tasa">1 {form.moneda} = ¿cuántos {monedaGrupo}?</label>
              <input id="e-tasa" name="tasa" type="number" min="0.00000001" step="any" value={form.tasa} onChange={change} required />
              <small className="hint">La tasa queda fija en este gasto para conservar los balances históricos.</small>
            </div>
          )}
        </div>
        <small className="hint">Total contabilizado en {monedaGrupo}: <strong>{mostrarMontoGrupo(total)}</strong></small>
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
        <div className="form-row">
          <label className="field">Plantilla guardada en este dispositivo
            <select value={plantillaSeleccionada} onChange={e => aplicarPlantilla(e.target.value)}>
              <option value="">Sin plantilla</option>
              {(plantillas[grupoId] || []).map(item => <option key={item.nombre} value={item.nombre}>{item.nombre}</option>)}
            </select>
            {plantillaSeleccionada && <button type="button" className="btn btn-ghost btn-xs" onClick={eliminarPlantilla}>Eliminar plantilla</button>}
          </label>
          <div className="field">
            <label htmlFor="split-template-name">Guardar división</label>
            <div className="form-row">
              <input id="split-template-name" value={nombrePlantilla} maxLength={80}
                onChange={e => setNombrePlantilla(e.target.value)} placeholder="Ej. Pareja" />
              <button type="button" className="btn btn-ghost btn-sm" onClick={guardarPlantilla}>Guardar plantilla</button>
            </div>
          </div>
        </div>
        <div className="segmented" role="radiogroup">
          {[
            ['equitativa', 'Partes iguales'],
            ['personalizada', 'Montos'],
            ['porcentaje', 'Porcentaje'],
            ['participaciones', 'Partes'],
          ].map(([id, label]) => (
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
                  ? <strong className="muted-strong">{d ? mostrarMontoGrupo(d.monto_asignado) : '—'}</strong>
                  : form.tipo === 'personalizada'
                    ? <input className="split-input" inputMode="decimal" aria-label={`Monto de ${m.nombre}`} placeholder="0.00"
                        value={custom[m.id] ?? ''} onChange={e => setCustom({ ...custom, [m.id]: e.target.value.replace(/[^\d.,]/g, '') })} />
                    : <div className="split-input-wrap">
                        <input className="split-input" type="number" min="0.01" step="any"
                          aria-label={`${form.tipo === 'porcentaje' ? 'Porcentaje' : 'Partes'} de ${m.nombre}`}
                          value={proporciones[m.id] ?? ''} onChange={e => setProporciones({ ...proporciones, [m.id]: e.target.value })} />
                        <small>{form.tipo === 'porcentaje' ? '%' : 'partes'} · {d ? mostrarMontoGrupo(d.monto_asignado) : '—'}</small>
                      </div>}
              </li>
            )
          })}
        </ul>
        {form.tipo !== 'equitativa' && total > 0 && (
          <small className={diferencia === 0 ? 'hint pos' : 'hint neg'}>
            {form.tipo === 'porcentaje' && `Porcentajes: ${miembros.reduce((s, m) => s + (Number(proporciones[m.id]) || 0), 0)}%. `}
            {diferencia === 0 ? 'La división cuadra con el total.' : diferencia > 0 ? `Faltan ${mostrarMontoGrupo(diferencia / 100)} por asignar.` : `Te pasaste por ${mostrarMontoGrupo(-diferencia / 100)}.`}
          </small>
        )}
      </div>
      <div className="field">
        <span className="label">Artículos <span className="muted">(opcional)</span></span>
        {articulos.map((articulo, index) => (
          <div className="form-row" key={index}>
            <input aria-label="Descripción del artículo" placeholder="Artículo" value={articulo.descripcion}
              onChange={e => setArticulos(items => items.map((item, i) => i === index ? { ...item, descripcion: e.target.value } : item))} />
            <input aria-label="Cantidad" type="number" min="0.001" step="any" placeholder="Cantidad" value={articulo.cantidad}
              onChange={e => setArticulos(items => items.map((item, i) => i === index ? { ...item, cantidad: e.target.value } : item))} />
            <input aria-label="Monto del artículo" type="number" min="0.01" step="any" placeholder={`Monto ${form.moneda}`} value={articulo.monto}
              onChange={e => setArticulos(items => items.map((item, i) => i === index ? { ...item, monto: e.target.value } : item))} />
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setArticulos(items => items.filter((_, i) => i !== index))}>Quitar</button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setArticulos(items => [...items, { descripcion: '', cantidad: '1', monto: '' }])}>Agregar artículo</button>
      </div>
    </form>
  )
}
