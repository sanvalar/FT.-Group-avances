import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from './ui'
import Icon from './Icon'
import './CameraCapture.css'

/**
 * Captura de recibos con la cámara del dispositivo (celulares y portátiles).
 * Usa la cámara trasera cuando existe. Requiere HTTPS (o localhost).
 * Si el navegador no permite la cámara en vivo, ofrece la cámara nativa
 * del sistema mediante un <input capture>.
 *
 * onCapture(file: File) recibe la foto como JPEG.
 */
export default function CameraCapture({ onCapture, onClose }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const nativeRef = useRef(null)
  const [estado, setEstado] = useState('iniciando') // iniciando | lista | capturada | error
  const [error, setError] = useState('')
  const [foto, setFoto] = useState(null) // { blob, url }
  const [camaras, setCamaras] = useState([])
  const [camaraIdx, setCamaraIdx] = useState(-1) // -1 = trasera por defecto
  const [linterna, setLinterna] = useState(false)
  const [soportaLinterna, setSoportaLinterna] = useState(false)

  const detener = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  const iniciar = useCallback(async () => {
    detener()
    setEstado('iniciando')
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setEstado('error')
      setError(window.isSecureContext
        ? 'Este navegador no permite usar la cámara en vivo.'
        : 'La cámara en vivo requiere una conexión segura (HTTPS).')
      return
    }
    try {
      const video = camaraIdx >= 0 && camaras[camaraIdx]
        ? { deviceId: { exact: camaras[camaraIdx].deviceId } }
        : { facingMode: { ideal: 'environment' } }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { ...video, width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      const track = stream.getVideoTracks()[0]
      setSoportaLinterna(Boolean(track?.getCapabilities?.().torch))
      setLinterna(false)
      const dispositivos = await navigator.mediaDevices.enumerateDevices()
      setCamaras(dispositivos.filter(d => d.kind === 'videoinput'))
      setEstado('lista')
    } catch (err) {
      setEstado('error')
      setError(err?.name === 'NotAllowedError'
        ? 'No diste permiso para usar la cámara. Actívalo en la configuración del navegador.'
        : err?.name === 'NotFoundError'
          ? 'No se encontró ninguna cámara en este dispositivo.'
          : 'No fue posible abrir la cámara.')
    }
  }, [camaraIdx, camaras, detener])

  // Inicia al abrir y al cambiar de cámara; libera la cámara al cerrar.
  useEffect(() => { iniciar() }, [camaraIdx]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => detener, [detener])
  useEffect(() => () => foto && URL.revokeObjectURL(foto.url), [foto])

  const capturar = () => {
    const video = videoRef.current
    if (!video?.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    canvas.toBlob(blob => {
      if (!blob) return
      setFoto({ blob, url: URL.createObjectURL(blob) })
      setEstado('capturada')
      detener()
    }, 'image/jpeg', 0.92)
  }

  const repetir = () => { setFoto(null); iniciar() }

  const usar = () => {
    if (!foto) return
    const file = new File([foto.blob], `recibo-${Date.now()}.jpg`, { type: 'image/jpeg' })
    detener()
    onCapture(file)
  }

  const cambiarCamara = () => setCamaraIdx(i => (i + 1) % Math.max(camaras.length, 1))

  const alternarLinterna = async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ torch: !linterna }] })
      setLinterna(!linterna)
    } catch { setSoportaLinterna(false) }
  }

  const cerrar = () => { detener(); onClose() }

  return (
    <Modal title="Escanear con la cámara" onClose={cerrar}
      footer={estado === 'capturada' ? (
        <>
          <button className="btn btn-ghost" onClick={repetir}>Tomar otra</button>
          <button className="btn btn-primary" onClick={usar}><Icon name="check" size={16} />Usar foto</button>
        </>
      ) : estado === 'error' ? (
        <>
          <button className="btn btn-ghost" onClick={iniciar}>Reintentar</button>
          <button className="btn btn-primary" onClick={() => nativeRef.current?.click()}><Icon name="camera" size={16} />Abrir cámara del teléfono</button>
        </>
      ) : null}>
      <div className="cam-stage">
        {estado === 'capturada' && foto ? (
          <img className="cam-media" src={foto.url} alt="Foto del recibo" />
        ) : (
          <video ref={videoRef} className="cam-media" playsInline muted autoPlay hidden={estado === 'error'} />
        )}

        {(estado === 'lista' || estado === 'iniciando') && (
          <>
            <div className="cam-guide" aria-hidden="true"><i /><i /><i /><i /></div>
            <p className="cam-hint">Encuadra el recibo completo, con buena luz y sin sombras</p>
          </>
        )}

        {estado === 'iniciando' && <span className="spinner cam-spinner" />}

        {estado === 'error' && (
          <div className="cam-error">
            <Icon name="camera" size={34} />
            <p>{error}</p>
          </div>
        )}

        {estado === 'lista' && (
          <div className="cam-controls">
            {soportaLinterna ? (
              <button className={`cam-round${linterna ? ' active' : ''}`} onClick={alternarLinterna} aria-label="Linterna">
                <Icon name="bolt" size={20} />
              </button>
            ) : <span className="cam-round-spacer" />}
            <button className="cam-shutter" onClick={capturar} aria-label="Tomar foto"><span /></button>
            {camaras.length > 1 ? (
              <button className="cam-round" onClick={cambiarCamara} aria-label="Cambiar cámara">
                <Icon name="refresh" size={20} />
              </button>
            ) : <span className="cam-round-spacer" />}
          </div>
        )}
      </div>

      <input ref={nativeRef} type="file" accept="image/*" capture="environment" hidden
        onChange={e => { const f = e.target.files?.[0]; if (f) { detener(); onCapture(f) } }} />
    </Modal>
  )
}
