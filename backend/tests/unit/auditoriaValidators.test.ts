import {
  filtrosAuditoriaSchema,
  registrarEventoAuditoriaSchema,
} from '../../src/infrastructure/adapters/in/http/validators/auditoriaValidators';

describe('validadores de auditoría', () => {
  it('aplica paginación por defecto y acepta filtros válidos', () => {
    expect(filtrosAuditoriaSchema.parse({
      desde: '2026-10-01',
      hasta: '2026-10-20',
      rol: 'usuario',
      metodo: 'LOCAL',
      buscar: 'gastos',
    })).toEqual({
      desde: '2026-10-01',
      hasta: '2026-10-20',
      rol: 'usuario',
      metodo: 'LOCAL',
      buscar: 'gastos',
      limite: 25,
      offset: 0,
    });
  });

  it('rechaza rangos de fechas invertidos y paginación fuera de límites', () => {
    expect(filtrosAuditoriaSchema.safeParse({
      desde: '2026-10-20',
      hasta: '2026-10-01',
    }).success).toBe(false);
    expect(filtrosAuditoriaSchema.safeParse({ limite: 101 }).success).toBe(false);
  });

  it('solo acepta acciones locales declaradas', () => {
    expect(registrarEventoAuditoriaSchema.safeParse({ accion: 'gasto_crear' }).success).toBe(true);
    expect(registrarEventoAuditoriaSchema.safeParse({ accion: 'cambiar_rol_supervisor' }).success).toBe(false);
  });
});
