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
});

export const miembroSchema = z.object({
  usuarioId: z.number().int().positive(),
});

const gastoComun = {
  descripcion: z.string().trim().min(2).max(255),
  montoTotal: montoPositivo,
  fechaGasto: fechaISO,
  categoria: z.string().trim().min(1).max(60),
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
]);

export type CrearGrupoInput = z.infer<typeof crearGrupoSchema>;
export type CrearGastoInput = z.infer<typeof crearGastoSchema>;