import { useEffect, useState } from 'react'
import { Alert, Empty, Loader, PageHeader } from '../components/ui'
import Icon from '../components/Icon'
import { money } from '../utils/format'
import { supervisionApi } from '../services/supervisionApi'

const PAGE_SIZE = 50

function fecha(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-CO')
}

export default function Supervision() {
  const [usuarios, setUsuarios] = useState([])
  const [usuarioId, setUsuarioId] = useState('')
  const [detalle, setDetalle] = useState(null)
  const [offset, setOffset] = useState(0)
  const [loadingUsuarios, setLoadingUsuarios] = useState(true)
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supervisionApi.users()
      .then(lista => {
        const disponibles = lista.filter(usuario => usuario.estado !== 'inactivo')
        setUsuarios(disponibles)
        if (disponibles.length) setUsuarioId(String(disponibles[0].id))
      })
      .catch(err => setError(err.message || 'No fue posible cargar las cuentas.'))
      .finally(() => setLoadingUsuarios(false))
  }, [])

  useEffect(() => {
    if (!usuarioId) {
      setDetalle(null)
      return
    }
    let vigente = true
    setDetalle(null)
    setLoadingDetalle(true)
    setError('')
    supervisionApi.userFinance(usuarioId, { limite: PAGE_SIZE, offset })
      .then(data => { if (vigente) setDetalle(data) })
      .catch(err => { if (vigente) { setDetalle(null); setError(err.message || 'No fue posible consultar la actividad financiera.') } })
      .finally(() => { if (vigente) setLoadingDetalle(false) })
    return () => { vigente = false }
  }, [usuarioId, offset])

  const cambiarUsuario = event => {
    setUsuarioId(event.target.value)
    setOffset(0)
  }
  const resumen = detalle?.resumen
  const paginacion = detalle?.paginacion
  const pagina = paginacion ? Math.floor(paginacion.offset / paginacion.limite) + 1 : 1
  const paginas = paginacion ? Math.max(1, Math.ceil(paginacion.total / paginacion.limite)) : 1

  return (
    <>
      <PageHeader
        title="Supervisión de usuarios"
        subtitle="Consulta en modo de solo lectura los grupos y la actividad financiera de cada cuenta."
      />
      <Alert>{error}</Alert>

      <section className="card supervision-select">
        <label className="field">
          <span className="label">Cuenta a supervisar</span>
          <select value={usuarioId} onChange={cambiarUsuario} disabled={loadingUsuarios || usuarios.length === 0}>
            {usuarios.length === 0 && <option value="">No hay cuentas disponibles</option>}
            {usuarios.map(usuario => (
              <option key={usuario.id} value={usuario.id}>{usuario.nombre} · {usuario.email}</option>
            ))}
          </select>
        </label>
        <p className="muted small">La consulta no permite modificar grupos, gastos ni pagos.</p>
      </section>

      {loadingUsuarios ? <Loader label="Cargando cuentas…" /> : usuarios.length === 0 ? (
        <Empty icon="users" title="No hay cuentas disponibles" text="Las cuentas inactivas no aparecen en la supervisión financiera." />
      ) : loadingDetalle && !detalle ? <Loader label="Consultando actividad…" /> : detalle && (
        <>
          <div className="stats supervision-stats">
            <article className="stat">
              <span className="stat-label">Grupos</span>
              <strong className="stat-value">{resumen.grupos}</strong>
              <small>Grupos asociados a la cuenta</small>
            </article>
            <article className="stat">
              <span className="stat-label">Gastos relacionados</span>
              <strong className="stat-value">{resumen.gastos}</strong>
              <small>Pagados o asignados al usuario</small>
            </article>
            <article className="stat">
              <span className="stat-label">Monto pagado</span>
              <strong className="stat-value">{money(resumen.montoPagado)}</strong>
              <small>Gastos registrados por el usuario</small>
            </article>
            <article className="stat">
              <span className="stat-label">Pendiente asignado</span>
              <strong className="stat-value">{money(resumen.montoPendiente)}</strong>
              <small>Participaciones aún pendientes</small>
            </article>
          </div>

          <section className="section">
            <div className="section-head">
              <h2 className="section-title">Grupos</h2>
              <span className="muted small">{detalle.usuario.nombre} · {detalle.usuario.email}</span>
            </div>
            {detalle.grupos.length === 0 ? (
              <Empty icon="layers" title="Sin grupos asociados" text="Esta cuenta aún no pertenece a grupos financieros." />
            ) : (
              <div className="supervision-groups">
                {detalle.grupos.map(grupo => (
                  <article className="card supervision-group" key={grupo.id}>
                    <span className="tile-icon"><Icon name="layers" size={19} /></span>
                    <div>
                      <strong>{grupo.nombre}</strong>
                      <small className="muted">{grupo.rol} · {grupo.estado} · desde {fecha(grupo.fechaUnion)}</small>
                    </div>
                    <span className="supervision-group-count">{grupo.numeroGastos} gastos</span>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <div className="section-head">
              <h2 className="section-title">Actividad financiera</h2>
              <span className="muted small">{resumen.gastos} registros relacionados</span>
            </div>
            {detalle.gastos.length === 0 ? (
              <Empty icon="receipt" title="Sin gastos relacionados" text="No hay gastos pagados ni participaciones asignadas a esta cuenta." />
            ) : (
              <>
                <div className="supervision-expenses">
                  {detalle.gastos.map(gasto => (
                    <article className="card supervision-expense" key={gasto.id}>
                      <div className="supervision-expense-main">
                        <strong>{gasto.descripcion}</strong>
                        <small className="muted">{gasto.grupo} · {gasto.categoria} · {fecha(gasto.fechaGasto)}</small>
                        <small className="muted">Pagó: {gasto.pagador}</small>
                      </div>
                      <div className="supervision-expense-amounts">
                        <strong>{money(gasto.montoTotal)}</strong>
                        <small className="muted">
                          {gasto.montoAsignado == null
                            ? 'Registrado por el usuario'
                            : `${money(gasto.montoAsignado)} asignado · ${gasto.estadoPago}`}
                        </small>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="supervision-pagination">
                  <button className="btn btn-ghost btn-sm" disabled={offset === 0 || loadingDetalle}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Anterior</button>
                  <span className="muted small">Página {pagina} de {paginas}</span>
                  <button className="btn btn-ghost btn-sm" disabled={!paginacion || offset + PAGE_SIZE >= paginacion.total || loadingDetalle}
                    onClick={() => setOffset(offset + PAGE_SIZE)}>Siguiente</button>
                </div>
              </>
            )}
          </section>
          <p className="admin-footnote"><Icon name="shield" size={15} /> Vista de solo lectura; el acceso está limitado a supervisores y se verifica en el backend.</p>
        </>
      )}
    </>
  )
}
