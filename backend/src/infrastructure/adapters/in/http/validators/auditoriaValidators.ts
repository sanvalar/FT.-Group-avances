import { z } from 'zod';

export const filtrosAuditoriaSchema = z.object({
  desde: z.string().date().optional(),
  hasta: z.string().date().optional(),
  rol: z.enum(['usuario', 'moderador', 'supervisor']).optional(),
  metodo: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'LOCAL']).optional(),
  buscar: z.string().trim().max(120).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
}).refine(
  (filtros) => !filtros.desde || !filtros.hasta || filtros.desde <= filtros.hasta,
  { message: 'La fecha inicial debe ser anterior o igual a la fecha final.' },
);

export const registrarEventoAuditoriaSchema = z.object({
  accion: z.enum([
    'panel_consultar',
    'grupos_consultar',
    'historial_consultar',
    'gastos_consultar',
    'grupo_crear',
    'miembro_agregar',
    'grupo_archivar',
    'gasto_crear',
    'gasto_eliminar',
    'pago_registrar',
    'liquidacion_registrar',
    'datos_demo_restaurar',
    'datos_demo_borrar',
  ]),
});

export type FiltrosAuditoriaInput = z.infer<typeof filtrosAuditoriaSchema>;
export type RegistrarEventoAuditoriaInput = z.infer<typeof registrarEventoAuditoriaSchema>;
