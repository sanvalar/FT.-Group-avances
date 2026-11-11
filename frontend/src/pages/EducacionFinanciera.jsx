import { useEffect, useState } from 'react'
import { Alert, Loader, PageHeader } from '../components/ui'
import { educationApi } from '../services/educationApi'

const RUTAS = {
  esencial: { icon: '◎', label: 'Fundamentos esenciales' },
  grupal: { icon: '◇', label: 'Dinero y acuerdos grupales' },
  habitos: { icon: '↗', label: 'Hábitos sostenibles' },
}

const formatoCOP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

function Quiz({ leccion, onComplete, busy }) {
  const quiz = (leccion.contenido || []).find(b => b.tipo === 'quiz')
  const [respuesta, setRespuesta] = useState(null)
  const [resultado, setResultado] = useState(null)
  if (!quiz) return null
  const enviarRespuesta = async () => {
    const evaluacion = await onComplete(respuesta)
    if (evaluacion) setResultado(evaluacion.aprobada)
  }
  return (
    <section className="card education-quiz">
      <span className="eyebrow">Comprueba lo aprendido</span>
      <h3>{quiz.pregunta}</h3>
      <div className="education-options">
        {quiz.opciones.map((opcion, index) => (
          <button key={opcion} type="button" className={`btn ${respuesta === index ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setRespuesta(index); setResultado(null) }}>{opcion}</button>
        ))}
      </div>
      <button className="btn btn-primary" disabled={respuesta === null || busy}
        onClick={enviarRespuesta}>
        {busy ? 'Guardando…' : 'Enviar respuesta'}
      </button>
      {resultado !== null && (
        <Alert type={resultado ? 'success' : 'warning'}>
          {resultado
            ? 'Aprobaste la evaluación. Tu respuesta fue correcta y se guardó tu progreso.'
            : 'No aprobaste esta evaluación. Revisa la lección e inténtalo de nuevo; necesitas al menos 70%.'}
        </Alert>
      )}
    </section>
  )
}

function ModerationPanel({ moderation, user, busy, onTogglePublication }) {
  return (
    <section className="card education-moderation">
      <span className="eyebrow">{user.rol === 'supervisor' ? 'Control educativo' : 'Moderación educativa'}</span>
      <h2>{user.rol === 'supervisor' ? 'Supervisión de educación financiera' : 'Panel agregado sin datos personales'}</h2>
      <p className="muted">{moderation.participantesConProgreso} participantes tienen progreso; se muestran únicamente indicadores globales.</p>
      <div className="education-lessons">
        {moderation.lecciones.map(leccion => (
          <article className="card" key={leccion.id}>
            <strong>{leccion.titulo}</strong>
            <p className="muted">{leccion.completados} completadas · {leccion.iniciados} iniciadas</p>
            {user.rol === 'supervisor'
              ? <button className="btn btn-secondary" disabled={busy} onClick={() => onTogglePublication(leccion)}>{leccion.publicada ? 'Retirar publicación' : 'Publicar lección'}</button>
              : <small>{leccion.publicada ? 'Disponible para revisión' : 'Retirada por supervisión'}</small>}
          </article>
        ))}
      </div>
    </section>
  )
}

export default function EducacionFinanciera({ user }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState(null)
  const [goalTitle, setGoalTitle] = useState('')
  const [goalAmount, setGoalAmount] = useState('')
  const [contributions, setContributions] = useState({})
  const [notice, setNotice] = useState('')
  const [moderation, setModeration] = useState(null)

  const load = async () => {
    try {
      setError('')
      if (['moderador', 'supervisor'].includes(user?.rol)) {
        setModeration(await educationApi.moderation())
        return
      }
      setData(await educationApi.dashboard())
      if (user?.rol === 'moderador') setModeration(await educationApi.moderation())
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { load() }, [])

  const togglePublication = async leccion => {
    setBusy(true)
    try { await educationApi.publishLesson(leccion.id, !leccion.publicada); await load() }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  const complete = async respuesta => {
    setBusy(true)
    try { const evaluacion = await educationApi.completeLesson(selected.id, respuesta); await load(); return evaluacion }
    catch (e) { setError(e.message); return null }
    finally { setBusy(false) }
  }

  const createGoal = async e => {
    e.preventDefault()
    setError(''); setNotice(''); setBusy(true)
    try {
      await educationApi.createGoal({ titulo: goalTitle, montoObjetivo: Number(goalAmount) })
      setGoalTitle(''); setGoalAmount(''); setNotice('Meta creada. Cuando apartes dinero, registra aquí cada aporte para actualizar el avance.'); await load()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  const registerContribution = async meta => {
    const aporte = Number(contributions[meta.id])
    if (!Number.isFinite(aporte) || aporte <= 0) {
      setError('Ingresa un aporte mayor que cero.')
      return
    }
    setError(''); setNotice(''); setBusy(true)
    try {
      await educationApi.addGoalContribution(meta.id, aporte)
      setContributions(values => ({ ...values, [meta.id]: '' }))
      setNotice(`Aporte de ${formatoCOP.format(aporte)} registrado. La app actualiza el avance, pero no mueve dinero ni se conecta a tu banco.`)
      await load()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  if (['moderador', 'supervisor'].includes(user?.rol)) {
    if (!moderation) return error ? <Alert>{error}</Alert> : <Loader />
    return (
      <>
        <PageHeader
          title={user.rol === 'supervisor' ? 'Control educativo' : 'Moderación educativa'}
          subtitle={user.rol === 'supervisor'
            ? 'Supervisa la publicación y participación global de la academia.'
            : 'Revisa la participación agregada y el estado de las lecciones.'}
        />
        <Alert>{error}</Alert>
        <ModerationPanel moderation={moderation} user={user} busy={busy} onTogglePublication={togglePublication} />
      </>
    )
  }

  if (!data) return error ? <Alert>{error}</Alert> : <Loader />
  const byRoute = Object.keys(RUTAS).map(id => ({
    id,
    ...RUTAS[id],
    lessons: data.lecciones.filter(l => l.ruta === id),
  }))
  const leccionesEsenciales = data.lecciones.filter(leccion => leccion.ruta === 'esencial')
  const fundamentoAprobado = leccionesEsenciales.length > 0 && leccionesEsenciales.every(
    leccion => leccion.estado === 'completada' && Number(leccion.puntaje) >= 70,
  )
  const completed = fundamentoAprobado ? (data.progreso?.completadas || 0) : 0
  const total = data.progreso?.total || 1

  return (
    <div>
      <PageHeader title="Academia FT"
        subtitle="Aprende con decisiones financieras reales, casos prácticos y hábitos medibles." />
      <Alert>{error}</Alert>
      <Alert type={fundamentoAprobado ? 'success' : 'warning'}>
        {fundamentoAprobado
          ? 'Fundamento esencial aprobado. Tu progreso de conocimiento consolidado está habilitado.'
          : 'Fundamento esencial pendiente. Aprueba las evaluaciones de todas las lecciones esenciales con al menos 70% para habilitar el progreso de conocimiento consolidado.'}
      </Alert>

      <section className="education-hero card">
        <div>
          <span className="eyebrow">Tu ruta financiera</span>
          <h2>{!fundamentoAprobado ? 'Completa el fundamento esencial' : `${completed} conocimiento${completed === 1 ? '' : 's'} consolidado${completed === 1 ? '' : 's'}`}</h2>
          <p className="muted">FT-Score mide hábitos dentro de FT. GROUP; no reemplaza una calificación crediticia oficial.</p>
        </div>
        <div className="education-progress"><strong>{fundamentoAprobado ? Math.round(completed / total * 100) : 0}%</strong><span>progreso</span></div>
      </section>

      <section className="education-recommendations">
        {data.recomendaciones.map((r, index) => (
          <article className="card" key={`${r.tipo}-${index}`}><strong>{r.titulo}</strong><p className="muted">{r.mensaje}</p></article>
        ))}
      </section>

      {moderation && <ModerationPanel moderation={moderation} user={user} busy={busy} onTogglePublication={togglePublication} />}

      {byRoute.map(route => (
        <section key={route.id} className="education-route">
          <div className="section-head"><h2 className="section-title"><span>{route.icon}</span> {route.label}</h2></div>
          <div className="education-lessons">
            {route.lessons.map(leccion => (
              <button type="button" className={`card education-card ${leccion.estado === 'completada' ? 'completed' : ''}`}
                key={leccion.id} onClick={() => setSelected(leccion)}>
                <span className={`education-status${leccion.estado !== 'completada' && leccion.intentos > 0 ? ' education-status-failed' : ''}`}>
                  {leccion.estado === 'completada' ? '✓ Aprobada' : leccion.intentos > 0 ? `No aprobada · ${leccion.puntaje || 0}%` : 'Pendiente'}
                </span>
                <h3>{leccion.titulo}</h3>
                <p className="muted">{leccion.descripcion}</p>
                <span className="link">Abrir lección →</span>
              </button>
            ))}
          </div>
        </section>
      ))}

      <section className="card education-goals">
        <div>
          <span className="eyebrow">Metas de ahorro</span>
          <h2>Convierte aprendizaje en acción</h2>
          <p className="muted">Aparta el dinero por fuera de la app y registra cada aporte aquí. FT. GROUP no mueve dinero ni se conecta a tu banco.</p>
        </div>
        <form onSubmit={createGoal} className="education-goal-form">
          <input value={goalTitle} onChange={e => setGoalTitle(e.target.value)} placeholder="Ej. Fondo de emergencias" required />
          <input type="number" min="1" step="1" value={goalAmount} onChange={e => setGoalAmount(e.target.value)} inputMode="numeric" placeholder="Monto COP" required />
          <button className="btn btn-primary" disabled={busy}>Crear meta</button>
        </form>
        <Alert type="info">{notice}</Alert>
        {data.metas.map(meta => {
          const actual = Number(meta.monto_actual || 0)
          const objetivo = Number(meta.monto_objetivo)
          const pct = Math.min(100, Math.round(actual / objetivo * 100))
          const restante = Math.max(0, objetivo - actual)
          return (
            <article className="education-goal-item" key={meta.id}>
              <strong>{meta.titulo}</strong>
              <p>{formatoCOP.format(actual)} ahorrados de {formatoCOP.format(objetivo)}</p>
              <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
                <i style={{ width: `${pct}%` }} />
              </div>
              <small>{pct}% · {meta.estado} · Faltan {formatoCOP.format(restante)}</small>
              {meta.estado !== 'completada' && (
                <form className="education-contribution-form" onSubmit={event => { event.preventDefault(); registerContribution(meta) }}>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    aria-label={`Aporte para ${meta.titulo}`}
                    placeholder="Aporte COP"
                    value={contributions[meta.id] || ''}
                    onChange={event => setContributions(values => ({ ...values, [meta.id]: event.target.value }))}
                    required
                  />
                  <button className="btn btn-secondary" disabled={busy}>Registrar aporte</button>
                </form>
              )}
            </article>
          )
        })}
      </section>

      {selected && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal education-modal" role="dialog" aria-modal="true" aria-label={selected.titulo}>
            <button className="icon-btn" onClick={() => setSelected(null)} aria-label="Cerrar">×</button>
            <span className="eyebrow">Lección práctica</span>
            <h2>{selected.titulo}</h2>
            {(selected.contenido || []).filter(b => b.tipo !== 'quiz').map((bloque, i) => (
              <article className="card" key={i}><strong>{bloque.titulo}</strong><p>{bloque.cuerpo}</p></article>
            ))}
            <Quiz leccion={selected} onComplete={complete} busy={busy} />
          </section>
        </div>
      )}
    </div>
  )
}
