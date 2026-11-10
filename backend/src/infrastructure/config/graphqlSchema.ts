import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLList,
  GraphQLNonNull,
  GraphQLID,
  GraphQLEnumType,
} from 'graphql';
import { administracionService, grupoGastoService, obtenerPerfilUseCase } from './container';

type GraphQLUsuario = { id: number; rol: 'usuario' | 'moderador' | 'supervisor' };
type Registro = Record<string, unknown> & {
  id?: number | string;
  nombre?: string;
  rol?: string;
  email?: string;
  monto_total?: number | string;
  acreedorId?: number | string;
  deudorId?: number | string;
  monto?: number | string;
};

function registro(value: unknown): Registro {
  return typeof value === 'object' && value !== null ? value as Registro : {};
}

function numero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function cargarGruposUsuario(usuarioId: number) {
  const grupos = await grupoGastoService.listarGrupos(usuarioId);
  const detalles = await Promise.all(grupos.map(async (grupo) => {
    const grupoId = Number(grupo.id);
    const [miembrosRaw, gastosRaw, balancesRaw] = await Promise.all([
      grupoGastoService.listarIntegrantes(usuarioId, grupoId),
      grupoGastoService.listarGastos(usuarioId, grupoId),
      grupoGastoService.listarBalances(usuarioId, grupoId),
    ]);
    const miembros = miembrosRaw.map(registro);
    const gastos = gastosRaw.map(registro);
    const balances = balancesRaw.map(registro);
    const miBalance = balances.reduce((total, balance) => {
      if (numero(balance.acreedorId) === usuarioId) return total + numero(balance.monto);
      if (numero(balance.deudorId) === usuarioId) return total - numero(balance.monto);
      return total;
    }, 0);
    const detalle = {
      ...grupo,
      icono: 'users',
      ciudad: null,
      totalGastos: gastos.reduce((total, gasto) => total + numero(gasto.monto_total), 0),
      numGastos: gastos.length,
      miBalance,
      miembros,
    };
    const liquidaciones = balances.map((balance) => {
      const de = numero(balance.deudorId);
      const para = numero(balance.acreedorId);
      return {
        grupo_id: String(grupo.id),
        grupo: grupo.nombre,
        de,
        para,
        monto: numero(balance.monto),
        deUsuario: miembros.find((miembro) => numero(miembro.id) === de),
        paraUsuario: miembros.find((miembro) => numero(miembro.id) === para),
      };
    });
    return { detalle, liquidaciones };
  }));
  return {
    grupos: detalles.map(({ detalle }) => detalle),
    liquidaciones: detalles.flatMap(({ liquidaciones }) => liquidaciones),
  };
}

function exigirRoles(usuario: { rol: string } | undefined, ...roles: string[]): void {
  if (!usuario || !roles.includes(usuario.rol)) {
    throw new Error('No tienes permisos para consultar este módulo.');
  }
}

function parsearId(value: unknown, tipo: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`Identificador de ${tipo} inválido.`);
  }
  return id;
}

function exigirUsuario(context: { usuario?: GraphQLUsuario }): GraphQLUsuario {
  if (!context?.usuario) throw new Error('No autenticado.');
  return context.usuario;
}

function validarPaginacion(limite: number, offset: number): void {
  if (!Number.isInteger(limite) || limite < 1 || limite > 100) {
    throw new Error('El límite debe estar entre 1 y 100.');
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000) {
    throw new Error('El desplazamiento debe estar entre 0 y 1000000.');
  }
}

// --- ENUMS & TYPES ---

const RolUsuarioEnum = new GraphQLEnumType({
  name: 'RolUsuario',
  values: {
    usuario: { value: 'usuario' },
    moderador: { value: 'moderador' },
    supervisor: { value: 'supervisor' },
  },
});

const EstadoUsuarioEnum = new GraphQLEnumType({
  name: 'EstadoUsuario',
  values: {
    activo: { value: 'activo' },
    inactivo: { value: 'inactivo' },
    bloqueado: { value: 'bloqueado' },
  },
});

