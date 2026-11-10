import {
  AuditoriaRepository,
  FiltrosAuditoria,
  NuevoEventoAuditoria,
} from '../../domain/ports/out/AuditoriaRepository';

export class AuditoriaService {
  constructor(private readonly repository: AuditoriaRepository) {}

  registrar(evento: NuevoEventoAuditoria): Promise<void> {
    return this.repository.registrar(evento);
  }

  listar(filtros: FiltrosAuditoria) {
    return this.repository.listar(filtros);
  }
}
