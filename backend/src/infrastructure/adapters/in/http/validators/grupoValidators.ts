import { z } from 'zod';

const idRuta = z.string().regex(/^[1-9]\d*$/, 'El identificador debe ser un entero positivo.');
const montoPositivo = z.number()
  .positive('El monto debe ser mayor que cero.')
  .refine((monto) => Math.abs(monto * 100 - Math.round(monto * 100)) < 0.000001, 'El monto admite como máximo dos decimales.');
const fechaISO = z.string().refine((fecha) => {
  const parseada = new Date(`${fecha}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !Number.isNaN(parseada.getTime()) && parseada.toISOString().slice(0, 10) === fecha;
}, 'La fecha debe tener formato YYYY-MM-DD y ser válida.');

export const grupoIdParamsSchema = z.object({ grupoId: idRuta });
export const miembroParamsSchema = z.object({ grupoId: idRuta, usuarioId: idRuta });
export const gastoParamsSchema = z.object({ gastoId: idRuta });
export const notificacionParamsSchema = z.object({ notificacionId: idRuta });

export const crearGrupoSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  descripcion: z.string().trim().max(2000).optional(),
  integrantes: z.array(z.string().trim().email().max(150)).max(100).optional(),
  moneda: z.string().regex(/^[A-Z]{3}$/).default('COP'),
  tasaCop: z.number().positive().max(1_000_000).default(1),
  instruccionesPago: z.string().trim().max(500).optional(),
});

export const miembroSchema = z.union([
  z.object({ usuarioId: z.number().int().positive() }).strict(),
  z.object({ email: z.string().trim().email().max(150) }).strict(),
]);

export const liquidacionSchema = z.object({
  acreedorId: z.number().int().positive(),
  monto: z.number().positive()
    .refine((monto) => Math.abs(monto * 100 - Math.round(monto * 100)) < 0.000001, 'El monto admite como máximo dos decimales.'),
});

export const liquidacionParamsSchema = z.object({
  grupoId: idRuta,
  liquidacionId: idRuta,
});
export const recurrenciaParamsSchema = z.object({
  grupoId: idRuta,
  recurrenciaId: idRuta,
});
export const recurrenciaEstadoSchema = z.object({ activa: z.boolean() });
export const plantillaParamsSchema = z.object({ grupoId: idRuta, plantillaId: idRuta });
export const plantillaSchema = z.object({
  nombre: z.string().trim().min(1).max(80),
  tipoDivision: z.enum(['equitativa', 'personalizada', 'porcentaje', 'participaciones']),
  asignaciones: z.array(z.object({
    usuarioId: z.number().int().positive(),
    valor: z.number().positive().max(1_000_000),
  })).min(1).max(100),
});

const gastoComun = {
  descripcion: z.string().trim().min(2).max(255),
  montoTotal: montoPositivo,
  fechaGasto: fechaISO,
  categoria: z.string().trim().min(1).max(60),
  pagadorId: z.number().int().positive().optional(),
  origenRegistro: z.enum(['manual', 'ocr']).optional(),
  monedaOriginal: z.string().regex(/^[A-Z]{3}$/).optional(),
  montoOriginal: montoPositivo.optional(),
  tasaCambio: z.number().positive().max(1_000_000).optional(),
  solicitudId: z.string().uuid().optional(),
  recurrencia: z.object({
    frecuencia: z.enum(['semanal', 'mensual', 'anual']),
    proximaFecha: fechaISO,
  }).optional(),
  articulos: z.array(z.object({
    descripcion: z.string().trim().min(1).max(200),
    cantidad: z.number().positive().max(100_000),
    montoTotal: montoPositivo,
  })).max(100).optional(),
  comprobante: z.object({
    archivoHash: z.string().regex(/^[a-f0-9]{64}$/i),
    comercio: z.string().trim().max(120).nullable(),
    nit: z.string().trim().max(20).nullable(),
    numeroFactura: z.string().trim().max(60).nullable(),
    cufe: z.string().trim().max(96).nullable(),
    fecha: fechaISO.nullable(),
    montoTotal: z.number().nonnegative().nullable(),
    subtotal: z.number().nonnegative().nullable(),
    impuestos: z.number().nonnegative().nullable(),
    propina: z.number().nonnegative().nullable(),
  }).optional(),
};

export const crearGastoSchema = z.discriminatedUnion('tipoDivision', [
  z.object({
    ...gastoComun,
    tipoDivision: z.literal('equitativa'),
    usuarioIds: z.array(z.number().int().positive()).min(1).max(100),
  }),
  z.object({
    ...gastoComun,
    tipoDivision: z.literal('personalizada'),
    participaciones: z.array(z.object({
      usuarioId: z.number().int().positive(),
      montoAsignado: z.number().min(0),
    })).min(1).max(100),
  }),
  ...(['porcentaje', 'participaciones'] as const).map((tipoDivision) => z.object({
    ...gastoComun,
    tipoDivision: z.literal(tipoDivision),
    asignaciones: z.array(z.object({
      usuarioId: z.number().int().positive(),
      valor: z.number().positive().max(1_000_000),
    })).min(1).max(100),
  })),
]);

export type CrearGrupoInput = z.infer<typeof crearGrupoSchema>;
export type CrearGastoInput = z.infer<typeof crearGastoSchema>;