const UsuarioType = new GraphQLObjectType({
  name: 'Usuario',
  description: 'Representa un usuario registrado en el sistema',
  fields: () => ({
    id: { type: new GraphQLNonNull(GraphQLID) },
    nombre: { type: new GraphQLNonNull(GraphQLString) },
    email: { type: new GraphQLNonNull(GraphQLString) },
    rol: { type: new GraphQLNonNull(RolUsuarioEnum) },
    estado: { type: new GraphQLNonNull(EstadoUsuarioEnum) },
    fechaRegistro: {
      type: GraphQLString,
      resolve: (u) => (u.fechaRegistro ? new Date(u.fechaRegistro).toISOString() : null),
    },
    origenBaseDatos: {
      type: GraphQLString,
      description: 'Identifica si el dato reside en la base de datos Activa u Host/Historica',
      resolve: (u) => (u.estado === 'inactivo' ? 'Base de Datos Inactivos (Cold Storage)' : 'Base de Datos Activos (OLTP Principal)'),
    },
  }),
});

const MiembroGrupoType = new GraphQLObjectType({
  name: 'MiembroGrupo',
  fields: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    nombre: { type: new GraphQLNonNull(GraphQLString) },
    email: { type: GraphQLString },
    rol: { type: GraphQLString },
  },
});

const GrupoType = new GraphQLObjectType({
  name: 'Grupo',
  description: 'Grupo de gastos colaborativo',
  fields: () => ({
    id: { type: new GraphQLNonNull(GraphQLID) },
    nombre: { type: new GraphQLNonNull(GraphQLString) },
    descripcion: { type: GraphQLString },
    rol: { type: GraphQLString },
    miembrosActivos: { type: GraphQLInt },
    icono: { type: GraphQLString },
    ciudad: { type: GraphQLString },
    totalGastos: { type: GraphQLFloat },
    numGastos: { type: GraphQLInt },
    miBalance: { type: GraphQLFloat },
    miembros: { type: new GraphQLList(MiembroGrupoType) },
    fechaCreacion: {
      type: GraphQLString,
      resolve: (g) => (g.fechaCreacion ? new Date(g.fechaCreacion).toISOString() : null),
    },
    estado: {
      type: GraphQLString,
      resolve: (g) => g.estado || 'activo',
    },
  }),
});

const LiquidacionType = new GraphQLObjectType({
  name: 'Liquidacion',
  fields: {
    grupo_id: { type: GraphQLID },
    grupo: { type: GraphQLString },
    de: { type: GraphQLID },
    para: { type: GraphQLID },
    monto: { type: GraphQLFloat },
    deUsuario: { type: MiembroGrupoType },
    paraUsuario: { type: MiembroGrupoType },
  },
});

const MiPanelType = new GraphQLObjectType({
  name: 'MiPanel',
  fields: {
    grupos: { type: new GraphQLList(GrupoType) },
    teDeben: { type: GraphQLFloat },
    debes: { type: GraphQLFloat },
    balance: { type: GraphQLFloat },
    liquidaciones: { type: new GraphQLList(LiquidacionType) },
  },
});

const SupervisionResumenType = new GraphQLObjectType({
  name: 'SupervisionResumen',
  fields: {
    grupos: { type: new GraphQLNonNull(GraphQLInt) },
    gastos: { type: new GraphQLNonNull(GraphQLInt) },
    montoPagado: { type: new GraphQLNonNull(GraphQLString) },
    montoAsignado: { type: new GraphQLNonNull(GraphQLString) },
    montoPendiente: { type: new GraphQLNonNull(GraphQLString) },
  },
});

const SupervisionGrupoType = new GraphQLObjectType({
  name: 'SupervisionGrupo',
  fields: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    nombre: { type: new GraphQLNonNull(GraphQLString) },
    estado: { type: new GraphQLNonNull(GraphQLString) },
    rol: { type: new GraphQLNonNull(GraphQLString) },
    fechaUnion: {
      type: GraphQLString,
      resolve: (grupo) => grupo.fechaUnion ? new Date(grupo.fechaUnion).toISOString() : null,
    },
    fechaCreacion: {
      type: GraphQLString,
      resolve: (grupo) => grupo.fechaCreacion ? new Date(grupo.fechaCreacion).toISOString() : null,
    },
    numeroGastos: { type: new GraphQLNonNull(GraphQLInt) },
  },
});

