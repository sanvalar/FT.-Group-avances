import { useCallback, useEffect, useState } from 'react'
import { Alert, Chips, Empty, Loader, Modal, PageHeader } from '../components/ui'
import Icon from '../components/Icon'
import {
  cambiarEstadoTicket,
  comentarTicket,
  listarBandeja,
  listarMisTickets,
  obtenerTicket,
} from '../services/asistenteApi'

// Los tickets se abren desde el chat de ayuda; esta pantalla es para
// consultarlos y, si el rol lo permite, atenderlos.

const ESTADOS = {
  abierto: { label: 'Abierto', clase: 'abierto' },
  en_revision: { label: 'En revisión', clase: 'revision' },
  resuelto: { label: 'Resuelto', clase: 'resuelto' },
  cerrado: { label: 'Cerrado', clase: 'cerrado' },
}

const PRIORIDADES = {
  alta: { label: 'Alta', clase: 'alta' },
  normal: { label: 'Normal', clase: 'normal' },
  baja: { label: 'Baja', clase: 'baja' },
}

const CATEGORIAS = {
  cuenta: 'Cuenta',
  grupos: 'Grupos',
  gastos: 'Gastos',
  divisiones: 'Divisiones',
  pagos: 'Pagos',
  balances: 'Balances',
  analisis: 'Análisis',
  escaneo: 'Escaneo',
  otro: 'Otro',
}

const FILTROS_ESTADO = [
  { id: '', label: 'Todos' },
  { id: 'abierto', label: 'Abiertos' },
  { id: 'en_revision', label: 'En revisión' },
  { id: 'resuelto', label: 'Resueltos' },
  { id: 'cerrado', label: 'Cerrados' },
]

const SIGUIENTE_ESTADO = {
  abierto: 'en_revision',
  en_revision: 'resuelto',
  resuelto: 'cerrado',
}

function fechaLocal(valor, conHora = false) {
  if (!valor) return 'Sin fecha'
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    ...(conHora ? { timeStyle: 'short' } : {}),
  }).format(fecha)
}

function Etiqueta({ mapa, valor, prefijo }) {
  const dato = mapa[valor]
  if (!dato) return <span className="ticket-tag">{valor}</span>
  return <span className={`ticket-tag ticket-${prefijo}-${dato.clase}`}>{dato.label}</span>
}

