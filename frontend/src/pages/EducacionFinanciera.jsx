import { useEffect, useState } from 'react'
import { Alert, Loader, PageHeader } from '../components/ui'
import { educationApi } from '../services/educationApi'

const RUTAS = {
  esencial: { icon: '◎', label: 'Fundamentos esenciales' },
  grupal: { icon: '◇', label: 'Dinero y acuerdos grupales' },
  habitos: { icon: '↗', label: 'Hábitos sostenibles' },
}

function Quiz({ leccion, onComplete, busy }) {
  const quiz = (leccion.contenido || []).find(b => b.tipo === 'quiz')
  const [respuesta, setRespuesta] = useState(null)
  if (!quiz) return null
  return (
    <section className="card education-quiz">
      <span className="eyebrow">Comprueba lo aprendido</span>
      <h3>{quiz.pregunta}</h3>
      <div className="education-options">
        {quiz.opciones.map((opcion, index) => (
          <button key={opcion} type="button" className={`btn ${respuesta === index ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setRespuesta(index)}>{opcion}</button>
        ))}
      </div>
      <button className="btn btn-primary" disabled={respuesta === null || busy}
        onClick={() => onComplete(respuesta === quiz.respuesta ? 100 : 40)}>
        {busy ? 'Guardando…' : 'Enviar respuesta'}
      </button>
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
  const [moderation, setModeration] = useState(null)

  const load = async () => {
    try {
      if (user?.rol === 'supervisor') {
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

  const complete = async puntaje => {
    setBusy(true)
    try { await educationApi.completeLesson(selected.id, puntaje); await load(); setSelected(null) }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  const createGoal = async e => {
    e.preventDefault()
    try {
      await educationApi.createGoal({ titulo: goalTitle, montoObjetivo: Number(goalAmount) })
      setGoalTitle(''); setGoalAmount(''); await load()
    } catch (e) { setError(e.message) }
  }

  if (user?.rol === 'supervisor') {
    if (!moderation) return error ? <Alert>{error}</Alert> : <Loader />
    return (
      <>
        <PageHeader title="Control educativo" subtitle="Supervisa la publicación y participación global de la academia." />
        <Alert type="info">{error}</Alert>
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
  const completed = data.progreso?.completadas || 0
  const total = data.progreso?.total || 1

  return (
    <div>
      <PageHeader title="Academia FT"
        subtitle="Aprende con decisiones financieras reales, casos prácticos y hábitos medibles." />
      <Alert type="info">{error}</Alert>

      <section className="education-hero card">
        <div>
          <span className="eyebrow">Tu ruta financiera</span>
          <h2>{completed === 0 ? 'Construyamos tu base' : `${completed} conocimiento${completed === 1 ? '' : 's'} consolidado${completed === 1 ? '' : 's'}`}</h2>
          <p className="muted">FT-Score mide hábitos dentro de FT. GROUP; no reemplaza una calificación crediticia oficial.</p>
        </div>
        <div className="education-progress"><strong>{Math.round(completed / total * 100)}%</strong><span>progreso</span></div>
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
                <span className="education-status">{leccion.estado === 'completada' ? '✓ Completada' : `${leccion.puntaje || 0}%`}</span>
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
        </div>
        <form onSubmit={createGoal} className="education-goal-form">
          <input value={goalTitle} onChange={e => setGoalTitle(e.target.value)} placeholder="Ej. Fondo de emergencias" required />
          <input value={goalAmount} onChange={e => setGoalAmount(e.target.value)} inputMode="numeric" placeholder="Monto COP" required />
          <button className="btn btn-primary">Crear meta</button>
        </form>
        {data.metas.map(meta => {
          const pct = Math.min(100, Math.round(Number(meta.monto_actual) / Number(meta.monto_objetivo) * 100))
          return <article key={meta.id}><strong>{meta.titulo}</strong><div className="bar"><i style={{ width: `${pct}%` }} /></div><small>{pct}% · {meta.estado}</small></article>
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
