import { EstadoUsuario, RolUsuario } from '../../entities/Usuario';

export interface UsuarioAdministracion {
  id: number;
  nombre: string;
  email: string;
  estado: EstadoUsuario;
  rol: RolUsuario;
  fechaRegistro: Date;
}

export interface SupervisionFinanciera {
  usuario: UsuarioAdministracion;
  resumen: {
    grupos: number;
    gastos: number;
    montoPagado: string;
    montoAsignado: string;
    montoPendiente: string;
  };
  grupos: Array<{
    id: number;
    nombre: string;
    estado: string;
    rol: string;
    fechaUnion: Date;
    fechaCreacion: Date;
    numeroGastos: number;
  }>;
  gastos: Array<{
    id: number;
    grupoId: number;
    grupo: string;
    pagadorId: number;
    pagador: string;
    descripcion: string;
    montoTotal: string;
    fechaGasto: Date;
    categoria: string;
    montoAsignado: string | null;
    estadoPago: string | null;
    fechaPago: Date | null;
  }>;
  paginacion: {
    limite: number;
    offset: number;
    total: number;
  };
}

export interface AdministracionRepository {
  listarUsuarios(): Promise<UsuarioAdministracion[]>;
  buscarUsuario(id: number): Promise<UsuarioAdministracion | null>;
  consultarFinanzasUsuario(id: number, limite: number, offset: number): Promise<SupervisionFinanciera | null>;
  cambiarEstado(id: number, estado: EstadoUsuario): Promise<UsuarioAdministracion | null>;
  cambiarRol(id: number, rol: RolUsuario): Promise<UsuarioAdministracion | null>;
}
