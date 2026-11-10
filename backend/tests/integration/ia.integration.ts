import request from 'supertest';
import { crearApp } from '../../src/app';
import { pool } from '../../src/infrastructure/adapters/out/persistence/postgres/db';
import { configurarExtractorFacturas } from '../../src/infrastructure/adapters/in/http/routes/iaRoutes';
import { IaNoDisponibleError } from '../../src/infrastructure/adapters/out/ia/facturaIaComun';
import { DatosFactura, FacturaExtractor } from '../../src/domain/ports/out/FacturaExtractor';
import { bearer, crearSesion, esperarEscrituras } from './utilidades';

const app = crearApp();
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200)]);
const PDF = Buffer.from('%PDF-1.7\n%prueba');

const datosEjemplo: DatosFactura = {
  esFactura: true, comercio: 'Almacenes Éxito', nit: '890.900.608-9', numeroFactura: 'FE-1', fecha: '2026-10-20',
  montoTotal: 87450, subtotal: 73487, impuestos: 13963, propina: null, moneda: 'COP', categoria: 'alimentacion',
  descripcionSugerida: 'Mercado en Éxito', items: [], confianza: 94, observaciones: null,
};

const extractorFalso: jest.Mocked<FacturaExtractor> = { extraer: jest.fn() };

afterEach(() => configurarExtractorFacturas(extractorFalso));
afterAll(async () => {
  configurarExtractorFacturas(null);
  await esperarEscrituras();
  await pool.end();
});

describe('Integración · Escaneo de facturas con IA (/api/ia)', () => {
  it('sin clave de IA configurada responde 503 para que el frontend use el OCR local', async () => {
    configurarExtractorFacturas(null);
    const sesion = await crearSesion(app);
    expect((await request(app).get('/api/ia/estado').set(bearer(sesion))).body).toEqual({ disponible: false });
    const respuesta = await request(app).post('/api/ia/facturas').set(bearer(sesion)).set('Content-Type', 'image/jpeg').send(JPEG);
    expect(respuesta.status).toBe(503);
  });

  it('exige sesión iniciada (401)', async () => {
    configurarExtractorFacturas(extractorFalso);
    const respuesta = await request(app).post('/api/ia/facturas').set('Content-Type', 'image/jpeg').send(JPEG);
    expect(respuesta.status).toBe(401);
    expect(extractorFalso.extraer).not.toHaveBeenCalled();
  });

  it('extrae los datos de una imagen y de un PDF', async () => {
    configurarExtractorFacturas(extractorFalso);
    extractorFalso.extraer.mockResolvedValue(datosEjemplo);
    const sesion = await crearSesion(app);

    const imagen = await request(app).post('/api/ia/facturas').set(bearer(sesion)).set('Content-Type', 'image/jpeg').send(JPEG);
    expect(imagen.status).toBe(200);
    expect(imagen.body.datos).toEqual(datosEjemplo);
    expect(extractorFalso.extraer).toHaveBeenLastCalledWith(JPEG, 'image/jpeg');

    const pdf = await request(app).post('/api/ia/facturas').set(bearer(sesion)).set('Content-Type', 'application/pdf').send(PDF);
    expect(pdf.status).toBe(200);
    expect(extractorFalso.extraer).toHaveBeenLastCalledWith(PDF, 'application/pdf');
  });

  it('rechaza formatos no permitidos y archivos cuyo contenido no coincide con el tipo (415)', async () => {
    configurarExtractorFacturas(extractorFalso);
    const sesion = await crearSesion(app);
    const html = await request(app).post('/api/ia/facturas').set(bearer(sesion)).set('Content-Type', 'text/html').send('<script>alert(1)</script>');
    const disfrazado = await request(app).post('/api/ia/facturas').set(bearer(sesion)).set('Content-Type', 'image/png').send(Buffer.from('MZ ejecutable'));
    expect(html.status).toBe(415);
    expect(disfrazado.status).toBe(415);
    expect(extractorFalso.extraer).not.toHaveBeenCalled();
  });

  it('rechaza archivos más grandes que IA_MAX_MB (413)', async () => {
    configurarExtractorFacturas(extractorFalso);
    const sesion = await crearSesion(app);
    const grande = Buffer.concat([JPEG, Buffer.alloc(1.2 * 1024 * 1024)]);
    const respuesta = await request(app).post('/api/ia/facturas').set(bearer(sesion)).set('Content-Type', 'image/jpeg').send(grande);
    expect(respuesta.status).toBe(413);
  });

  it('si el proveedor de IA falla responde 502 sin filtrar detalles', async () => {
    configurarExtractorFacturas(extractorFalso);
    extractorFalso.extraer.mockRejectedValue(new IaNoDisponibleError('El servicio de IA no respondió correctamente.'));
    const sesion = await crearSesion(app);
    const respuesta = await request(app).post('/api/ia/facturas').set(bearer(sesion)).set('Content-Type', 'image/jpeg').send(JPEG);
    expect(respuesta.status).toBe(502);
    expect(respuesta.body).toEqual({ error: 'IaNoDisponible', mensaje: 'El servicio de IA no respondió correctamente.' });
  });

  it('limita los escaneos por usuario y por hora (429) para controlar el costo', async () => {
    configurarExtractorFacturas(extractorFalso);
    extractorFalso.extraer.mockResolvedValue(datosEjemplo);
    const sesion = await crearSesion(app);
    const limite = Number(process.env.IA_LIMITE_POR_HORA);
    const estados: number[] = [];
    for (let i = 0; i <= limite; i += 1) {
      estados.push((await request(app).post('/api/ia/facturas').set(bearer(sesion)).set('Content-Type', 'image/jpeg').send(JPEG)).status);
    }
    expect(estados).toEqual([...Array(limite).fill(200), 429]);

    const otroUsuario = await crearSesion(app);
    expect((await request(app).post('/api/ia/facturas').set(bearer(otroUsuario)).set('Content-Type', 'image/jpeg').send(JPEG)).status).toBe(200);
  });
});
