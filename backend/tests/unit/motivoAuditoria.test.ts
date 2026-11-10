import { motivoSolicitudAuditoria } from '../../src/infrastructure/adapters/in/http/middlewares/motivoAuditoria';

describe('motivo de auditoría', () => {
  it('describe el propósito de rutas sensibles con un motivo específico', () => {
    expect(motivoSolicitudAuditoria('GET', '/api/estado'))
      .toBe('Comprobar la disponibilidad de la API y la base de datos.');
    expect(motivoSolicitudAuditoria('GET', '/api/auditoria'))
      .toBe('Consultar la bitácora para supervisar la actividad.');
  });

  it('describe el motivo usando el tipo de operación y el recurso', () => {
    expect(motivoSolicitudAuditoria('POST', '/api/grupos/:grupoId/gastos'))
      .toBe('Crear o ejecutar una operación sobre grupos y gastos compartidos.');
    expect(motivoSolicitudAuditoria('PATCH', '/api/administracion/usuarios/:id/rol'))
      .toBe('Actualizar cuentas y permisos mediante una operación autorizada.');
  });
});
