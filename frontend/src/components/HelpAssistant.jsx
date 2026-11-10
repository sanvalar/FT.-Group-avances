import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { obtenerRespuestaChatbot, RESPUESTA_SIN_COINCIDENCIA } from '../utils/chatbot'
import { consultarDisponibilidad, enviarMensaje } from '../services/asistenteApi'
import Icon from './Icon'

const WELCOME = {
  role: 'assistant',
  content: '¡Hola! Soy el chatbot de FT. GROUP. Puedo ayudarte con respuestas rápidas sobre cómo usar la aplicación. ¿Qué necesitas saber?',
}
const WELCOME_AGENTE = {
  role: 'assistant',
  content: '¡Hola! Soy el asistente de soporte de FT. GROUP. Cuéntame qué necesitas: puedo guiarte en el uso de la aplicación y, si algo no funciona, dejo tu caso registrado para que el equipo lo revise.',
}
const SUGGESTIONS = [
  '¿Cómo creo un grupo?',
  '¿Cómo divido un gasto?',
  '¿Cómo registro un pago?',
]
const SUGGESTIONS_AGENTE = [
  '¿Cómo divido un gasto?',
  'Un gasto no me cuadra',
  '¿Cómo van mis casos?',
]

// 'faq'   → respuestas locales de preguntas frecuentes (sin servidor)
// 'agente'→ agente de soporte con IA en el backend
const MODO = { faq: 'faq', agente: 'agente' }

export default function HelpAssistant() {
  const [open, setOpen] = useState(false)
  const [modo, setModo] = useState(MODO.faq)
  const [messages, setMessages] = useState([WELCOME])
  const [draft, setDraft] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [degradado, setDegradado] = useState(false)
  const conversacionId = useRef(undefined)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const comprobado = useRef(false)

  // Se consulta una sola vez, al abrir el panel: si el backend no tiene el
  // asistente configurado se mantiene el chatbot local sin avisar de nada.
  useEffect(() => {
    if (!open || comprobado.current) return
    comprobado.current = true
    let vigente = true
    consultarDisponibilidad()
      .then(disponible => {
        if (!vigente || !disponible) return
        setModo(MODO.agente)
        setMessages(current => (current.length === 1 ? [WELCOME_AGENTE] : current))
      })
      .catch(() => {})
    return () => { vigente = false }
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    if (!enviando) inputRef.current?.focus()
  }, [messages, open, enviando])

  const send = useCallback(async (text) => {
    const question = (text ?? draft).trim()
    if (!question || enviando) return

    setDraft('')
    setMessages(current => [...current, { role: 'user', content: question }])

    if (modo === MODO.faq) {
      setMessages(current => [...current, { role: 'assistant', content: obtenerRespuestaChatbot(question) }])
      return
    }

    setEnviando(true)
    try {
      const data = await enviarMensaje(question, conversacionId.current)
      conversacionId.current = data.conversacionId
      setDegradado(false)
      setMessages(current => [
        ...current,
        { role: 'assistant', content: data.respuesta, ticket: data.ticket ?? null },
      ])
    } catch {
      // Si el agente no responde (sin red, sin saldo, servidor caído), se
      // contesta con el chatbot local en lugar de dejar al usuario sin
      // respuesta.
      setDegradado(true)
      setMessages(current => [...current, { role: 'assistant', content: obtenerRespuestaChatbot(question) }])
    } finally {
      setEnviando(false)
    }
  }, [draft, enviando, modo])

  const sugerencias = modo === MODO.agente ? SUGGESTIONS_AGENTE : SUGGESTIONS
  const ultimo = messages.at(-1)
  const mostrarSugerencias = !enviando && (
    messages.length === 1 || ultimo?.content === RESPUESTA_SIN_COINCIDENCIA
  )

  return (
    <div className="help-assistant">
      {open && (
        <section className="assistant-panel" role="dialog" aria-label="Asistente de soporte">
          <header className="assistant-head">
            <span className="assistant-mark"><Icon name="sparkles" size={18} /></span>
            <span className="assistant-heading">
              <strong>{modo === MODO.agente ? 'Soporte FT. GROUP' : 'Chatbot FT. GROUP'}</strong>
              <small>
                {modo === MODO.agente
                  ? 'Asistente de soporte · puede registrar tu caso'
                  : 'Ayuda rápida · respuestas automáticas'}
              </small>
            </span>
            <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Cerrar asistente">
              <Icon name="close" />
            </button>
          </header>

          <div className="assistant-messages" ref={listRef} aria-live="polite">
            {/* Fragment en lugar de un div para que cada <p> siga siendo hijo
                directo del contenedor flex y conserve su alineación. */}
            {messages.map((message, index) => (
              <Fragment key={`${index}-${message.role}`}>
                <p className={`assistant-message assistant-${message.role}`}>
                  {message.content}
                </p>
                {message.ticket && (
                  <p className="assistant-ticket">
                    <Icon name="check" size={14} />
                    {' '}Caso <strong>{message.ticket.numero}</strong> registrado · prioridad {message.ticket.prioridad}
                  </p>
                )}
              </Fragment>
            ))}
            {enviando && (
              <p className="assistant-message assistant-assistant assistant-typing" aria-label="El asistente está escribiendo">
                Escribiendo…
              </p>
            )}
            {mostrarSugerencias && (
              <div className="assistant-suggestions">
                {sugerencias.map(suggestion => (
                  <button key={suggestion} type="button" onClick={() => send(suggestion)}>{suggestion}</button>
                ))}
              </div>
            )}
          </div>

          <form className="assistant-form" onSubmit={event => { event.preventDefault(); send() }}>
            <textarea
              ref={inputRef}
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  send()
                }
              }}
              maxLength={500}
              rows={2}
              disabled={enviando}
              placeholder={enviando ? 'Esperando respuesta…' : 'Escribe tu pregunta…'}
              aria-label="Escribe tu pregunta"
            />
            <button
              className="btn btn-primary assistant-send"
              type="submit"
              disabled={!draft.trim() || enviando}
              aria-label="Enviar pregunta"
            >
              <Icon name="arrow" size={17} />
            </button>
          </form>
          <p className="assistant-disclaimer">
            {degradado
              ? 'Sin conexión con soporte: respondiendo con las preguntas frecuentes.'
              : modo === MODO.agente
                ? 'Soporte sobre el uso de la aplicación. No consulta tus saldos ni tus gastos.'
                : 'Chatbot de preguntas frecuentes; no accede a tus datos.'}
          </p>
        </section>
      )}
      <button
        className={`assistant-toggle${open ? ' assistant-toggle-open' : ''}`}
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-label={open ? 'Cerrar asistente de ayuda' : 'Abrir asistente de ayuda'}
        aria-expanded={open}
      >
        <Icon name={open ? 'close' : 'sparkles'} size={21} />
        <span>{open ? 'Cerrar' : 'Ayuda'}</span>
      </button>
    </div>
  )
}
