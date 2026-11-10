import { useMemo, useState } from 'react'
import { financeApi } from '../services/financeApi'
import { useData } from '../utils/useData'
import { CATEGORIAS, categoria, money } from '../utils/format'
import { splitEqual } from '../utils/balances'
import { formatGroupAmount } from '../utils/currency'
import { Alert, Chips, Empty, Loader } from '../components/ui'
import Icon from '../components/Icon'
import { useI18n } from '../i18n/I18nContext'

const TIPOS = {
  grupo_creado: { icon: 'layers', label: 'Grupo creado' },
  gasto_creado: { icon: 'receipt', label: 'Gasto registrado' },
  gasto_editado: { icon: 'receipt', label: 'Gasto editado' },
  gasto_eliminado: { icon: 'trash', label: 'Gasto eliminado' },
  pago_registrado: { icon: 'check', label: 'Pago registrado' },
  miembro_agregado: { icon: 'users', label: 'Nuevo integrante' },
  miembro_expulsado: { icon: 'users', label: 'Integrante retirado' },
}

const fechaHora = f => new Date(f).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

function parsearCSV(texto, t) {
  const normalizado = texto.replace(/^\uFEFF/, '')
  const primeraLinea = normalizado.split(/\r?\n/, 1)[0]
  const delimitador = (primeraLinea.match(/;/g) || []).length > (primeraLinea.match(/,/g) || []).length ? ';' : ','
  const filas = []
  let fila = [], campo = '', entreComillas = false
  for (let i = 0; i < normalizado.length; i += 1) {
    const caracter = normalizado[i]
    if (caracter === '"' && entreComillas && normalizado[i + 1] === '"') {
      campo += '"'; i += 1
    } else if (caracter === '"') entreComillas = !entreComillas
    else if (!entreComillas && caracter === delimitador) {
      fila.push(campo); campo = ''
    } else if (!entreComillas && (caracter === '\n' || caracter === '\r')) {
      if (caracter === '\r' && normalizado[i + 1] === '\n') i += 1
      fila.push(campo); campo = ''
      if (fila.some(valor => valor.trim())) filas.push(fila)
      fila = []
    } else campo += caracter
  }
  if (entreComillas) throw new Error(t('csv_unclosed_quotes'))
  fila.push(campo)
  if (fila.some(valor => valor.trim())) filas.push(fila)
  if (filas.length < 2) throw new Error(t('csv_missing_rows'))
  const cabeceras = filas[0].map(valor => valor.trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  const indice = aliases => cabeceras.findIndex(valor => aliases.includes(valor))
  const columnas = {
    descripcion: indice(['descripcion', 'description', 'concepto', 'merchant']),
    fecha: indice(['fecha', 'date', 'transaction date']),
    monto: indice(['monto', 'amount', 'valor']),
    categoria: indice(['categoria', 'category']),
  }
  if (Object.values(columnas).some(index => index < 0)) {
    throw new Error(t('csv_missing_headers'))
  }
  return filas.slice(1).map((valores, index) => {
    const montoRaw = (valores[columnas.monto] || '').trim().replace(/\s/g, '')
    const ultimoPunto = montoRaw.lastIndexOf('.')
    const ultimaComa = montoRaw.lastIndexOf(',')
    const separadorDecimal = ultimoPunto > ultimaComa ? '.' : ultimaComa > ultimoPunto ? ',' : ''
    const montoTexto = separadorDecimal
      ? montoRaw.replace(/[.,]/g, (separador, posicion) => posicion === (separadorDecimal === '.' ? ultimoPunto : ultimaComa) ? '.' : '')
      : montoRaw
    const fechaRaw = (valores[columnas.fecha] || '').trim()
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(fechaRaw) ? fechaRaw
      : /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.test(fechaRaw)
        ? (() => { const [, dia, mes, anio] = fechaRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}` })()
        : ''
    const monto = Number(montoTexto)
    const descripcion = (valores[columnas.descripcion] || '').trim()
    const categoria = (valores[columnas.categoria] || '').trim() || 'otro'
    const fechaValida = fecha && !Number.isNaN(new Date(`${fecha}T00:00:00Z`).getTime())
      && new Date(`${fecha}T00:00:00Z`).toISOString().slice(0, 10) === fecha
    return {
      index,
      descripcion,
      fecha,
      monto,
      categoria,
      error: !descripcion ? t('csv_missing_description') : !fechaValida ? t('csv_invalid_date') :
        !Number.isFinite(monto) || monto <= 0 || Math.abs(monto * 100 - Math.round(monto * 100)) > 0.000001
          ? t('csv_invalid_amount') : '',
    }
  })
}

async function idempotencyUuid(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function Estado({ g }) {
  const { t } = useI18n()
  if (g.mi_estado === 'pendiente') return <small className="neg">{t('history_you_owe', { amount: money(g.mi_parte) })}</small>
  if (g.mi_estado === 'pagador' && g.me_deben > 0) return <small className="pos">{t('history_they_owe_you', { amount: money(g.me_deben) })}</small>
  return <small className="pos">{t('settled')}</small>
}

export default function History({ user }) {
  const { t, formatMonth, getCategoryLabel } = useI18n()
  const { data, error, loading } = useData(
    async () => {
      const [gastos, grupos, movimientos] = await Promise.all([
        financeApi.expenses(user), financeApi.groups(user), financeApi.history(user),
      ])
      return { gastos, grupos, movimientos }
    }, [user.id])
  const [grupo, setGrupo] = useState('todos')
  const [cat, setCat] = useState('todos')
  const [query, setQuery] = useState('')
  const [csvRows, setCsvRows] = useState([])
  const [csvGroup, setCsvGroup] = useState('')
  const [csvError, setCsvError] = useState('')
  const [csvErrorType, setCsvErrorType] = useState('error')
  const [csvBusy, setCsvBusy] = useState(false)

  const filtrados = useMemo(() => (data?.gastos || []).filter(g =>
    (grupo === 'todos' || g.grupo_id === grupo)
    && (cat === 'todos' || g.categoria === cat)
    && (!query.trim() || [
      g.descripcion, g.categoria, g.grupo?.nombre, g.pagador?.nombre,
      ...(g.articulos || []).map(item => item.descripcion),
    ].some(value => String(value || '').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))),
  ), [data, grupo, cat, query])

  const porMes = useMemo(() => {
    const map = new Map()
    for (const g of filtrados) {
      const k = g.fecha_gasto.slice(0, 7)
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(g)
    }
    return [...map.entries()]
  }, [filtrados])

  if (loading) return <Loader />
  if (error) return <Alert>{error}</Alert>

  const total = filtrados.reduce((s, g) => s + g.monto_total * (g.tasa_cop || 1), 0)
  const importarCSV = async file => {
    setCsvError('')
    setCsvErrorType('error')
    try {
      if (!file || file.size > 2 * 1024 * 1024) throw new Error(t('csv_size_limit'))
      const filas = parsearCSV(await file.text(), t)
      if (filas.length > 100) throw new Error(t('csv_row_limit'))
      setCsvRows(filas)
      setCsvGroup(data.grupos[0]?.id || '')
    } catch (error) {
      setCsvRows([])
      setCsvError(error.message)
    }
  }
  const guardarCSV = async () => {
    const grupoSeleccionado = data.grupos.find(g => String(g.id) === String(csvGroup))
    const validas = csvRows.filter(row => !row.error)
    if (!grupoSeleccionado || validas.length === 0) return setCsvError(t('csv_choose_group_error'))
    setCsvBusy(true)
    let guardadas = 0
    let enCola = 0
    try {
      for (const row of validas) {
        const partes = splitEqual(Math.round(row.monto * 100), grupoSeleccionado.miembros.map(m => m.id))
          .map(parte => ({ ...parte, monto_asignado: parte.monto_asignado / 100 }))
        const solicitudId = await idempotencyUuid(`${user.id}|${csvGroup}|${row.index}|${row.fecha}|${row.descripcion}|${row.monto}|${row.categoria}`)
        const resultado = await financeApi.createExpense(user, {
          grupo_id: csvGroup,
          pagador_id: String(user.id),
          descripcion: row.descripcion,
          monto_total: row.monto,
          monto_original: row.monto,
          moneda_original: grupoSeleccionado.moneda || 'COP',
          tasa_cambio: 1,
          fecha_gasto: row.fecha,
          categoria: row.categoria,
          tipo_division: 'equitativa',
          divisiones: partes,
          articulos: [],
          origen_registro: 'manual',
          solicitud_id: solicitudId,
        })
        if (resultado?.queued) enCola += 1
        else guardadas += 1
      }
      setCsvRows([])
      setCsvError(t('csv_import_success', { imported: guardadas, queued: enCola }))
      setCsvErrorType(enCola ? 'warning' : 'success')
    } catch (error) {
      setCsvError(t('csv_import_error', { imported: guardadas, queued: enCola, error: error.message }))
      setCsvErrorType('error')
    } finally {
      setCsvBusy(false)
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">{t('history_title')}</h1>
          <p className="page-subtitle">{t('history_subtitle')} <strong className="accent total-big">{money(total)}</strong></p>
        </div>
      </header>

      <div className="filters">
        <input aria-label={t('history_search')} type="search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder={t('history_search')} />
        <label className="select-chip">
          <Icon name="layers" size={15} />
          <select value={grupo} onChange={e => setGrupo(e.target.value)} aria-label={t('filter_all_groups')}>
            <option value="todos">{t('filter_all_groups')}</option>
            {data.grupos.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
        </label>
        <Chips label={t('filter_by_category')} value={cat} onChange={setCat}
          options={[{ id: 'todos', label: t('filter_all') }, ...CATEGORIAS.map(c => ({ id: c.id, label: getCategoryLabel(c.id) }))]} />
      </div>
      <section className="section">
        <h2 className="section-title">{t('history_import_title')}</h2>
        <p className="muted">{t('history_import_hint')}</p>
        <input type="file" accept=".csv,text/csv" aria-label={t('history_choose_file')} onChange={e => importarCSV(e.target.files?.[0])} />
        <Alert type={csvErrorType}>{csvError}</Alert>
        {csvRows.length > 0 && (
          <div className="form">
            <label className="field">{t('history_import_group')}
              <select value={csvGroup} onChange={e => setCsvGroup(e.target.value)}>
                {data.grupos.map(g => <option key={g.id} value={g.id}>{g.nombre} · {g.moneda || 'COP'}</option>)}
              </select>
            </label>
            <ul className="list">
              {csvRows.map(row => (
                <li key={row.index} className="list-row">
                  <span className="list-main">{row.descripcion} · {row.fecha} · {row.monto}
                    <small className={row.error ? 'neg' : 'muted'}>{row.error || row.categoria}</small>
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-primary" disabled={csvBusy || !csvRows.some(row => !row.error)} onClick={guardarCSV}>
            {csvBusy ? t('history_importing') : t('history_import_valid', { count: csvRows.filter(row => !row.error).length })}
            </button>
          </div>
        )}
      </section>

      {porMes.length === 0 ? (
        <Empty icon="chart" title={t('history_empty_title')} text={t('history_empty_desc')} />
      ) : porMes.map(([mes, items]) => (
        <section key={mes} className="month">
          <div className="month-head">
            <span>{formatMonth(`${mes}-01`)}</span>
            <span>{money(items.reduce((s, g) => s + g.monto_total * (g.tasa_cop || 1), 0))}</span>
          </div>
          <ul className="card list-card">
            {items.map(g => (
              <li key={g.id} className="list-row">
                <span className="tile-icon sm cat"><Icon name={categoria(g.categoria).icon} size={18} /></span>
                <div className="list-main">
                  <span className="list-title">{g.descripcion}</span>
                  <small className="muted">{g.grupo?.nombre} · {g.fecha_gasto} · {t('history_persons_count', { count: g.personas })}</small>
                </div>
                <div className="list-end stacked">
                  <strong>{formatGroupAmount(g.monto_total, g.grupo)}</strong>
                  <Estado g={g} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {data.movimientos.length > 0 && (
        <section className="month">
          <div className="month-head"><span>{t('history_recent')}</span></div>
          <ul className="card list-card">
            {data.movimientos.slice(0, 20).map(m => {
              const t = TIPOS[m.tipo_movimiento] || TIPOS.gasto_creado
              return (
                <li key={m.id} className="list-row">
                  <span className="tile-icon sm"><Icon name={t.icon} size={16} /></span>
                  <div className="list-main">
                    <span className="list-title">{m.descripcion || t.label}</span>
                    <small className="muted">{m.grupo?.nombre} · {String(m.usuario?.id) === String(user.id) ? 'Tú' : m.usuario?.nombre} · {fechaHora(m.fecha)}</small>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </>
  )
}
