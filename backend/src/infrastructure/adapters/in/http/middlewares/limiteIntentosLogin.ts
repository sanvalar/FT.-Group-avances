import { NextFunction, Request, Response } from 'express';

/**
 * Proteccion contra fuerza bruta en POST /api/auth/login.
 *
 * Cuenta los intentos FALLIDOS (respuesta 401) por correo dentro de una
 * ventana de tiempo. Al alcanzar el maximo, el correo queda bloqueado
 * (429 + Retry-After) hasta que la ventana expire, aunque la contraseña
 * sea correcta. Un inicio de sesion exitoso reinicia el contador.
 *
 * Se limita por correo y no por IP: detras del proxy de Vercel todas las
 * solicitudes llegan con la IP del balanceador, y confiar en la cabecera
 * X-Forwarded-For permitiria saltarse el limite falsificandola.
 *
 * Memoria por instancia: en despliegues con varias instancias el limite es
 * aproximado (ver docs/PRUEBAS.md, recomendaciones).
 *
 * Variables de entorno:
 *   LOGIN_MAX_INTENTOS     intentos fallidos permitidos (por defecto 10).
 *   LOGIN_VENTANA_MINUTOS  duracion de la ventana (por defecto 15).
 */
const maxIntentos = Number(process.env.LOGIN_MAX_INTENTOS ?? 10);
const ventanaMs = Number(process.env.LOGIN_VENTANA_MINUTOS ?? 15) * 60 * 1000;
const MAX_ENTRADAS = 50_000;

const fallos = new Map<string, number[]>();

function recientes(clave: string, ahora: number): number[] {
  return (fallos.get(clave) ?? []).filter((t) => ahora - t < ventanaMs);
}

export function limitarIntentosLogin(req: Request, res: Response, next: NextFunction): void {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email) {
    next();
    return;
  }

  const ahora = Date.now();
  const intentos = recientes(email, ahora);
  if (intentos.length >= maxIntentos) {
    const esperaSegundos = Math.max(1, Math.ceil((intentos[0] + ventanaMs - ahora) / 1000));
    res.setHeader('Retry-After', String(esperaSegundos));
    res.status(429).json({
      error: 'DemasiadosIntentos',
      mensaje: 'Demasiados intentos fallidos. Espera unos minutos antes de volver a intentarlo.',
    });
    return;
  }

  res.on('finish', () => {
    if (res.statusCode === 401) {
      if (fallos.size >= MAX_ENTRADAS) fallos.clear(); // evita crecimiento ilimitado de memoria
      fallos.set(email, [...recientes(email, Date.now()), Date.now()]);
    } else if (res.statusCode < 300) {
      fallos.delete(email);
    }
  });
  next();
}