const SupervisionGastoType = new GraphQLObjectType({
  name: 'SupervisionGasto',
  fields: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    grupoId: { type: new GraphQLNonNull(GraphQLID) },
    grupo: { type: new GraphQLNonNull(GraphQLString) },
    pagadorId: { type: new GraphQLNonNull(GraphQLID) },
    pagador: { type: new GraphQLNonNull(GraphQLString) },
    descripcion: { type: new GraphQLNonNull(GraphQLString) },
    montoTotal: { type: new GraphQLNonNull(GraphQLString) },
    fechaGasto: {
      type: new GraphQLNonNull(GraphQLString),
      resolve: (gasto) => new Date(gasto.fechaGasto).toISOString(),
    },
    categoria: { type: new GraphQLNonNull(GraphQLString) },
    montoAsignado: { type: GraphQLString },
    estadoPago: { type: GraphQLString },
    fechaPago: {
      type: GraphQLString,
      resolve: (gasto) => gasto.fechaPago ? new Date(gasto.fechaPago).toISOString() : null,
    },
  },
});

const SupervisionPaginacionType = new GraphQLObjectType({
  name: 'SupervisionPaginacion',
  fields: {
    limite: { type: new GraphQLNonNull(GraphQLInt) },
    offset: { type: new GraphQLNonNull(GraphQLInt) },
    total: { type: new GraphQLNonNull(GraphQLInt) },
  },
});

const SupervisionFinancieraType = new GraphQLObjectType({
  name: 'SupervisionFinanciera',
  fields: {
    usuario: { type: new GraphQLNonNull(UsuarioType) },
    resumen: { type: new GraphQLNonNull(SupervisionResumenType) },
    grupos: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(SupervisionGrupoType))) },
    gastos: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(SupervisionGastoType))) },
    paginacion: { type: new GraphQLNonNull(SupervisionPaginacionType) },
  },
});

// --- ROOT QUERY ---

const RootQuery = new GraphQLObjectType({
  name: 'Query',
  fields: {
    // 1. Consulta optimizada de usuarios con enrutamiento de BD
    usuarios: {
      type: new GraphQLList(UsuarioType),
      args: {
        estado: { type: EstadoUsuarioEnum },
      },
      resolve: async (_parent, args, context) => {
        exigirRoles(context?.usuario, 'moderador', 'supervisor');
        const usuarios = await administracionService.listarUsuarios();
        return args.estado ? usuarios.filter((usuario) => usuario.estado === args.estado) : usuarios;
      },
    },

    finanzasUsuario: {
      type: SupervisionFinancieraType,
      args: {
        usuarioId: { type: new GraphQLNonNull(GraphQLID) },
        limite: { type: GraphQLInt, defaultValue: 50 },
        offset: { type: GraphQLInt, defaultValue: 0 },
      },
      resolve: async (_parent, args, context) => {
        const actor = exigirUsuario(context);
        exigirRoles(actor, 'supervisor');
        validarPaginacion(args.limite, args.offset);
        return administracionService.consultarFinanzasUsuario(
          actor.rol,
          parsearId(args.usuarioId, 'usuario'),
          args.limite,
          args.offset,
        );
      },
    },

    // 2. Consulta de grupos activos del usuario
    misGrupos: {
      type: new GraphQLList(GrupoType),
      resolve: async (_parent, _args, context) => {
        exigirRoles(context?.usuario, 'usuario');
        const usuario = context.usuario as GraphQLUsuario;
        return (await cargarGruposUsuario(usuario.id)).grupos;
      },
    },

    miPanel: {
      type: MiPanelType,
      resolve: async (_parent, _args, context) => {
        exigirRoles(context?.usuario, 'usuario');
        const usuario = context.usuario as GraphQLUsuario;
        const { grupos, liquidaciones } = await cargarGruposUsuario(usuario.id);
        const teDeben = liquidaciones
          .filter((liquidacion) => numero(liquidacion.para) === usuario.id)
          .reduce((total, liquidacion) => total + numero(liquidacion.monto), 0);
        const debes = liquidaciones
          .filter((liquidacion) => numero(liquidacion.de) === usuario.id)
          .reduce((total, liquidacion) => total + numero(liquidacion.monto), 0);
        return { grupos, liquidaciones, teDeben, debes, balance: teDeben - debes };
      },
    },

    // 3. Grupos archivados / historicos
    gruposArchivados: {
      type: new GraphQLList(GrupoType),
      resolve: async (_parent, _args, context) => {
        exigirRoles(context?.usuario, 'usuario');
        const usuario = context.usuario as GraphQLUsuario;
        return grupoGastoService.listarGruposArchivados(usuario.id);
      },
    },

    // 4. Perfil del usuario actual
    yo: {
      type: UsuarioType,
      resolve: async (_parent, _args, context) => {
        if (!context?.usuario) return null;
        const usuario = context.usuario as GraphQLUsuario;
        return obtenerPerfilUseCase.ejecutar(usuario.id);
      },
    },
  },
});

