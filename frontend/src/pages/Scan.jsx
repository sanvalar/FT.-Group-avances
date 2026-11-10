import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { financeApi } from '../services/financeApi'
import { extractFields, preprocess, recognize } from '../services/ocr'
import { useData } from '../utils/useData'
import { categoria, money } from '../utils/format'
import { Alert, Empty, Loader, PageHeader } from '../components/ui'
import Icon from '../components/Icon'
import ExpenseForm from '../components/ExpenseForm'
import CameraCapture from '../components/CameraCapture'
import { analizarFacturaConIa } from '../services/iaFacturas'

const STEPS = [
  { id: 'pre', icon: 'camera', title: 'Captura y preprocesamiento', text: 'Corrección de contraste, escala de grises y ruido' },
  { id: 'ocr', icon: 'brain', title: 'OCR · Detección de texto', text: 'Reconocimiento de caracteres en español' },
  { id: 'ext', icon: 'search', title: 'Extracción de campos clave', text: 'Identifica monto, fecha, comercio y categoría' },
  { id: 'val', icon: 'shield', title: 'Validación y confirmación', text: 'Revisas los datos antes de guardar' },
]

export default function Scan({ user }) {
  const { data: grupos, loading } = useData(() => financeApi.groups(user), [user.id])
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [step, setStep] = useState(-1) // índice de la etapa en curso; 4 = terminado
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const [saving, setSaving] = useState(false)
  const [camara, setCamara] = useState(false) // modal de cámara abierto
  const [motor, setMotor] = useState('ocr') // 'ia' = agente Claude, 'ocr' = Tesseract local
  const inputRef = useRef()
  const navigate = useNavigate()

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

  const reset = () => { setFile(null); setPreview(null); setStep(-1); setResult(null); setError(''); setProgress(0) }

  // Agente de IA: extrae los datos de la factura. Si no está disponible,
  // devuelve false y se sigue con el OCR local de siempre.
  const intentarIa = async f => {
    setMotor('ia')
    setStep(1)
    try {
      const datos = await analizarFacturaConIa(f)
      if (!datos.esFactura) setError('La IA no reconoce el archivo como una factura o recibo. Revisa los datos antes de guardar.')
      setResult(datos)
      setStep(3)
      return true
    } catch (err) {
      console.warn('Escaneo con IA no disponible, se usa OCR local:', err?.message)
      setMotor('ocr')
      return false
    }
  }

  const handle = async f => {
    if (!f) return
    if (!/^image\/(jpe?g|png|webp)$|^application\/pdf$/.test(f.type)) return setError('Formato no soportado. Usa JPG, PNG o PDF.')
    if (f.size > 10 * 1024 * 1024) return setError('El archivo supera 10 MB.')
    reset()
    setFile(f)
    if (f.type === 'application/pdf') {
      if (await intentarIa(f)) return
      // Los PDF se adjuntan, pero los datos se ingresan manualmente.
      setStep(3)
      setResult({ monto: 0, fecha: undefined, comercio: '', categoria: 'otro', confianza: null, pdf: true })
      return
    }
    setPreview(URL.createObjectURL(f))
    if (await intentarIa(f)) return
    try {
      setStep(0)
      const canvas = await preprocess(f)
      setStep(1)
      const { text, confidence } = await recognize(canvas, setProgress)
      setStep(2)
      const campos = extractFields(text)
      setResult({ ...campos, confianza: Math.round(confidence), texto: text })
      setStep(3)
    } catch (err) {
      console.error(err)
      setError('No se pudo leer el recibo automáticamente. Puedes ingresar los datos a mano.')
      setResult({ monto: 0, comercio: '', categoria: 'otro', confianza: null })
      setStep(3)
    }
  }

  const onDrop = e => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files?.[0]) }

  if (loading) return <Loader />

  return (
    <>
      <PageHeader title="Escaneo inteligente"
        subtitle="Captura una foto de tu recibo y el sistema extrae automáticamente el monto, fecha, comercio y categoría." />

      {grupos.length === 0 ? (
        <Empty icon="layers" title="Necesitas un grupo" text="Crea un grupo para poder registrar gastos escaneados."
          action={<Link className="btn btn-primary btn-sm" to="/grupos">Ir a grupos</Link>} />
      ) : !file ? (
        <div className={`dropzone${drag ? ' dragging' : ''}`}
          onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
          <span className="drop-icon"><Icon name="camera" size={30} /></span>
          <strong>Subir foto del recibo</strong>
          <small className="muted">JPG, PNG o PDF · máx. 10 MB</small>
          <button className="btn btn-primary" onClick={() => inputRef.current.click()}>Seleccionar archivo</button>
          <button className="btn btn-ghost" onClick={() => setCamara(true)}><Icon name="camera" size={16} />Tomar foto con la cámara</button>
          <small className="muted drop-hint">o arrastra y suelta aquí</small>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" hidden
            onChange={e => handle(e.target.files?.[0])} />
        </div>
      ) : (
        <div className="scan-grid">
          <section className="card scan-preview">
            {preview ? <img src={preview} alt="Recibo cargado" /> : <div className="pdf-preview"><Icon name="file" size={40} /><span>{file.name}</span></div>}
            <button className="btn btn-ghost btn-sm" onClick={reset}>Cambiar archivo</button>
          </section>
          <section className="card">
            {step < 3 ? (
              <div className="scan-progress">
                <span className="spinner" />
                {motor === 'ia' ? (
                  <>
                    <strong>Analizando la factura con IA…</strong>
                    <small className="muted">El agente lee el comercio, la fecha, el total y los productos (unos segundos).</small>
                  </>
                ) : (
                  <>
                <strong>{STEPS[step]?.title}…</strong>
                {step === 1 && <div className="bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
                <small className="muted">La primera vez se descarga el modelo de reconocimiento (unos segundos).</small>
                  </>
                )}
              </div>
            ) : (
              <>
                <Alert type="warning">{error}</Alert>
                {result && !result.pdf && result.confianza !== null && (
                  <div className="ocr-summary">
                    <span className="pill pill-ia"><Icon name="sparkles" size={14} />IA · confianza {result.confianza}%</span>
                    <p className="muted">Detectado: <strong className="text">{result.comercio || 'comercio no identificado'}</strong>
                      {result.monto > 0 && <> · {money(result.monto)}</>} · {categoria(result.categoria).label}. Revisa y corrige antes de guardar.</p>
                  </div>
                )}
                {result?.motor === 'ia' && (
                  <div className="ia-detalle">
                    <dl>
                      {result.nit && <><dt>NIT</dt><dd>{result.nit}</dd></>}
                      {result.numeroFactura && <><dt>Factura</dt><dd>{result.numeroFactura}</dd></>}
                      {result.subtotal > 0 && <><dt>Subtotal</dt><dd>{money(result.subtotal)}</dd></>}
                      {result.impuestos > 0 && <><dt>Impuestos</dt><dd>{money(result.impuestos)}</dd></>}
                      {result.propina > 0 && <><dt>Propina</dt><dd>{money(result.propina)}</dd></>}
                      {result.moneda && result.moneda !== 'COP' && <><dt>Moneda</dt><dd>{result.moneda}</dd></>}
                    </dl>
                    {result.items.length > 0 && (
                      <details>
                        <summary>{result.items.length} producto(s) detectado(s)</summary>
                        <ul>
                          {result.items.map((it, i) => (
                            <li key={i}>{it.cantidad ? `${it.cantidad} × ` : ''}{it.descripcion}{it.valor ? ` · ${money(it.valor)}` : ''}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {result.observaciones && <small className="muted">{result.observaciones}</small>}
                  </div>
                )}
                {result?.pdf && <p className="muted">Los PDF se adjuntan como comprobante; completa los datos del gasto.</p>}
                <ExpenseForm user={user} grupos={grupos} formId="scan-form" origen="ocr"
                  initial={{ descripcion: result?.descripcion || result?.comercio, monto: result?.monto || '', fecha: result?.fecha, categoria: result?.categoria }}
                  recibo={{ imagen_url: file.name, monto_extraido: result?.monto || null, fecha_extraida: result?.fecha || null, comercio_extraido: result?.comercio || null, categoria_sugerida: result?.categoria, confianza_ocr: result?.confianza }}
                  onSavingChange={setSaving} onSaved={() => navigate('/gastos')} />
                <div className="form-actions">
                  <button className="btn btn-ghost" onClick={reset}>Descartar</button>
                  <button className="btn btn-primary" form="scan-form" disabled={saving}>{saving ? 'Guardando…' : 'Confirmar y guardar'}</button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {camara && <CameraCapture onClose={() => setCamara(false)} onCapture={f => { setCamara(false); handle(f) }} />}

      <h2 className="eyebrow">Pipeline de procesamiento</h2>
      <ol className="pipeline">
        {STEPS.map((s, i) => (
          <li key={s.id} className={`pipe-step${step === i ? ' running' : ''}${step > i ? ' done' : ''}`}>
            <span className="tile-icon sm"><Icon name={step > i ? 'check' : s.icon} size={18} /></span>
            <div><strong>{s.title}</strong><small className="muted">{s.text}</small></div>
          </li>
        ))}
      </ol>
    </>
  )
}
