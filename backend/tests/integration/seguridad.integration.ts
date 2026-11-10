import jwt from 'jsonwebtoken';
import request from 'supertest';
import { crearApp } from '../../src/app';
import { pool } from '../../src/infrastructure/adapters/out/persistence/postgres/db';
import { bearer, crearSesion, esperarEscrituras, SesionPrueba } from './utilidades';

const app = crearApp();

let usuario: SesionPrueba;
let moderador: SesionPrueba;
let supervisor: SesionPrueba;

async function asignarRol(sesion: SesionPrueba, rol: string) {
  await pool.query('UPDATE usuario SET rol = $1 WHERE id = $2', [rol, sesion.id]);
}

beforeAll(async () => {
  usuario = await crearSesion(app, 'Usuario Común');
  moderador = await crearSesion(app, 'Moderadora');
  supervisor = await crearSesion(app, 'Supervisor');
  await asignarRol(moderador, 'moderador');
  await asignarRol(supervisor, 'supervisor');
});

afterAll(async () => {
  await esperarEscrituras();
  await pool.end();
});

describe('Integración · Seguridad', () => {
  describe('Cabeceras y CORS', () => {
    it('aplica cabeceras de seguridad (helmet) y un identificador de solicitud', async () => {
      const respuesta = await request(app).get('/health');
      expect(respuesta.status).toBe(200);
      expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
      expect(respuesta.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(respuesta.headers['strict-transport-security']).toContain('max-age=');
      expect(respuesta.headers['content-security-policy']).toContain("default-src 'self'");
      expect(respuesta.headers['x-powered-by']).toBeUndefined();
      expect(respuesta.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('solo autoriza por CORS al origen configurado', async () => {
      const permitido = await request(app).get('/health').set('Origin', 'http://localhost:5173');
      const ajeno = await request(app).get('/health').set('Origin', 'https://sitio-malicioso.example');
      expect(permitido.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(ajeno.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Entrada maliciosa o abusiva', () => {
    it('rechaza cuerpos JSON mayores a 100 KB (413)', async () => {
      const respuesta = await request(app).post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(110 * 1024) }));
      expect(respuesta.status).toBe(413);
      expect(respuesta.body.error).toBe('CuerpoMuyGrande');
    });

    it('responde 400 (no 500) ante JSON mal formado', async () => {
      const respuesta = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": ');
      expect(respuesta.status).toBe(400);
      expect(respuesta.body.error).toBe('JsonInvalido');
    });

    it('trata los intentos de inyección SQL como datos (consultas parametrizadas)', async () => {
      const antes = await pool.query('SELECT COUNT(*)::int AS total FROM usuario');
      const ataques = [
        { email: "admin@x.co' OR '1'='1", password: "' OR '1'='1" },
        { email: 'a@b.co', password: "x'; DROP TABLE usuario; --" },
      ];
      for (const cuerpo of ataques) {
        const respuesta = await request(app).post('/api/auth/login').send(cuerpo);
        expect([400, 401]).toContain(respuesta.status);
      }
      const nombre = await request(app).put('/api/auth/me').set(bearer(usuario)).send({ nombre: "Robert'); DROP TABLE usuario;--" });
      expect(nombre.status).toBe(200);
      expect(nombre.body.usuario.nombre).toBe("Robert'); DROP TABLE usuario;--");

      const despues = await pool.query('SELECT COUNT(*)::int AS total FROM usuario');
      expect(despues.rows[0].total).toBe(antes.rows[0].total);
    });

    it('rechaza identificadores de ruta no numéricos (400)', async () => {
      const respuesta = await request(app).get('/api/grupos/1%20OR%201=1/gastos').set(bearer(usuario));
      expect(respuesta.status).toBe(400);
    });

    it('no expone detalles internos en 404', async () => {
      const respuesta = await request(app).get('/api/no-existe');
      expect(respuesta.status).toBe(404);
      expect(respuesta.body).toEqual({ error: 'NoEncontrado', mensaje: 'El recurso solicitado no existe.' });
    });
  });

  describe('Fuerza bruta en el inicio de sesión', () => {
    it('bloquea el correo tras LOGIN_MAX_INTENTOS fallos, aunque luego la clave sea correcta (429)', async () => {
      const victima = await crearSesion(app, 'Víctima');
      const maximo = Number(process.env.LOGIN_MAX_INTENTOS);
      for (let i = 0; i < maximo; i += 1) {
        const fallo = await request(app).post('/api/auth/login').send({ email: victima.email, password: `Adivina${i}!` });
        expect(fallo.status).toBe(401);
      }
      const bloqueado = await request(app).post('/api/auth/login').send({ email: victima.email, password: victima.password });
      expect(bloqueado.status).toBe(429);
      expect(Number(bloqueado.headers['retry-after'])).toBeGreaterThan(0);

      const otraCuenta = await crearSesion(app, 'No afectada');
      expect((await request(app).post('/api/auth/login').send({ email: otraCuenta.email, password: otraCuenta.password })).status).toBe(200);
    });

    it('un inicio de sesión exitoso reinicia el contador de fallos', async () => {
      const sesion = await crearSesion(app, 'Distraído');
      const maximo = Number(process.env.LOGIN_MAX_INTENTOS);
      for (let i = 0; i < maximo - 1; i += 1) {
        await request(app).post('/api/auth/login').send({ email: sesion.email, password: 'Equivocada1!' });
      }
      expect((await request(app).post('/api/auth/login').send({ email: sesion.email, password: sesion.password })).status).toBe(200);
      expect((await request(app).post('/api/auth/login').send({ email: sesion.email, password: 'Equivocada1!' })).status).toBe(401);
      expect((await request(app).post('/api/auth/login').send({ email: sesion.email, password: sesion.password })).status).toBe(200);
    });
  });

  describe('Tokens', () => {
    it('rechaza tokens sin firma (alg: none) y tokens expirados', async () => {
      const sinFirma = jwt.sign({ usuarioId: supervisor.id, email: supervisor.email, rol: 'supervisor' }, '', { algorithm: 'none' });
      const expirado = jwt.sign(
        { usuarioId: usuario.id, email: usuario.email, rol: 'usuario' },
        process.env.JWT_SECRET as string,
        { expiresIn: -10 },
      );
      expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${sinFirma}`)).status).toBe(401);
      expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expirado}`)).status).toBe(401);
    });

    it('el backend no acepta el token del modo demostración del frontend', async () => {
      for (const ruta of ['/api/auth/me', '/api/auditoria', '/api/administracion/usuarios', '/api/grupos']) {
        const respuesta = await request(app).get(ruta).set('Authorization', 'Bearer demo_token_ft');
        expect([ruta, respuesta.status]).toEqual([ruta, 401]);
      }
    });

    it('el rol se lee de la base de datos, no del token: degradar a un usuario surte efecto de inmediato', async () => {
      const temporal = await crearSesion(app, 'Supervisor temporal');
      await asignarRol(temporal, 'supervisor');
      expect((await request(app).get('/api/auditoria').set(bearer(temporal))).status).toBe(200);

      await asignarRol(temporal, 'usuario');
      expect((await request(app).get('/api/auditoria').set(bearer(temporal))).status).toBe(403);
    });
  });

  describe('Autorización por roles', () => {
    const casos: Array<[string, string, Record<string, number>]> = [
      ['get', '/api/administracion/usuarios', { usuario: 403, moderador: 200, supervisor: 200 }],
      ['get', '/api/auditoria', { usuario: 403, moderador: 403, supervisor: 200 }],
      ['get', '/api/estado', { usuario: 403, moderador: 403, supervisor: 200 }],
      ['get', '/api/grupos', { usuario: 200, moderador: 403, supervisor: 403 }],
      ['get', '/api/reportes/resumen', { usuario: 200, moderador: 403, supervisor: 403 }],
      ['get', '/api/notificaciones', { usuario: 200, moderador: 403, supervisor: 403 }],
      ['get', '/api/educacion', { usuario: 200, moderador: 403, supervisor: 403 }],
      ['get', '/api/ia/estado', { usuario: 200, moderador: 403, supervisor: 403 }],
      ['get', '/api/contratos/no-existe', { usuario: 404, moderador: 403, supervisor: 403 }],
    ];

    it.each(casos)('%s %s respeta la matriz de roles', async (metodo, ruta, esperado) => {
      const sesiones: Record<string, SesionPrueba> = { usuario, moderador, supervisor };
      for (const [rol, estado] of Object.entries(esperado)) {
        const respuesta = await (request(app) as unknown as Record<string, (r: string) => request.Test>)[metodo](ruta).set(bearer(sesiones[rol]));
        expect([rol, respuesta.status]).toEqual([rol, estado]);
      }
    });

    it('GraphQL también reserva los grupos a usuarios comunes', async () => {
      for (const [rol, sesion] of Object.entries({ usuario, moderador, supervisor })) {
        const respuesta = await request(app)
          .post('/graphql')
          .set(bearer(sesion))
          .send({ query: '{ misGrupos { id } }' });
        if (rol === 'usuario') {
          expect(respuesta.body.errors).toBeUndefined();
        } else {
          expect(respuesta.body.errors?.[0]?.message).toContain('permisos');
        }
      }
    });

    it('GraphQL entrega al usuario autenticado el panel y grupos detallados', async () => {
      const cliente = await crearSesion(app, 'Usuario GraphQL');
      const creado = await request(app).post('/api/grupos').set(bearer(cliente)).send({ nombre: 'Grupo GraphQL' });
      expect(creado.status).toBe(201);
      const grupoId = creado.body.grupo.id;
      const gasto = await request(app).post(`/api/grupos/${grupoId}/gastos`).set(bearer(cliente)).send({
        descripcion: 'Gasto consultado con GraphQL',
        montoTotal: 12500,
        fechaGasto: '2026-11-09',
        categoria: 'alimentacion',
        tipoDivision: 'equitativa',
        usuarioIds: [cliente.id],
      });
      expect(gasto.status).toBe(201);

      const respuesta = await request(app).post('/graphql').set(bearer(cliente)).send({
        query: `{
          yo { id email }
          misGrupos { id nombre totalGastos numGastos miBalance miembros { id nombre } }
          miPanel { teDeben debes balance grupos { id } liquidaciones { grupo_id monto } }
        }`,
      });
      expect(respuesta.body.errors).toBeUndefined();
      expect(respuesta.body.data.yo).toEqual({ id: String(cliente.id), email: cliente.email });
      expect(respuesta.body.data.misGrupos).toEqual([
        expect.objectContaining({
          id: String(grupoId),
          nombre: 'Grupo GraphQL',
          totalGastos: 12500,
          numGastos: 1,
          miBalance: 0,
          miembros: [expect.objectContaining({ id: String(cliente.id) })],
        }),
      ]);
      expect(respuesta.body.data.miPanel).toMatchObject({
        teDeben: 0,
        debes: 0,
        balance: 0,
      });
    });

    it('GraphQL solo permite archivar a un administrador activo del grupo', async () => {
      const propietario = await crearSesion(app, 'Propietario de grupo');
      const creado = await request(app).post('/api/grupos').set(bearer(propietario)).send({ nombre: 'Grupo protegido' });
      expect(creado.status).toBe(201);
      const grupoId = creado.body.grupo.id;
      const externo = await crearSesion(app, 'Usuario externo');

      const denegado = await request(app).post('/graphql').set(bearer(externo)).send({
        query: `mutation { archivarGrupo(grupoId: "${grupoId}") }`,
      });
      expect(denegado.body.errors?.[0]?.message).toContain('permiso');
      const estado = await pool.query('SELECT estado FROM grupo WHERE id = $1', [grupoId]);
      expect(estado.rows[0].estado).toBe('activo');

      const archivado = await request(app).post('/graphql').set(bearer(propietario)).send({
        query: `mutation { archivarGrupo(grupoId: "${grupoId}") }`,
      });
      expect(archivado.body.errors).toBeUndefined();
      expect(archivado.body.data.archivarGrupo).toContain('archivado');
      const archivadoEnBase = await pool.query(
        'SELECT id, creado_por FROM historico.grupo_archivado WHERE id = $1',
        [grupoId],
      );
      expect(archivadoEnBase.rows).toEqual([{ id: Number(grupoId), creado_por: propietario.id }]);
      const archivados = await request(app).post('/graphql').set(bearer(propietario)).send({
        query: '{ gruposArchivados { id nombre estado } }',
      });
      expect(archivados.body.errors).toBeUndefined();
      expect(archivados.body.data.gruposArchivados).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: String(grupoId), estado: 'archivado' }),
      ]));
    });

    it('GraphQL protege consultas administrativas y limita finanzas a supervisores', async () => {
      const objetivo = await crearSesion(app, 'Cuenta supervisada GraphQL');
      const listaSupervisor = await request(app).post('/graphql').set(bearer(supervisor)).send({
        query: '{ usuarios { id nombre email rol estado } }',
      });
      expect(listaSupervisor.body.errors).toBeUndefined();
      expect(listaSupervisor.body.data.usuarios).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: String(objetivo.id), estado: 'activo' }),
      ]));

      const listaUsuario = await request(app).post('/graphql').set(bearer(usuario)).send({
        query: '{ usuarios { id } }',
      });
      expect(listaUsuario.body.errors?.[0]?.message).toContain('permisos');

      const consultaSupervisor = await request(app).post('/graphql').set(bearer(supervisor)).send({
        query: `query {
          finanzasUsuario(usuarioId: "${objetivo.id}", limite: 10, offset: 0) {
            usuario { id email }
            resumen { grupos gastos montoPagado }
            grupos { id nombre }
            gastos { id }
            paginacion { limite offset total }
          }
        }`,
      });
      expect(consultaSupervisor.body.errors).toBeUndefined();
      expect(consultaSupervisor.body.data.finanzasUsuario).toMatchObject({
        usuario: { id: String(objetivo.id), email: objetivo.email },
        resumen: { grupos: 0, gastos: 0 },
        grupos: [],
        gastos: [],
        paginacion: { limite: 10, offset: 0, total: 0 },
      });

      const consultaModerador = await request(app).post('/graphql').set(bearer(moderador)).send({
        query: `query { finanzasUsuario(usuarioId: "${objetivo.id}") { usuario { id } } }`,
      });
      expect(consultaModerador.body.errors?.[0]?.message).toContain('permisos');

      const paginacionInvalida = await request(app).post('/graphql').set(bearer(supervisor)).send({
        query: `query { finanzasUsuario(usuarioId: "${objetivo.id}", limite: 101) { usuario { id } } }`,
      });
      expect(paginacionInvalida.body.errors?.[0]?.message).toContain('límite');
    });

    it('GraphQL aplica reglas del servicio al cambiar estado y rol de cuentas', async () => {
      const cuenta = await crearSesion(app, 'Cuenta administrada GraphQL');
      const bloqueada = await request(app).post('/graphql').set(bearer(moderador)).send({
        query: `mutation {
          cambiarEstadoUsuario(usuarioId: "${cuenta.id}", estado: bloqueado) {
            id estado
          }
        }`,
      });
      expect(bloqueada.body.errors).toBeUndefined();
      expect(bloqueada.body.data.cambiarEstadoUsuario).toEqual({ id: String(cuenta.id), estado: 'bloqueado' });
      expect((await request(app).get('/api/auth/me').set(bearer(cuenta))).status).toBe(401);

      const rolDenegado = await request(app).post('/graphql').set(bearer(moderador)).send({
        query: `mutation { cambiarRolUsuario(usuarioId: "${cuenta.id}", rol: moderador) { id rol } }`,
      });
      expect(rolDenegado.body.errors?.[0]?.message).toContain('permisos');

      const rolActualizado = await request(app).post('/graphql').set(bearer(supervisor)).send({
        query: `mutation { cambiarRolUsuario(usuarioId: "${cuenta.id}", rol: moderador) { id rol } }`,
      });
      expect(rolActualizado.body.errors).toBeUndefined();
      expect(rolActualizado.body.data.cambiarRolUsuario).toEqual({ id: String(cuenta.id), rol: 'moderador' });
    });

    it('solo el supervisor cambia roles; nadie puede cambiar su propio rol', async () => {
      const objetivo = await crearSesion(app, 'Objetivo');
      expect((await request(app).patch(`/api/administracion/usuarios/${objetivo.id}/rol`).set(bearer(moderador)).send({ rol: 'moderador' })).status).toBe(403);
      expect((await request(app).patch(`/api/administracion/usuarios/${objetivo.id}/rol`).set(bearer(supervisor)).send({ rol: 'moderador' })).status).toBe(200);
      expect((await request(app).patch(`/api/administracion/usuarios/${supervisor.id}/rol`).set(bearer(supervisor)).send({ rol: 'usuario' })).status).toBe(403);
      expect((await request(app).patch(`/api/administracion/usuarios/${usuario.id}/rol`).set(bearer(usuario)).send({ rol: 'supervisor' })).status).toBe(403);
    });

    it('el moderador solo gestiona cuentas de usuario común', async () => {
      const comun = await crearSesion(app, 'Cuenta común');
      expect((await request(app).patch(`/api/administracion/usuarios/${comun.id}/estado`).set(bearer(moderador)).send({ estado: 'bloqueado' })).status).toBe(200);
      expect((await request(app).get('/api/auth/me').set(bearer(comun))).status).toBe(401);
      expect((await request(app).patch(`/api/administracion/usuarios/${supervisor.id}/estado`).set(bearer(moderador)).send({ estado: 'inactivo' })).status).toBe(403);
    });
  });

  it('el estado del sistema confirma la conexión con PostgreSQL', async () => {
    const respuesta = await request(app).get('/api/estado').set(bearer(supervisor));
    expect(respuesta.body.servicios.baseDatos.estado).toBe('operativa');
    expect(typeof respuesta.body.servicios.baseDatos.latenciaMs).toBe('number');
  });

  it('solo el supervisor puede consultar las finanzas de otra cuenta y la respuesta es de solo lectura', async () => {
    const grupo = await request(app).post('/api/grupos').set(bearer(usuario)).send({ nombre: 'Grupo supervisado' });
    expect(grupo.status).toBe(201);
    const gasto = await request(app).post(`/api/grupos/${grupo.body.grupo.id}/gastos`).set(bearer(usuario)).send({
      descripcion: 'Gasto de prueba supervisado',
      montoTotal: 12500,
      fechaGasto: '2026-11-09',
      categoria: 'alimentacion',
      tipoDivision: 'equitativa',
      usuarioIds: [usuario.id],
    });
    expect(gasto.status).toBe(201);

    const ruta = `/api/administracion/usuarios/${usuario.id}/finanzas`;
    expect((await request(app).get(ruta).set(bearer(usuario))).status).toBe(403);
    expect((await request(app).get(ruta).set(bearer(moderador))).status).toBe(403);

    const respuesta = await request(app).get(`${ruta}?limite=10&offset=0`).set(bearer(supervisor));
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.supervision.usuario.id).toBe(usuario.id);
    expect(respuesta.body.supervision.resumen).toMatchObject({ grupos: 1, gastos: 1 });
    expect(respuesta.body.supervision.grupos).toEqual([
      expect.objectContaining({ nombre: 'Grupo supervisado', numeroGastos: 1 }),
    ]);
    expect(respuesta.body.supervision.gastos).toEqual([
      expect.objectContaining({
        descripcion: 'Gasto de prueba supervisado',
        montoTotal: '12500.00',
        montoAsignado: '12500.00',
        estadoPago: 'pagado',
      }),
    ]);
    expect(respuesta.body.supervision.paginacion).toMatchObject({ limite: 10, offset: 0 });
    expect(respuesta.body.supervision.usuario).not.toHaveProperty('password_hash');

    const invalida = await request(app).get(`${ruta}?limite=1000`).set(bearer(supervisor));
    expect(invalida.status).toBe(400);
  });
});
