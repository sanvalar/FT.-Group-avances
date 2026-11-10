import { z } from 'zod';

export const cambiarEstadoAdminSchema = z.object({
  estado: z.enum(['activo', 'inactivo', 'bloqueado']),
});

export const cambiarRolAdminSchema = z.object({
  rol: z.enum(['usuario', 'moderador', 'supervisor']),
});

export const usuarioIdAdminSchema = z.object({
  id: z.coerce.number().int().positive('El id debe ser un entero positivo.'),
});

export const supervisionFinanzasQuerySchema = z.object({
  limite: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
});

export type CambiarEstadoAdminInput = z.infer<typeof cambiarEstadoAdminSchema>;
export type CambiarRolAdminInput = z.infer<typeof cambiarRolAdminSchema>;