// --- ROOT MUTATION ---

const RootMutation = new GraphQLObjectType({
  name: 'Mutation',
  fields: {
    // Archivar grupo y trasladarlo al almacenamiento historico
    archivarGrupo: {
      type: GraphQLString,
      args: {
        grupoId: { type: new GraphQLNonNull(GraphQLID) },
      },
      resolve: async (_parent, args, context) => {
        exigirRoles(context?.usuario, 'usuario');
        const usuario = context.usuario as GraphQLUsuario;
        const id = parsearId(args.grupoId, 'grupo');
        await grupoGastoService.archivarGrupo(usuario.id, id);
        return `Grupo #${id} archivado y trasladado a la base de datos historica exitosamente.`;
      },
    },

    // Desactivar usuario y mover a BD inactiva
    desactivarUsuario: {
      type: UsuarioType,
      args: {
        usuarioId: { type: new GraphQLNonNull(GraphQLID) },
      },
      resolve: async (_parent, args, context) => {
        const actor = exigirUsuario(context);
        exigirRoles(actor, 'supervisor');
        const id = parsearId(args.usuarioId, 'usuario');
        const u = await administracionService.cambiarEstado(
          actor.id,
          actor.rol,
          id,
          'inactivo',
        );
        return {
          id: u.id,
          nombre: u.nombre,
          email: u.email,
          rol: u.rol,
          estado: 'inactivo',
          fechaRegistro: u.fechaRegistro,
        };
      },
    },

    cambiarEstadoUsuario: {
      type: new GraphQLNonNull(UsuarioType),
      args: {
        usuarioId: { type: new GraphQLNonNull(GraphQLID) },
        estado: { type: new GraphQLNonNull(EstadoUsuarioEnum) },
      },
      resolve: async (_parent, args, context) => {
        const actor = exigirUsuario(context);
        exigirRoles(actor, 'moderador', 'supervisor');
        return administracionService.cambiarEstado(
          actor.id,
          actor.rol,
          parsearId(args.usuarioId, 'usuario'),
          args.estado,
        );
      },
    },

    cambiarRolUsuario: {
      type: new GraphQLNonNull(UsuarioType),
      args: {
        usuarioId: { type: new GraphQLNonNull(GraphQLID) },
        rol: { type: new GraphQLNonNull(RolUsuarioEnum) },
      },
      resolve: async (_parent, args, context) => {
        const actor = exigirUsuario(context);
        exigirRoles(actor, 'supervisor');
        return administracionService.cambiarRol(
          actor.id,
          actor.rol,
          parsearId(args.usuarioId, 'usuario'),
          args.rol,
        );
      },
    },
  },
});

export const graphqlSchema = new GraphQLSchema({
  query: RootQuery,
  mutation: RootMutation,
});
