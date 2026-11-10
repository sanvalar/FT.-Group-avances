import { z } from 'zod';
import {
  CATEGORIAS_TICKET,
  ESTADOS_TICKET,
  PRIORIDADES_TICKET,
} from '../../../../../domain/ports/out/SoporteRepository';

/** Numero de ticket en formato FT-AAAA-NNNN; se normaliza a mayusculas. */
const numeroTicket = z
  .string()
  .trim()
  .regex(/^FT-\d{4}-\d{4}$/i, 'El numero de ticket debe tener el formato FT-AAAA-NNNN.')
  .transform((valor) => valor.toUpperCase());

export const mensajeAsistenteSchema = z.object({
  mensaje: z.string().trim().min(1, 'Escribe tu pregunta.').max(1000),
  conversacionId: z.coerce.number().int().positive().optional(),
});

export const crearTicketSchema = z.object({
  categoria: z.enum(CATEGORIAS_TICKET),
  asunto: z.string().trim().min(5).max(150),
  descripcion: z.string().trim().min(10).max(4000),
  prioridad: z.enum(PRIORIDADES_TICKET).default('normal'),
});

export const numeroTicketParamsSchema = z.object({ numero: numeroTicket });

export const comentarioTicketSchema = z.object({
  comentario: z.string().trim().min(3).max(2000),
});

export const estadoTicketSchema = z.object({ estado: z.enum(ESTADOS_TICKET) });

export const filtrosTicketsSchema = z.object({
  estado: z.enum(ESTADOS_TICKET).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export type MensajeAsistenteInput = z.infer<typeof mensajeAsistenteSchema>;
export type CrearTicketInput = z.infer<typeof crearTicketSchema>;
export type ComentarioTicketInput = z.infer<typeof comentarioTicketSchema>;
export type EstadoTicketInput = z.infer<typeof estadoTicketSchema>;
