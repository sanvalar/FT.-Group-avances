import { z } from 'zod';

/**
 * Esquemas de validacion/sanitizacion de entrada (adaptador de entrada).
 * Estas reglas son de "forma" del dato HTTP, no de negocio: por eso
 * viven en la capa de infraestructura y no en el dominio.
 */

/* ------------------------------------------------------------------ */
/* Registrar usuario                                                   */
/* ------------------------------------------------------------------ */
export const registrarUsuarioSchema = z.object({
  nombre: z
    .string({ required_error: 'El nombre es obligatorio.' })
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres.')
    .max(120, 'El nombre no puede superar los 120 caracteres.'),
  email: z
    .string({ required_error: 'El correo es obligatorio.' })
    .trim()
    .toLowerCase()
    .email('El correo electronico no tiene un formato valido.')
    .max(150),
  password: z
    .string({ required_error: 'La contrasena es obligatoria.' })
    .min(8, 'La contrasena debe tener al menos 8 caracteres.')
    .max(72, 'La contrasena no puede superar los 72 caracteres.'),
  telefono: z.string().trim().max(20).optional(),
});

/* ------------------------------------------------------------------ */
/* Iniciar sesion                                                      */
/* ------------------------------------------------------------------ */
export const iniciarSesionSchema = z.object({
  email: z
    .string({ required_error: 'El correo es obligatorio.' })
    .trim()
    .toLowerCase()
    .email('El correo electronico no tiene un formato valido.'),
  password: z
    .string({ required_error: 'La contrasena es obligatoria.' })
    .min(1, 'La contrasena es obligatoria.')
    .max(72, 'La contrasena no puede superar los 72 caracteres.'),
});

/* ------------------------------------------------------------------ */
/* Refrescar token / Logout                                            */
/* ------------------------------------------------------------------ */
export const refrescarTokenSchema = z.object({
  refreshToken: z
    .string({ required_error: 'El refreshToken es obligatorio.' })
    .min(1, 'El refreshToken es obligatorio.'),
});

/* ------------------------------------------------------------------ */
/* Actualizar perfil del usuario                                       */
/* ------------------------------------------------------------------ */
export const actualizarPerfilSchema = z
  .object({
    nombre: z
      .string()
      .trim()
      .min(2, 'El nombre debe tener al menos 2 caracteres.')
      .max(120, 'El nombre no puede superar los 120 caracteres.')
      .optional(),
    telefono: z
      .string()
      .trim()
      .max(20, 'El telefono no puede superar los 20 caracteres.')
      .nullable()
      .optional(),
  })
  .refine(
    (datos) => datos.nombre !== undefined || datos.telefono !== undefined,
    { message: 'Debes enviar al menos un campo para actualizar (nombre o telefono).' },
  );

/* ------------------------------------------------------------------ */
/* Cambiar estado (soft delete: activo/inactivo)                       */
/* ------------------------------------------------------------------ */
export const cambiarEstadoUsuarioSchema = z.object({
  activo: z.boolean({
    required_error: 'El campo activo es obligatorio.',
    invalid_type_error: 'El campo activo debe ser booleano (true o false).',
  }),
});

/* ------------------------------------------------------------------ */
/* Validacion de params de ruta (:id)                                  */
/* ------------------------------------------------------------------ */
export const idUsuarioSchema = z.object({
  id: z.coerce.number().int().positive('El id debe ser un entero positivo.'),
});

/* ------------------------------------------------------------------ */
/* Tipos inferidos                                                     */
/* ------------------------------------------------------------------ */
export type RegistrarUsuarioInput = z.infer<typeof registrarUsuarioSchema>;
export type IniciarSesionInput = z.infer<typeof iniciarSesionSchema>;
export type RefrescarTokenInput = z.infer<typeof refrescarTokenSchema>;
export type ActualizarPerfilInput = z.infer<typeof actualizarPerfilSchema>;
export type CambiarEstadoUsuarioInput = z.infer<typeof cambiarEstadoUsuarioSchema>;
export type IdUsuarioInput = z.infer<typeof idUsuarioSchema>;