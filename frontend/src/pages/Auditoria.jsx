import { useCallback, useEffect, useState } from 'react'
import { Alert, Loader, PageHeader } from '../components/ui'
import Icon from '../components/Icon'
import { auditoriaApi } from '../services/auditoriaApi'

const PAGE_SIZE = 25
const ROLES = [
  { value: '', label: 'Todos los roles' },
  { value: 'usuario', label: 'Usuario' },
  { value: 'moderador', label: 'Moderador' },
  { value: 'supervisor', label: 'Supervisor' },
]
const METHODS = [
  { value: '', label: 'Todos los métodos' },
  { value: 'GET', label: 'GET · Consulta' },
  { value: 'POST', label: 'POST · Creación' },
  { value: 'PUT', label: 'PUT · Actualización' },
  { value: 'PATCH', label: 'PATCH · Cambio' },
  { value: 'DELETE', label: 'DELETE · Eliminación' },
]
const ACTION_LABELS = {
  INICIO_SESION: 'Inicio de sesión',
  INICIO_SESION_FALLIDO: 'Inicio de sesión rechazado',
  REGISTRO: 'Registro de cuenta',
  panel_consultar: 'Panel consultado (demostración)',
  grupos_consultar: 'Grupos consultados (demostración)',
  historial_consultar: 'Historial consultado (demostración)',
  gastos_consultar: 'Gastos consultados (demostración)',
  grupo_crear: 'Creación de grupo (demostración)',
  miembro_agregar: 'Integrante agregado (demostración)',
  grupo_archivar: 'Grupo archivado (demostración)',
  gasto_crear: 'Gasto registrado (demostración)',
  gasto_eliminar: 'Gasto eliminado (demostración)',
  pago_registrar: 'Pago registrado (demostración)',
  liquidacion_registrar: 'Liquidación registrada (demostración)',
  datos_demo_restaurar: 'Datos de demostración restaurados',
  datos_demo_borrar: 'Datos de demostración borrados',
}

