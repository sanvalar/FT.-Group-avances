import request from 'supertest';
import { crearApp } from '../../src/app';
import { pool } from '../../src/infrastructure/adapters/out/persistence/postgres/db';
import { bearer, correoUnico, crearSesion, esperarEscrituras } from './utilidades';

const app = crearApp();

afterAll(async () => {
  await esperarEscrituras();
  await pool.end();
});

describe('Integración · Autenticación (/api/auth)', () => {
  it('registra un usuario y guarda la contraseña con Argon2id (nunca en texto plano)', async () => {
    const email = correoUnico();
    const respuesta = await request(app).post('/api/auth/registro')
      .send({ nombre: 'Laura Gómez', email: email.toUpperCase(), password: 'ClaveSegura2026!' });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.usuario).toMatchObject({ nombre: 'Laura Gómez', email, estado: 'activo' });
    expect(JSON.stringify(respuesta.body)).not.toMatch(/password|hash/i);

    const fila = await pool.query('SELECT password_hash FROM usuario WHERE email = $1', [email]);
    expect(fila.rows[0].password_hash).toMatch(/^\$argon2id\$/);
  });

  it('rechaza un correo ya registrado con 409', async () => {
    const email = correoUnico();
    await request(app).post('/api/auth/registro').send({ nombre: 'Uno', email, password: 'ClaveSegura2026!' });
    const duplicado = await request(app).post('/api/auth/registro').send({ nombre: 'Dos', email, password: 'ClaveSegura2026!' });
    expect(duplicado.status).toBe(409);
  });

  it('valida la entrada del registro con 400 y detalle por campo', async () => {
    const respuesta = await request(app).post('/api/auth/registro').send({ nombre: 'A', email: 'no-es-correo', password: '123' });
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.errores.map((e: { campo: string }) => e.campo).sort()).toEqual(['email', 'nombre', 'password']);
  });

  it('inicia sesión y entrega access token JWT + refresh token opaco', async () => {
    const sesion = await crearSesion(app);
    expect(sesion.accessToken.split('.')).toHaveLength(3);
    expect(sesion.refreshToken).toMatch(/^[a-f0-9]{128}$/);
  });

  it('responde igual a contraseña incorrecta y a correo inexistente (no revela cuentas)', async () => {
    const sesion = await crearSesion(app);
    const claveMala = await request(app).post('/api/auth/login').send({ email: sesion.email, password: 'Incorrecta123!' });
    const noExiste = await request(app).post('/api/auth/login').send({ email: correoUnico('fantasma'), password: 'Incorrecta123!' });

    expect(claveMala.status).toBe(401);
    expect(noExiste.status).toBe(401);
    expect(claveMala.body).toEqual(noExiste.body);
  });

  it('protege /me: 401 sin token, con token alterado y con token firmado con otro secreto', async () => {
    const sesion = await crearSesion(app);
    const [cabecera, carga] = sesion.accessToken.split('.');

    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${cabecera}.${carga}.firmafalsa`)).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Basic abc')).status).toBe(401);

    const ok = await request(app).get('/api/auth/me').set(bearer(sesion));
    expect(ok.status).toBe(200);
    expect(ok.body.usuario.email).toBe(sesion.email);
  });

  it('rota el refresh token: el usado queda revocado y el nuevo funciona', async () => {
    const sesion = await crearSesion(app);
    const primera = await request(app).post('/api/auth/refresh').send({ refreshToken: sesion.refreshToken });
    expect(primera.status).toBe(200);
    expect(primera.body.refreshToken).not.toBe(sesion.refreshToken);

    const reutilizado = await request(app).post('/api/auth/refresh').send({ refreshToken: sesion.refreshToken });
    expect(reutilizado.status).toBe(401);

    const segunda = await request(app).post('/api/auth/refresh').send({ refreshToken: primera.body.refreshToken });
    expect(segunda.status).toBe(200);
  });

  it('cierra sesión revocando el refresh token', async () => {
    const sesion = await crearSesion(app);
    expect((await request(app).post('/api/auth/logout').send({ refreshToken: sesion.refreshToken })).status).toBe(204);
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: sesion.refreshToken })).status).toBe(401);
  });

  it('actualiza el perfil propio', async () => {
    const sesion = await crearSesion(app);
    const respuesta = await request(app).put('/api/auth/me').set(bearer(sesion)).send({ nombre: 'Nombre Nuevo', telefono: '3001112233' });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.usuario).toMatchObject({ nombre: 'Nombre Nuevo', telefono: '3001112233' });
  });

  it('al desactivar la cuenta invalida el access token y todos los refresh tokens', async () => {
    const sesion = await crearSesion(app);
    expect((await request(app).delete('/api/auth/me').set(bearer(sesion))).status).toBe(200);

    expect((await request(app).get('/api/auth/me').set(bearer(sesion))).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: sesion.refreshToken })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: sesion.email, password: sesion.password })).status).toBe(403);
  });

  it('registra en la auditoría las solicitudes autenticadas (regla 5W) sin guardar secretos', async () => {
    const sesion = await crearSesion(app);
    await request(app).get('/api/auth/me').set(bearer(sesion));
    await esperarEscrituras();

    const eventos = await pool.query('SELECT * FROM auditoria_evento WHERE actor_id = $1', [sesion.id]);
    expect(eventos.rowCount).toBeGreaterThan(0);
    const texto = JSON.stringify(eventos.rows);
    expect(texto).not.toContain(sesion.password);
    expect(texto).not.toContain(sesion.accessToken);
    expect(texto).not.toContain(sesion.refreshToken);
  });
});