export default function Soporte({ user }) {
  const esPersonal = ['moderador', 'supervisor'].includes(user?.rol)

  const [vista, setVista] = useState('mios')
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [tickets, setTickets] = useState([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const [abierto, setAbierto] = useState(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [comentario, setComentario] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorDetalle, setErrorDetalle] = useState('')

  const enBandeja = esPersonal && vista === 'bandeja'

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      if (enBandeja) {
        const data = await listarBandeja({ estado: estadoFiltro })
        setTickets(data.tickets)
        setTotal(data.total)
      } else {
        const propios = await listarMisTickets()
        setTickets(propios)
        setTotal(propios.length)
      }
    } catch (err) {
      setError(err.message || 'No fue posible cargar los casos.')
      setTickets([])
      setTotal(0)
    } finally {
      setCargando(false)
    }
  }, [enBandeja, estadoFiltro])

  useEffect(() => { cargar() }, [cargar])

  async function abrirDetalle(numero) {
    setCargandoDetalle(true)
    setErrorDetalle('')
    setComentario('')
    try {
      const ticket = await obtenerTicket(numero)
      setAbierto(ticket)
    } catch (err) {
      setError(err.message || 'No fue posible abrir el caso.')
    } finally {
      setCargandoDetalle(false)
    }
  }

  async function enviarComentario(event) {
    event.preventDefault()
    const texto = comentario.trim()
    if (!texto || !abierto) return
    setGuardando(true)
    setErrorDetalle('')
    try {
      await comentarTicket(abierto.numero, texto)
      const actualizado = await obtenerTicket(abierto.numero)
      setAbierto(actualizado)
      setComentario('')
    } catch (err) {
      setErrorDetalle(err.message || 'No fue posible enviar el mensaje.')
    } finally {
      setGuardando(false)
    }
  }

  async function moverEstado(estado) {
    if (!abierto) return
    setGuardando(true)
    setErrorDetalle('')
    try {
      await cambiarEstadoTicket(abierto.numero, estado)
      const actualizado = await obtenerTicket(abierto.numero)
      setAbierto(actualizado)
      cargar()
    } catch (err) {
      setErrorDetalle(err.message || 'No fue posible cambiar el estado.')
    } finally {
      setGuardando(false)
    }
  }

  const siguiente = abierto ? SIGUIENTE_ESTADO[abierto.estado] : null
  const cerrado = abierto?.estado === 'cerrado'

  return (
    <>
      <PageHeader
        title="Soporte"
        subtitle={
          esPersonal
            ? 'Casos abiertos desde el chat de ayuda. Como personal de soporte puedes atender los de cualquier usuario.'
            : 'Los casos que has abierto desde el chat de ayuda y el estado en que van.'
        }
        action={
          <button className="btn btn-ghost btn-sm" type="button" onClick={cargar} disabled={cargando}>
            <Icon name="refresh" size={15} />Actualizar
          </button>
        }
      />
      <Alert>{error}</Alert>

      {esPersonal && (
        <Chips
          label="Qué casos ver"
          value={vista}
          onChange={setVista}
          options={[
            { id: 'mios', label: 'Mis casos', icon: 'user' },
            { id: 'bandeja', label: 'Bandeja de soporte', icon: 'ticket' },
          ]}
        />
      )}

      {enBandeja && (
        <div className="ticket-filtros">
          <Chips
            label="Filtrar por estado"
            value={estadoFiltro}
            onChange={setEstadoFiltro}
            options={FILTROS_ESTADO}
          />
          <span className="muted small">{total} {total === 1 ? 'caso' : 'casos'}</span>
        </div>
      )}

      {cargando ? (
        <Loader label="Cargando casos…" />
      ) : tickets.length === 0 ? (
        <Empty
          icon="ticket"
          title={enBandeja ? 'No hay casos con ese filtro.' : 'Todavía no tienes casos.'}
          text={
            enBandeja
              ? 'Prueba con otro estado.'
              : 'Si algo no funciona, cuéntaselo al asistente desde el botón «Ayuda» y te abrirá un caso.'
          }
        />
      ) : (
        <section className="ticket-lista" aria-label="Casos de soporte">
          {tickets.map(ticket => (
            <article className="card ticket-item" key={ticket.numero}>
              <div className="ticket-item-top">
                <span className="ticket-numero">{ticket.numero}</span>
                <Etiqueta mapa={ESTADOS} valor={ticket.estado} prefijo="estado" />
                {ticket.prioridad === 'alta' && (
                  <Etiqueta mapa={PRIORIDADES} valor={ticket.prioridad} prefijo="prioridad" />
                )}
              </div>
              <strong className="ticket-asunto">{ticket.asunto}</strong>
              <div className="ticket-item-meta">
                <span><Icon name="tag" size={14} />{CATEGORIAS[ticket.categoria] ?? ticket.categoria}</span>
                <span><Icon name="file" size={14} />{fechaLocal(ticket.fechaCreacion)}</span>
              </div>
              <button
                className="btn btn-ghost btn-sm ticket-ver"
                type="button"
                onClick={() => abrirDetalle(ticket.numero)}
                disabled={cargandoDetalle}
              >
                Ver caso
              </button>
            </article>
          ))}
        </section>
      )}

      {abierto && (
        <Modal
          title={`Caso ${abierto.numero}`}
          onClose={() => setAbierto(null)}
          footer={
            esPersonal && siguiente ? (
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => moverEstado(siguiente)}
                disabled={guardando}
              >
                Marcar como {ESTADOS[siguiente].label.toLowerCase()}
              </button>
            ) : null
          }
        >
          <div className="ticket-detalle-top">
            <Etiqueta mapa={ESTADOS} valor={abierto.estado} prefijo="estado" />
            <Etiqueta mapa={PRIORIDADES} valor={abierto.prioridad} prefijo="prioridad" />
            <span className="ticket-tag">{CATEGORIAS[abierto.categoria] ?? abierto.categoria}</span>
          </div>

          <h3 className="ticket-detalle-asunto">{abierto.asunto}</h3>
          <p className="ticket-detalle-desc">{abierto.descripcion}</p>
          <p className="muted small">
            Abierto el {fechaLocal(abierto.fechaCreacion, true)}
            {abierto.fechaCierre && ` · cerrado el ${fechaLocal(abierto.fechaCierre, true)}`}
          </p>

          <h4 className="ticket-hilo-titulo">Seguimiento</h4>
          {abierto.mensajes?.length ? (
            <ul className="ticket-hilo">
              {abierto.mensajes.map(mensaje => (
                <li key={mensaje.id} className={`ticket-mensaje ticket-mensaje-${mensaje.autorRol}`}>
                  <span className="ticket-mensaje-autor">
                    {mensaje.autorRol === 'usuario' ? 'Usuario' : 'Soporte'}
                    <small>{fechaLocal(mensaje.fecha, true)}</small>
                  </span>
                  <p>{mensaje.contenido}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Sin mensajes todavía.</p>
          )}

          <Alert>{errorDetalle}</Alert>

          {cerrado ? (
            <p className="muted small">Este caso está cerrado y no admite más mensajes.</p>
          ) : (
            <form className="ticket-responder" onSubmit={enviarComentario}>
              <textarea
                value={comentario}
                onChange={event => setComentario(event.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={esPersonal ? 'Escribe la respuesta al usuario…' : 'Agrega información a tu caso…'}
                aria-label="Mensaje para el caso"
                disabled={guardando}
              />
              <button className="btn btn-primary btn-sm" type="submit" disabled={!comentario.trim() || guardando}>
                {guardando ? 'Enviando…' : 'Enviar'}
              </button>
            </form>
          )}
        </Modal>
      )}
    </>
  )
}
