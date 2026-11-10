import { useCallback, useEffect, useState } from 'react'
import { Alert, Loader, PageHeader } from '../components/ui'
import Icon from '../components/Icon'
import { estadoSistemaApi } from '../services/estadoSistemaApi'

function EstadoItem({ title, status, detail }) {
  const disponible = status === 'operativo' || status === 'operativa'
  return (
    <article className="stat">
      <span className="stat-label">{title}</span>
      <strong className="stat-value">{status || 'Sin datos'}</strong>
      <small>{detail || (disponible ? 'Servicio disponible' : 'Sin información reciente')}</small>
    </article>
  )
}

export default function EstadoSistema() {
  const [estado, setEstado] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setEstado(await estadoSistemaApi.consultar())
    } catch (err) {
      setEstado(err.details?.estado ? err.details : null)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  return (
    <>
      <PageHeader
        title="Estado del sistema"
        subtitle="Disponibilidad de la API y su conexión con la base de datos."
        action={
          <button className="btn btn-ghost btn-sm" type="button" onClick={cargar} disabled={loading}>
            <Icon name="shield" size={16} />Actualizar
          </button>
        }
      />
      <Alert>{error}</Alert>
      {loading && !estado ? <Loader label="Consultando estado…" /> : (
        <>
          <div className="stats">
            <EstadoItem title="Estado general" status={estado?.estado} />
            <EstadoItem title="API" status={estado?.servicios?.api?.estado} />
            <EstadoItem
              title="Base de datos"
              status={estado?.servicios?.baseDatos?.estado}
              detail={estado?.servicios?.baseDatos?.latenciaMs != null
                ? `Respuesta en ${estado.servicios.baseDatos.latenciaMs} ms`
                : undefined}
            />
          </div>
          {estado && (
            <section className="section card">
              <h2 className="card-title">Información operativa</h2>
              <p>Tiempo activo: {estado.uptimeSegundos} segundos</p>
              <p className="muted small">
                Última comprobación: {estado.actualizadoEn && !isNaN(new Date(estado.actualizadoEn).getTime())
                  ? new Date(estado.actualizadoEn).toLocaleString()
                  : new Date().toLocaleString()}
              </p>
            </section>
          )}
        </>
      )}
    </>
  )
}
