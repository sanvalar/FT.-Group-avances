import request from 'supertest';
import { crearApp } from '../../src/app';
import { pool } from '../../src/infrastructure/adapters/out/persistence/postgres/db';
import { bearer, crearSesion, esperarEscrituras, SesionPrueba } from './utilidades';

const app = crearApp();

let ana: SesionPrueba;
let beto: SesionPrueba;
let carla: SesionPrueba;
let intruso: SesionPrueba;
let grupoId: number;

beforeAll(async () => {
  ana = await crearSesion(app, 'Ana');
  beto = await crearSesion(app, 'Beto');
  carla = await crearSesion(app, 'Carla');
  intruso = await crearSesion(app, 'Intruso');
});

afterAll(async () => {
  await esperarEscrituras();
  await pool.end();
});

describe('Integración · Grupos, gastos y balances', () => {
  it('crea un grupo y el creador queda como administrador', async () => {
    const respuesta = await request(app).post('/api/grupos').set(bearer(ana)).send({ nombre: 'Apartamento 402', descripcion: 'Gastos del apto' });
    expect(respuesta.status).toBe(201);
    grupoId = respuesta.body.grupo.id;

    const integrantes = await request(app).get(`/api/grupos/${grupoId}/integrantes`).set(bearer(ana));
    expect(integrantes.body.integrantes).toEqual([expect.objectContaining({ id: ana.id, rol: 'administrador' })]);
  });

  it('el administrador agrega integrantes y ellos reciben notificación', async () => {
    for (const miembro of [beto, carla]) {
      const respuesta = await request(app).post(`/api/grupos/${grupoId}/integrantes`).set(bearer(ana)).send({ usuarioId: miembro.id });
      expect(respuesta.status).toBe(204);
    }
    const notificaciones = await request(app).get('/api/notificaciones').set(bearer(beto));
    expect(notificaciones.body.notificaciones.some((n: { tipo: string }) => n.tipo === 'invitacion_grupo')).toBe(true);
  });

  it('no permite agregar dos veces al mismo integrante (409)', async () => {
    const respuesta = await request(app).post(`/api/grupos/${grupoId}/integrantes`).set(bearer(ana)).send({ usuarioId: beto.id });
    expect(respuesta.status).toBe(409);
  });

  it('un miembro que no es administrador no puede agregar integrantes (403)', async () => {
    const respuesta = await request(app).post(`/api/grupos/${grupoId}/integrantes`).set(bearer(beto)).send({ usuarioId: intruso.id });
    expect(respuesta.status).toBe(403);
  });

  it('registra un gasto con división equitativa y cuadra el total al peso', async () => {
    const respuesta = await request(app).post(`/api/grupos/${grupoId}/gastos`).set(bearer(ana)).send({
      descripcion: 'Mercado del mes', montoTotal: 100000, fechaGasto: '2026-10-20', categoria: 'alimentacion',
      tipoDivision: 'equitativa', usuarioIds: [ana.id, beto.id, carla.id],
    });
    expect(respuesta.status).toBe(201);
    const montos = respuesta.body.gasto.participaciones.map((p: { montoAsignado: number }) => p.montoAsignado);
    expect(montos.reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(100000, 2);
  });

  it('calcula los balances: Beto le debe a Ana su parte', async () => {
    const respuesta = await request(app).get(`/api/grupos/${grupoId}/balances`).set(bearer(beto));
    expect(respuesta.status).toBe(200);
    const deuda = respuesta.body.balances.find((b: { deudorId: number }) => b.deudorId === beto.id);
    expect(deuda).toMatchObject({ acreedorId: ana.id });
    expect(Number(deuda.monto)).toBeCloseTo(33333.33, 1);
  });

  it('rechaza una división personalizada que no suma el total (400)', async () => {
    const respuesta = await request(app).post(`/api/grupos/${grupoId}/gastos`).set(bearer(ana)).send({
      descripcion: 'Internet', montoTotal: 90000, fechaGasto: '2026-10-21', categoria: 'servicios',
      tipoDivision: 'personalizada', participaciones: [{ usuarioId: ana.id, montoAsignado: 10000 }, { usuarioId: beto.id, montoAsignado: 10000 }],
    });
    expect(respuesta.status).toBe(400);
  });

  it('rechaza participantes que no pertenecen al grupo (400)', async () => {
    const respuesta = await request(app).post(`/api/grupos/${grupoId}/gastos`).set(bearer(ana)).send({
      descripcion: 'Taxi', montoTotal: 20000, fechaGasto: '2026-10-21', categoria: 'transporte',
      tipoDivision: 'equitativa', usuarioIds: [ana.id, intruso.id],
    });
    expect(respuesta.status).toBe(400);
  });

  it('el deudor confirma su pago y el balance se recalcula', async () => {
    const gastos = await request(app).get(`/api/grupos/${grupoId}/gastos`).set(bearer(beto));
    const gastoId = gastos.body.gastos[0].id;

    expect((await request(app).post(`/api/grupos/gastos/${gastoId}/pagos`).set(bearer(beto))).status).toBe(204);
    expect((await request(app).post(`/api/grupos/gastos/${gastoId}/pagos`).set(bearer(beto))).status).toBe(409);

    const balances = await request(app).get(`/api/grupos/${grupoId}/balances`).set(bearer(beto));
    expect(balances.body.balances.find((b: { deudorId: number }) => b.deudorId === beto.id)).toBeUndefined();
  });

  it('el historial registra los movimientos del grupo', async () => {
    const respuesta = await request(app).get(`/api/grupos/${grupoId}/historial`).set(bearer(carla));
    const tipos = respuesta.body.movimientos.map((m: { tipoMovimiento: string }) => m.tipoMovimiento);
    expect(tipos).toEqual(expect.arrayContaining(['miembro_agregado', 'gasto_creado', 'pago_registrado']));
  });

  it('el resumen financiero refleja el gasto del pagador', async () => {
    const respuesta = await request(app).get('/api/reportes/resumen').set(bearer(ana));
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.resumen.gastosRegistrados).toBe(1);
  });

  describe('Control de acceso (IDOR): un usuario ajeno no ve ni modifica el grupo', () => {
    // Grupo propio de este bloque, para que pueda ejecutarse solo:
    //   npx jest -c jest.integration.config.js -t "IDOR"
    let grupoAjeno: number;
    let gastoAjeno: number;

    beforeAll(async () => {
      const grupo = await request(app).post('/api/grupos').set(bearer(ana)).send({ nombre: 'Grupo privado de Ana' });
      grupoAjeno = grupo.body.grupo.id;
      await request(app).post(`/api/grupos/${grupoAjeno}/integrantes`).set(bearer(ana)).send({ usuarioId: beto.id });
      const gasto = await request(app).post(`/api/grupos/${grupoAjeno}/gastos`).set(bearer(ana)).send({
        descripcion: 'Cena privada', montoTotal: 60000, fechaGasto: '2026-10-22', categoria: 'alimentacion',
        tipoDivision: 'equitativa', usuarioIds: [ana.id, beto.id],
      });
      gastoAjeno = gasto.body.gasto.id;
    });

    const rutas = () => [
      ['get', `/api/grupos/${grupoAjeno}/integrantes`],
      ['get', `/api/grupos/${grupoAjeno}/gastos`],
      ['get', `/api/grupos/${grupoAjeno}/balances`],
      ['get', `/api/grupos/${grupoAjeno}/historial`],
    ] as const;

    it('responde 403 en todas las consultas del grupo', async () => {
      for (const [metodo, ruta] of rutas()) {
        const respuesta = await request(app)[metodo](ruta).set(bearer(intruso));
        expect([ruta, respuesta.status]).toEqual([ruta, 403]);
      }
    });

    it('no puede registrar gastos ni pagos en el grupo', async () => {
      const gasto = await request(app).post(`/api/grupos/${grupoAjeno}/gastos`).set(bearer(intruso)).send({
        descripcion: 'Intento', montoTotal: 1000, fechaGasto: '2026-10-21', categoria: 'otro',
        tipoDivision: 'equitativa', usuarioIds: [intruso.id],
      });
      expect(gasto.status).toBe(403);

      const pago = await request(app).post(`/api/grupos/gastos/${gastoAjeno}/pagos`).set(bearer(intruso));
      expect(pago.status).toBe(403);
    });

    it('no lista el grupo entre los suyos', async () => {
      const respuesta = await request(app).get('/api/grupos').set(bearer(intruso));
      expect(respuesta.body.grupos.map((g: { id: number }) => g.id)).not.toContain(grupoAjeno);
    });
  });

  it('el administrador retira a un integrante y este pierde el acceso', async () => {
    expect((await request(app).delete(`/api/grupos/${grupoId}/integrantes/${carla.id}`).set(bearer(ana))).status).toBe(204);
    expect((await request(app).get(`/api/grupos/${grupoId}/gastos`).set(bearer(carla))).status).toBe(403);
  });

  it('el grupo siempre conserva al menos un administrador (409)', async () => {
    const respuesta = await request(app).delete(`/api/grupos/${grupoId}/integrantes/${ana.id}`).set(bearer(ana));
    expect(respuesta.status).toBe(409);
  });
});
