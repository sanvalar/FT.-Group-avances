import request from 'supertest';
import { Application } from 'express';

let contador = 0;

/** Correo unico por prueba, para que los archivos no dependan entre si. */
export function correoUnico(prefijo = 'usuario'): string {
  contador += 1;
  return `${prefijo}.${process.pid}.${Date.now()}.${contador}@pruebas.test`;
}

export interface SesionPrueba {
  id: number;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

/** Registra un usuario y devuelve su sesion iniciada. */
export async function crearSesion(app: Application, nombre = 'Usuario Prueba'): Promise<SesionPrueba> {
  const email = correoUnico();
  const password = 'ClaveSegura2026!';
  const registro = await request(app).post('/api/auth/registro').send({ nombre, email, password });
  if (registro.status !== 201) throw new Error(`Registro fallido: ${registro.status} ${JSON.stringify(registro.body)}`);
  const login = await request(app).post('/api/auth/login').send({ email, password });
  if (login.status !== 200) throw new Error(`Login fallido: ${login.status} ${JSON.stringify(login.body)}`);
  return {
    id: login.body.usuario.id,
    email,
    password,
    accessToken: login.body.accessToken,
    refreshToken: login.body.refreshToken,
  };
}

export const bearer = (sesion: { accessToken: string }) => ({ Authorization: `Bearer ${sesion.accessToken}` });

/** La auditoria se escribe al terminar la respuesta (res.on('finish')). */
export const esperarEscrituras = (ms = 150) => new Promise((resolver) => setTimeout(resolver, ms));
