import { useMemo, useState } from 'react'
import { financeApi } from '../services/financeApi'
import { useData } from '../utils/useData'
import { analizar } from '../utils/analitica'
import { calcularKpis } from '../utils/kpis'
import { categoria, money, moneyShort, monthLabel, shortDate } from '../utils/format'
import { Alert, Chips, Empty, Loader, PageHeader } from '../components/ui'
import Icon from '../components/Icon'

/* ------------------------------------------------------------------ */
/* Gráfico de barras: histórico + proyección                           */
/* ------------------------------------------------------------------ */

function Barras({ serie, proyeccion }) {
  const datos = [...serie, ...proyeccion]
  const max = Math.max(...datos.map(d => d.total)) || 1
  return (
    <div className="chart">
      {datos.map(d => (
        <div key={d.periodo} className={`chart-col${d.estimado ? ' chart-col-est' : ''}`}>
          <span className="chart-value">{moneyShort(d.total)}</span>
          <div className="chart-bar" style={{ height: `${Math.max((d.total / max) * 100, 2)}%` }} />
          <span className="chart-label">{d.periodo.slice(5)}/{d.periodo.slice(2, 4)}</span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Distribución por categoría                                          */
/* ------------------------------------------------------------------ */

function Distribucion({ datos, total }) {
  return (
    <ul className="list">
      {datos.map(([id, monto]) => {
        const c = categoria(id)
        const pct = (monto / total) * 100
        return (
          <li key={id} className="dist-row">
            <span className="tile-icon"><Icon name={c.icon} size={16} /></span>
            <div className="list-main">
              <strong className="list-title">{c.label}</strong>
              <div className="dist-track"><i style={{ width: `${pct}%` }} /></div>
            </div>
            <div className="dist-end">
              <strong>{money(monto)}</strong>
              <small>{pct.toFixed(1)} %</small>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/* ------------------------------------------------------------------ */
/* KPIs básicos                                                        */
/* ------------------------------------------------------------------ */

const ESTADOS = { ok: 'En meta', alerta: 'Atención', critico: 'Fuera de meta', neutro: 'Informativo' }

function formatear(valor, formato) {
  if (valor === null || valor === undefined) return '—'
  if (formato === 'money') return money(valor)
  if (formato === 'pct') return `${valor.toFixed(1).replace('.', ',')} %`
  if (formato === 'dias') return `${valor.toFixed(1).replace('.', ',')} días`
  return String(Math.round(valor))
}

function Tendencia({ kpi, mesAnterior }) {
  if (kpi.anterior === undefined) return null
  if (kpi.variacion === null) return <span className="kpi-trend flat">Sin datos de {mesAnterior} para comparar</span>
  const v = kpi.variacion
  const dir = Math.abs(v) < 0.5 ? 'flat' : v > 0 ? 'up' : 'down'
  // En gasto, subir es malo (rojo); en conteos solo se informa la dirección.
  const cls = kpi.invertido ? dir : 'flat'
  const flecha = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '='
  return (
    <span className={`kpi-trend ${cls}`}>
      {flecha} {Math.abs(v).toFixed(1).replace('.', ',')} % vs {mesAnterior} ({formatear(kpi.anterior, kpi.formato)})
    </span>
  )
}

function Kpis({ resultado }) {
  const { kpis, periodo, resumen } = resultado
  const mesAnterior = monthLabel(`${periodo.anterior.periodo}-01`).split(' ')[0].toLowerCase()
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">KPIs básicos</h2>
        <span className="pill">{monthLabel(`${periodo.actual.periodo}-01`)} · día {periodo.dia}</span>
      </div>

      <div className="kpi-grid">
        {kpis.map(k => (
          <article key={k.id} className={`kpi kpi-${k.estado}`}>
            <div className="kpi-head">
              <span className="kpi-name">{k.nombre}</span>
              <span className={`dot dot-${k.estado}`} title={ESTADOS[k.estado]} aria-label={ESTADOS[k.estado]} />
            </div>
            <strong className="kpi-value">{formatear(k.valor, k.formato)}</strong>
            <Tendencia kpi={k} mesAnterior={mesAnterior} />
            {k.detalle && <span className="kpi-sub">{k.detalle}</span>}
            {k.meta && <span className="kpi-meta">Meta: {k.meta}</span>}
          </article>
        ))}
      </div>

      <div className="kpi-legend">
        <span><i className="dot dot-ok" />En meta</span>
        <span><i className="dot dot-alerta" />Atención</span>
        <span><i className="dot dot-critico" />Fuera de meta</span>
        <span><i className="dot" />Informativo</span>
        <span>· {resumen.grupos_con_gasto_mes} de {resumen.grupos_activos} grupos con gastos este mes</span>
      </div>

      <details className="card kpi-formulas" style={{ marginTop: 14 }}>
        <summary>¿Cómo se calcula cada KPI?</summary>
        <table className="table table-keep" style={{ marginTop: 10 }}>
          <thead><tr><th>KPI</th><th>Fórmula</th></tr></thead>
          <tbody>
            {kpis.map(k => (
              <tr key={k.id}><td><strong>{k.nombre}</strong></td><td><small className="muted">{k.formula}</small></td></tr>
            ))}
          </tbody>
        </table>
        <p className="hint">
          El mes en curso se compara con el mes anterior hasta el mismo día, para que un mes que
          apenas empieza no parezca más bajo de lo que es.
        </p>
      </details>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

export default function Analisis({ user }) {
  const me = String(user.id)
  const { data, error, loading } = useData(
    async () => ({ gastos: await financeApi.expenses(user), grupos: await financeApi.groups(user) }),
    [user.id],
  )
  const [grupo, setGrupo] = useState('todos')
  const [horizonte, setHorizonte] = useState('3')

  const gastos = useMemo(
    () => (data?.gastos || []).filter(g => grupo === 'todos' || g.grupo_id === grupo),
    [data, grupo],
  )

  const kpis = useMemo(() => {
    const grupos = (data?.grupos || []).filter(g => grupo === 'todos' || g.id === grupo)
    return calcularKpis(gastos, grupos, me)
  }, [data, gastos, grupo, me])

  const analisis = useMemo(
    () => (gastos.length ? analizar(gastos, me, { horizonte: Number(horizonte) }) : null),
    [gastos, me, horizonte],
  )

  if (loading) return <Loader />
  if (error) return <Alert>{error}</Alert>

  if (!analisis) {
    return (
      <>
        <PageHeader title="Análisis y predicciones" />
        <Empty icon="chart" title="Sin datos para analizar"
          text="Registra gastos para que el sistema calcule indicadores y proyecciones." />
      </>
    )
  }

  const { indicadores: ind, estimadores: est } = analisis
  const opcionesGrupo = [{ id: 'todos', label: 'Todos' },
    ...(data.grupos || []).map(g => ({ id: g.id, label: g.nombre }))]

  const flecha = est.tendencia === 'creciente' ? '▲' : est.tendencia === 'decreciente' ? '▼' : '='
  const avance = est.consenso ? (est.acumulado / est.consenso) * 100 : 0

  return (
    <>
      <PageHeader
        title="Análisis y predicciones"
        subtitle={`${ind.num_gastos} gastos analizados · ${ind.serie.length} meses de histórico`} />

      <div className="filters">
        <Chips label="Grupo" options={opcionesGrupo} value={grupo} onChange={setGrupo} />
        <Chips label="Proyectar" value={horizonte} onChange={setHorizonte}
          options={[{ id: '3', label: '3 meses' }, { id: '6', label: '6 meses' }]} />
      </div>

      <Kpis resultado={kpis} />

      {/* ---------------- Indicadores principales ---------------- */}
      <h2 className="section-title" style={{ marginTop: 28 }}>Indicadores</h2>
      <div className="stats">
        <div className="stat">
          <span className="stat-label">Gasto mensual promedio</span>
          <strong className="stat-value">{money(ind.gasto_mensual_promedio)}</strong>
          <small>Sobre {ind.serie.length} meses</small>
        </div>
        <div className="stat">
          <span className="stat-label">Ticket promedio</span>
          <strong className="stat-value">{money(ind.ticket_promedio)}</strong>
          <small>Mediana {money(ind.ticket_mediano)}</small>
        </div>
        <div className="stat">
          <span className="stat-label">Cumplimiento de pago</span>
          <strong className={`stat-value ${ind.indice_cumplimiento >= 80 ? 'pos' : 'neg'}`}>
            {ind.indice_cumplimiento.toFixed(1)} %
          </strong>
          <small>{ind.dias_liquidacion === null ? 'Sin pagos registrados'
            : `${ind.dias_liquidacion.toFixed(1)} días para saldar`}</small>
        </div>
      </div>

      {/* ---------------- Proyección ---------------- */}
      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Proyección de gasto</h2>
          <span className={`pill ${est.tendencia === 'creciente' ? 'neg' : 'pos'}`}>
            {flecha} Tendencia {est.tendencia}
          </span>
        </div>

        <div className="card">
          <div className="proj-head">
            <div>
              <span className="eyebrow">
                {monthLabel(`${est.periodo_en_curso}-01`)} · {est.mes_abierto ? 'en curso' : 'estimado'}
              </span>
              <strong className="total-big accent">{money(est.consenso)}</strong>
              <small className="muted">
                {est.mes_abierto
                  ? `Llevas ${money(est.acumulado)} (${avance.toFixed(0)} % de lo proyectado) en ${est.dias_transcurridos} de ${est.dias_del_mes} días`
                  : 'Todavía no hay gastos registrados este mes: la estimación se basa solo en el histórico.'}
              </small>
            </div>
          </div>

          <table className="table table-keep">
            <thead>
              <tr><th>Método</th><th>Estimación</th><th className="hide-sm">Cómo se calcula</th></tr>
            </thead>
            <tbody>
              {est.metodos.map(m => {
                const ignorado = m.id === 'regresion' && !est.usa_regresion
                return (
                  <tr key={m.id} className={ignorado ? 'muted' : ''}>
                    <td><strong>{m.nombre}</strong>{ignorado && <small className="muted"> · descartado</small>}</td>
                    <td className="amount">{money(m.valor)}</td>
                    <td className="hide-sm"><small className="muted">{m.nota}</small></td>
                  </tr>
                )
              })}
              <tr>
                <td><strong>Consenso</strong></td>
                <td className="amount accent"><strong>{money(est.consenso)}</strong></td>
                <td className="hide-sm"><small className="muted">Promedio de los métodos aplicables</small></td>
              </tr>
            </tbody>
          </table>

          {!est.usa_regresion && (
            <p className="hint">
              El ajuste lineal es bajo (R² = {est.r2.toFixed(3)}): la serie no tiene una tendencia
              sostenida, sino un patrón estacional. Por eso la regresión se excluye del consenso.
            </p>
          )}
        </div>
      </section>

      {/* ---------------- Serie y proyección ---------------- */}
      <section className="section">
        <h2 className="section-title">Histórico y meses proyectados</h2>
        <div className="card">
          <Barras serie={ind.serie} proyeccion={est.proyeccion} />
          <p className="hint">
            Las barras claras son meses proyectados, ajustados por el índice estacional
            de cada mes calendario.
          </p>
        </div>
      </section>

      {/* ---------------- Distribución y detalle ---------------- */}
      <div className="dash-grid">
        <section className="section">
          <h2 className="section-title">Distribución por categoría</h2>
          <Distribucion datos={ind.por_categoria} total={ind.gasto_total} />
        </section>

        <section className="section">
          <h2 className="section-title">Otros indicadores</h2>
          <div className="card">
            <dl className="kv-grid">
              <div className="kv">
                <dt>Frecuencia de gasto</dt>
                <dd>{ind.frecuencia_semanal.toFixed(1)} por semana</dd>
              </div>
              <div className="kv">
                <dt>Concentración de aportes</dt>
                <dd>{(ind.indice_concentracion * 100).toFixed(1)} %</dd>
              </div>
              <div className="kv">
                <dt>Registrado con OCR</dt>
                <dd>{ind.porcentaje_ocr.toFixed(1)} %</dd>
              </div>
              <div className="kv">
                <dt>Tu balance acumulado</dt>
                <dd className={ind.personal.balance < 0 ? 'neg' : 'pos'}>{money(ind.personal.balance)}</dd>
              </div>
              <div className="kv">
                <dt>Has aportado</dt>
                <dd>{money(ind.personal.aportado)}</dd>
              </div>
              <div className="kv">
                <dt>Te ha correspondido</dt>
                <dd>{money(ind.personal.asignado)}</dd>
              </div>
            </dl>
            <p className="hint">
              La concentración mide qué tan repartido está quién pone el dinero:
              0 % es equilibrado, 100 % significa que una sola persona paga todo.
            </p>
          </div>
        </section>
      </div>

      {/* ---------------- Atípicos ---------------- */}
      <section className="section">
        <h2 className="section-title">Gastos atípicos detectados</h2>
        {est.atipicos.length === 0 ? (
          <Empty icon="check" title="Sin valores atípicos"
            text="Ningún gasto se aleja más de dos desviaciones del promedio." />
        ) : (
          <div className="card">
            <table className="table table-keep">
              <thead>
                <tr><th>Gasto</th><th className="hide-sm">Fecha</th><th>Monto</th><th>Desviación</th></tr>
              </thead>
              <tbody>
                {est.atipicos.map(a => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.descripcion}</strong>
                      <small className="muted"> · {a.grupo?.nombre || ''}</small>
                    </td>
                    <td className="hide-sm">{shortDate(a.fecha_gasto)}</td>
                    <td className="amount">{money(a.monto_total)}</td>
                    <td><span className="pill">{a.z > 0 ? '+' : ''}{a.z.toFixed(1)} σ</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">
              Se marcan los gastos que superan dos desviaciones estándar del monto promedio.
              Sirven para revisar cobros inusuales o errores de digitación.
            </p>
          </div>
        )}
      </section>
    </>
  )
}
