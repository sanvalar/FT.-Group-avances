import express, { NextFunction, Response, Router } from 'express';
import crypto from 'crypto';
import { env } from '../../../../config/env';
import { autenticar, autorizarRoles, RequestAutenticado } from '../middlewares/authMiddleware';
import { ClaudeFacturaExtractor } from '../../../out/ia/ClaudeFacturaExtractor';
import { OpenAIFacturaExtractor } from '../../../out/ia/OpenAIFacturaExtractor';
import { IaNoDisponibleError } from '../../../out/ia/facturaIaComun';
import { FacturaExtractor, TipoArchivoFactura } from '../../../../../domain/ports/out/FacturaExtractor';

/**
 * Adaptador de entrada: escaneo de facturas con IA.
 *
 * POST /api/ia/facturas
 *   Header Authorization: Bearer <access token>
 *   Content-Type: image/jpeg | image/png | image/webp | application/pdf
 *   Cuerpo: el archivo en binario (no JSON, para no chocar con el limite
 *   global de 100kb de express.json).
 *
 * Variables de entorno (comparte la clave con el asistente de soporte):
 *   IA_API_KEY          clave de la API (la MISMA del agente de soporte).
 *   IA_BASE_URL         URL compatible con OpenAI (por defecto api.openai.com).
 *   IA_MODELO_FACTURAS  modelo con vision para leer facturas (por defecto
 *                       gpt-4o-mini). Es distinto de IA_MODELO, que usa el
 *                       agente de soporte.
 *   IA_MAX_MB           tamaño maximo del archivo (por defecto 8).
 *   IA_LIMITE_POR_HORA  solicitudes por usuario por hora (por defecto 30).
 *
 *   Alternativa opcional con Claude: IA_PROVEEDOR=anthropic y ANTHROPIC_API_KEY.
 *
 * Sin clave responde 503 y el frontend usa el OCR local.
 */

const TIPOS_PERMITIDOS: TipoArchivoFactura[] = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const maxMb = Number(process.env.IA_MAX_MB ?? 8);
const limitePorHora = Number(process.env.IA_LIMITE_POR_HORA ?? 30);

function crearExtractor(): FacturaExtractor | null {
  const proveedor = (process.env.IA_PROVEEDOR ?? 'openai').toLowerCase();
  if (proveedor === 'anthropic') {
    return process.env.ANTHROPIC_API_KEY
      ? new ClaudeFacturaExtractor({
        apiKey: process.env.ANTHROPIC_API_KEY,
        modelo: process.env.IA_MODELO_FACTURAS || 'claude-haiku-5-5',
      })
      : null;
  }
  // Misma clave que el asistente de soporte (IA_API_KEY). OPENAI_API_KEY se
  // acepta solo por compatibilidad con la primera version de esta funcion.
  const apiKey = env.iaApiKey?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return new OpenAIFacturaExtractor({
    apiKey,
    modelo: process.env.IA_MODELO_FACTURAS || 'gpt-4o-mini',
    urlBase: env.iaBaseUrl,
  });
}

let extractor: FacturaExtractor | null = crearExtractor();

/** Permite inyectar un extractor falso en pruebas. */
export function configurarExtractorFacturas(nuevo: FacturaExtractor | null): void {
  extractor = nuevo;
}

// Limite simple en memoria por usuario (protege el costo de la API).
const usos = new Map<number, number[]>();
function limitarFrecuencia(req: RequestAutenticado, res: Response, next: NextFunction): void {
  const usuarioId = req.usuario?.id;
  if (usuarioId === undefined) {
    next();
    return;
  }
  const ahora = Date.now();
  const recientes = (usos.get(usuarioId) ?? []).filter((t) => ahora - t < 60 * 60 * 1000);
  if (recientes.length >= limitePorHora) {
    res.status(429).json({ error: 'DemasiadasSolicitudes', mensaje: 'Alcanzaste el límite de escaneos con IA. Intenta más tarde.' });
    return;
  }
  recientes.push(ahora);
  usos.set(usuarioId, recientes);
  next();
}

/** Verifica la firma del archivo para no confiar solo en el Content-Type. */
export function firmaCoincide(archivo: Buffer, tipo: TipoArchivoFactura): boolean {
  const inicio = (bytes: number[]) => bytes.every((b, i) => archivo[i] === b);
  switch (tipo) {
    case 'image/jpeg': return inicio([0xff, 0xd8, 0xff]);
    case 'image/png': return inicio([0x89, 0x50, 0x4e, 0x47]);
    case 'image/webp': return inicio([0x52, 0x49, 0x46, 0x46]) && archivo.subarray(8, 12).toString('ascii') === 'WEBP';
    case 'application/pdf': return archivo.subarray(0, 5).toString('ascii') === '%PDF-';
    default: return false;
  }
}

const router = Router();

router.get('/estado', autenticar, autorizarRoles('usuario'), (_req, res) => {
  res.json({ disponible: extractor !== null });
});

router.post(
  '/facturas',
  autenticar,
  autorizarRoles('usuario'),
  (req, res, next) => {
    if (!extractor) {
      res.status(503).json({ error: 'IaNoConfigurada', mensaje: 'El escaneo con IA no está configurado en el servidor.' });
      return;
    }
    next();
  },
  limitarFrecuencia,
  express.raw({ type: TIPOS_PERMITIDOS, limit: `${maxMb}mb` }),
  async (req: RequestAutenticado, res: Response, next: NextFunction) => {
    const tipo = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() as TipoArchivoFactura;
    if (!TIPOS_PERMITIDOS.includes(tipo) || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(415).json({ error: 'FormatoNoSoportado', mensaje: 'Envía una imagen JPG, PNG, WEBP o un PDF.' });
      return;
    }
    if (!firmaCoincide(req.body, tipo)) {
      res.status(415).json({ error: 'FormatoNoSoportado', mensaje: 'El contenido del archivo no coincide con su formato.' });
      return;
    }
    try {
      const datos = await extractor!.extraer(req.body, tipo);
      const confianza = typeof datos.confianza === 'number' ? datos.confianza : 0;
      const docHash = crypto.createHash('sha256').update(req.body).digest('hex');
      res.status(200).json({
        datos: {
          ...datos,
          docHash,
          requiereConfirmacionManual: confianza < 90,
          advertenciaConfianza: confianza < 90
            ? 'La extracción tiene confianza inferior al 90%. Confirma manualmente los montos antes de guardar.'
            : undefined,
        },
      });
    } catch (error) {
      if (error instanceof IaNoDisponibleError) {
        res.status(502).json({ error: 'IaNoDisponible', mensaje: error.message });
        return;
      }
      next(error);
    }
  },
);

// Archivo demasiado grande u otro error del parser binario.
router.use((err: Error & { type?: string }, _req: RequestAutenticado, res: Response, next: NextFunction) => {
  if (err.type === 'entity.too.large') {
    res.status(413).json({ error: 'ArchivoMuyGrande', mensaje: `El archivo supera ${maxMb} MB.` });
    return;
  }
  next(err);
});

export default router;
