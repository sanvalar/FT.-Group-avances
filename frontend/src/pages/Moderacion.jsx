import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Loader, PageHeader } from '../components/ui'
import Icon from '../components/Icon'
import { listarBandeja } from '../services/asistenteApi'
import { educationApi } from '../services/educationApi'

const MODULOS = [
  {
    to: '/administracion',
    icon: 'users',
    title: 'Administración de cuentas',
    description: 'Consulta cuentas y gestiona el estado de usuarios estándar.',
    action: 'Abrir administración',
  },
  {
    to: '/soporte',
    icon: 'ticket',
    title: 'Bandeja de soporte',
    description: 'Revisa solicitudes y acompaña los casos que requieren atención.',
    action: 'Atender casos',
  },
  {
    to: '/educacion',
    icon: 'brain',
    title: 'Moderación educativa',
    description: 'Consulta participación agregada y estado de las lecciones.',
    action: 'Revisar academia',
  },
]

export default function Moderacion() {
  const [resumen, setResumen] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vigente = true
    Promise.all([
      educationApi.moderation(),
      listarBandeja({ estado: 'abierto', limite: 1, offset: 0 }),
    ])
      .then(([educacion, soporte]) => {
        if (vigente) setResumen({ educacion, casosAbiertos: soporte.total })
      })
      .catch(err => {
        if (vigente) setError(err.message || 'No fue posible cargar el resumen de moderación.')
      })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [])

  return (
    <>
      <PageHeader
        title="Panel de moderación"
        subtitle="Gestiona cuentas estándar, casos de soporte y seguimiento educativo."
      />
      <Alert>{error}</Alert>

      {cargando ? <Loader label="Cargando resumen de moderación…" /> : resumen && (
        <div className="stats moderation-stats">
          <article className="stat">
            <span className="stat-label">Cuentas activas</span>
            <strong className="stat-value">{resumen.educacion.participantes}</strong>
            <small>Cuentas habilitadas en el sistema</small>
          </article>
          <article className="stat">
            <span className="stat-label">Casos abiertos</span>
            <strong className="stat-value">{resumen.casosAbiertos}</strong>
            <small>Solicitudes pendientes de atención</small>
          </article>
          <article className="stat">
            <span className="stat-label">Progreso educativo</span>
            <strong className="stat-value">{resumen.educacion.participantesConProgreso}</strong>
            <small>Personas con lecciones completadas</small>
          </article>
        </div>
      )}

      <section className="section">
        <h2 className="section-title">Herramientas de moderación</h2>
        <div className="moderation-modules">
          {MODULOS.map(modulo => (
            <Link className="card moderation-module" to={modulo.to} key={modulo.to}>
              <span className="tile-icon"><Icon name={modulo.icon} size={21} /></span>
              <strong>{modulo.title}</strong>
              <span className="muted small">{modulo.description}</span>
              <span className="link">{modulo.action} <Icon name="arrow" size={14} /></span>
            </Link>
          ))}
        </div>
      </section>
      <p className="admin-footnote"><Icon name="shield" size={15} /> El moderador solo puede cambiar el estado de cuentas con rol usuario. Las finanzas individuales y la auditoría están reservadas al supervisor.</p>
    </>
  )
}