function fechaLocal(value) {
  if (!value) return 'Fecha no disponible'
  const date = new Date(value)
  if (isNaN(date.getTime())) return 'Fecha no disponible'
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function accionLegible(accion) {
  return ACTION_LABELS[accion] || accion
}

export default function Auditoria() {
  const [filters, setFilters] = useState({ buscar: '', rol: '', metodo: '', desde: '', hasta: '' })
  const [applied, setApplied] = useState(filters)
  const [pagina, setPagina] = useState(0)
  const [resultado, setResultado] = useState({ eventos: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await auditoriaApi.list({
        ...applied,
        limite: PAGE_SIZE,
        offset: pagina * PAGE_SIZE,
      })
      setResultado(data)
    } catch (err) {
      setError(err.message || 'No fue posible cargar la auditoría.')
    } finally {
      setLoading(false)
    }
  }, [applied, pagina])

  useEffect(() => { cargar() }, [cargar])

  const submit = event => {
    event.preventDefault()
    setPagina(0)
    setApplied(filters)
  }
  const paginaTotal = Math.max(1, Math.ceil(resultado.total / PAGE_SIZE))

  return (
    <>
      <PageHeader
        title="Auditoría"
        subtitle="Registro cronológico de la actividad de todos los roles. Solo visible para supervisores."
      />
      <Alert>{error}</Alert>

      <section className="audit-summary" aria-live="polite">
        <div className="audit-summary-icon"><Icon name="shield" size={21} /></div>
        <div>
          <strong>{(resultado?.total ?? 0).toLocaleString('es-CO')} eventos encontrados</strong>
          <p>Regla 5W: quién, qué, cuándo, dónde y por qué. Se registran solicitudes autenticadas y acciones de demostración.</p>
        </div>
      </section>

      <form className="audit-filters card" onSubmit={submit}>
        <label className="audit-search">
          <span>Buscar actividad o correo</span>
          <span className="audit-input-icon">
            <Icon name="search" size={17} />
            <input
              value={filters.buscar}
              onChange={event => setFilters(current => ({ ...current, buscar: event.target.value }))}
              placeholder="Ej. gasto, grupos, correo…"
              maxLength={120}
            />
          </span>
        </label>
        <label className="audit-filter-field">
          <span>Rol</span>
          <select value={filters.rol} onChange={event => setFilters(current => ({ ...current, rol: event.target.value }))}>
            {ROLES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="audit-filter-field">
          <span>Método</span>
          <select value={filters.metodo} onChange={event => setFilters(current => ({ ...current, metodo: event.target.value }))}>
            {METHODS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            <option value="LOCAL">Actividad local</option>
          </select>
        </label>
        <label className="audit-filter-field">
          <span>Desde</span>
          <input type="date" value={filters.desde} onChange={event => setFilters(current => ({ ...current, desde: event.target.value }))} />
        </label>
        <label className="audit-filter-field">
          <span>Hasta</span>
          <input type="date" value={filters.hasta} onChange={event => setFilters(current => ({ ...current, hasta: event.target.value }))} />
        </label>
        <button className="btn btn-primary audit-submit" type="submit">
          <Icon name="search" size={16} />Filtrar
        </button>
      </form>

      <section className="audit-results" aria-label="Eventos de auditoría">
        <div className="audit-list-head">
          <div><h2 className="section-title">Actividad reciente</h2><span className="muted small">Más recientes primero</span></div>
          <button className="btn btn-ghost btn-sm" type="button" onClick={cargar} disabled={loading}>
            <Icon name="trend" size={15} />Actualizar
          </button>
        </div>

        {loading ? <Loader label="Cargando actividad…" /> : resultado.eventos.length === 0 ? (
          <div className="card audit-empty">
            <Icon name="file" size={23} />
            <strong>No hay eventos para estos filtros.</strong>
            <span>Prueba con otro periodo o limpia los filtros.</span>
          </div>
        ) : (
          <div className="audit-table-wrap">
            <table className="audit-table">
              <thead>
                <tr><th>Cuándo</th><th>Quién</th><th>Rol</th><th>Qué</th><th>Dónde</th><th>Por qué</th><th>Resultado</th></tr>
              </thead>
              <tbody>
                {resultado.eventos.map(evento => (
                  <tr key={evento.id}>
                    <td className="audit-date">{fechaLocal(evento.fecha)}</td>
                    <td>
                      <strong className="audit-email">{evento.actorEmail}</strong>
                    </td>
                    <td><span className={`admin-role admin-role-${evento.actorRol}`}><Icon name="shield" size={14} />{evento.actorRol}</span></td>
                    <td>
                      <strong className="audit-action">{accionLegible(evento.accion)}</strong>
                      <small className="audit-route">{evento.metodo}</small>
                    </td>
                    <td><small className="audit-route">{evento.ruta}</small></td>
                    <td><small className="audit-reason">{evento.motivo}</small></td>
                    <td><span className={`audit-status ${evento.estadoHttp < 400 ? 'audit-status-ok' : 'audit-status-error'}`}>{evento.estadoHttp}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="audit-cards">
              {resultado.eventos.map(evento => (
                <article className="audit-card" key={evento.id}>
                  <div className="audit-card-top">
                    <span className={`admin-role admin-role-${evento.actorRol}`}><Icon name="shield" size={14} />{evento.actorRol}</span>
                    <span className={`audit-status ${evento.estadoHttp < 400 ? 'audit-status-ok' : 'audit-status-error'}`}>{evento.estadoHttp}</span>
                  </div>
                  <strong className="audit-email">{evento.actorEmail}</strong>
                  <span className="audit-action">{accionLegible(evento.accion)}</span>
                  <small className="audit-route">Dónde: {evento.metodo} · {evento.ruta}</small>
                  <small className="audit-reason">Por qué: {evento.motivo}</small>
                  <small className="muted">{fechaLocal(evento.fecha)}</small>
                </article>
              ))}
            </div>
          </div>
        )}

        {!loading && resultado.total > 0 && (
          <div className="audit-pagination">
            <span className="muted small">
              Página {pagina + 1} de {paginaTotal} · {(resultado?.total ?? 0).toLocaleString('es-CO')} eventos
            </span>
            <div>
              <button className="btn btn-ghost btn-sm" type="button" disabled={pagina === 0} onClick={() => setPagina(actual => actual - 1)}>Anterior</button>
              <button className="btn btn-ghost btn-sm" type="button" disabled={pagina + 1 >= paginaTotal} onClick={() => setPagina(actual => actual + 1)}>Siguiente</button>
            </div>
          </div>
        )}
      </section>
      <p className="admin-footnote"><Icon name="shield" size={15} /> Bitácora de solo lectura. No se almacenan contraseñas, tokens ni contenido de formularios.</p>
    </>
  )
}
