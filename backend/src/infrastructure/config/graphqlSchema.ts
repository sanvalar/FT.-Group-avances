import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLID,
  GraphQLEnumType,
} from 'graphql';
import { pool, poolHistorico } from '../adapters/out/persistence/postgres/db';
import { administracionController, grupoGastoController } from './container';

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
      resolve: (u) => (u.estado === 'activo' ? 'Base de Datos Activos (OLTP Principal)' : 'Base de Datos Inactivos (Cold Storage)'),
    },
  }),
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

const ResumenPanelType = new GraphQLObjectType({
  name: 'ResumenPanel',
  description: 'KPIs y consolidado financiero del usuario',
  fields: () => ({
    totalGastos: { type: GraphQLInt },
    totalDeuda: { type: GraphQLInt },
    balanceNeto: { type: GraphQLInt },
  }),
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
        if (!context?.usuario) throw new Error('No autenticado para consultar usuarios.');
        
        // Si pide activos exclusivamente, consultamos solo el pool de activos
        if (args.estado === 'activo') {
          const res = await pool.query(
            `SELECT id, nombre, email, 'activo' AS estado, rol, fecha_registro AS "fechaRegistro"
             FROM usuario WHERE estado = 'activo' ORDER BY id DESC`
          );
          return res.rows;
        }

        // Si pide inactivos, consultamos el pool historico de inactivos
        if (args.estado === 'inactivo') {
          try {
            const res = await poolHistorico.query(
              `SELECT id, nombre, email, 'inactivo' AS estado, rol, fecha_registro AS "fechaRegistro"
               FROM historico.usuario_inactivo ORDER BY id DESC`
            );
            return res.rows;
          } catch {
            return [];
          }
        }

        // Si no especifica filtro, consultamos ambas bases y las unificamos
        const activos = await pool.query(
          `SELECT id, nombre, email, 'activo' AS estado, rol, fecha_registro AS "fechaRegistro"
           FROM usuario WHERE estado = 'activo'`
        );
        let inactivos: any[] = [];
        try {
          const resInact = await poolHistorico.query(
            `SELECT id, nombre, email, 'inactivo' AS estado, rol, fecha_registro AS "fechaRegistro"
             FROM historico.usuario_inactivo`
          );
          inactivos = resInact.rows;
        } catch {}

        return [...activos.rows, ...inactivos];
      },
    },

    // 2. Consulta de grupos activos del usuario
    misGrupos: {
      type: new GraphQLList(GrupoType),
      resolve: async (_parent, _args, context) => {
        if (!context?.usuario) throw new Error('Se requiere autenticacion JWT.');
        const res = await pool.query(
          `SELECT g.id, g.nombre, g.descripcion, m.rol, g.fecha_creacion AS "fechaCreacion",
                  COUNT(mi.id)::int AS "miembrosActivos"
           FROM grupo g
           JOIN miembro_grupo m ON m.grupo_id = g.id AND m.usuario_id = $1 AND m.estado = 'activo'
           JOIN miembro_grupo mi ON mi.grupo_id = g.id AND mi.estado = 'activo'
           WHERE g.estado = 'activo'
           GROUP BY g.id, g.nombre, g.descripcion, m.rol, g.fecha_creacion`,
          [context.usuario.id]
        );
        return res.rows;
      },
    },

    // 3. Grupos archivados / historicos
    gruposArchivados: {
      type: new GraphQLList(GrupoType),
      resolve: async (_parent, _args, context) => {
        if (!context?.usuario) throw new Error('Se requiere autenticacion JWT.');
        try {
          const res = await poolHistorico.query(
            `SELECT id, nombre, descripcion, 'archivado' AS estado, fecha_creacion AS "fechaCreacion"
             FROM historico.grupo_archivado
             WHERE creado_por = $1`,
            [context.usuario.id]
          );
          return res.rows;
        } catch {
          return [];
        }
      },
    },

    // 4. Perfil del usuario actual
    yo: {
      type: UsuarioType,
      resolve: async (_parent, _args, context) => {
        if (!context?.usuario) return null;
        const res = await pool.query(
          `SELECT id, nombre, email, estado, rol, fecha_registro AS "fechaRegistro"
           FROM usuario WHERE id = $1 LIMIT 1`,
          [context.usuario.id]
        );
        return res.rows[0] || null;
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
        if (!context?.usuario) throw new Error('No autorizado.');
        const id = parseInt(args.grupoId, 10);

        // 1. Obtener datos del grupo activo
        const grupoRes = await pool.query(`SELECT * FROM grupo WHERE id = $1`, [id]);
        if (grupoRes.rowCount === 0) throw new Error('Grupo no encontrado.');
        const grupo = grupoRes.rows[0];

        // 2. Insertar en base de datos historica
        try {
          await poolHistorico.query(
            `INSERT INTO historico.grupo_archivado (id, nombre, descripcion, creado_por, fecha_creacion)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO NOTHING`,
            [grupo.id, grupo.nombre, grupo.descripcion, grupo.creado_por, grupo.fecha_creacion]
          );
        } catch (e) {
          console.error('Error insertando en historico:', e);
        }

        // 3. Actualizar estado en activa a archivado
        await pool.query(`UPDATE grupo SET estado = 'archivado' WHERE id = $1`, [id]);
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
        if (!context?.usuario || context.usuario.rol !== 'supervisor') {
          throw new Error('Solo un supervisor puede desactivar usuarios.');
        }
        const id = parseInt(args.usuarioId, 10);
        const res = await pool.query(`SELECT * FROM usuario WHERE id = $1`, [id]);
        if (res.rowCount === 0) throw new Error('Usuario no encontrado.');
        const u = res.rows[0];

        // Guardar en historico
        try {
          await poolHistorico.query(
            `INSERT INTO historico.usuario_inactivo (id, nombre, email, rol, fecha_registro)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET fecha_desactivacion = NOW()`,
            [u.id, u.nombre, u.email, u.rol, u.fecha_registro]
          );
        } catch {}

        await pool.query(`UPDATE usuario SET estado = 'inactivo' WHERE id = $1`, [id]);
        return {
          id: u.id,
          nombre: u.nombre,
          email: u.email,
          rol: u.rol,
          estado: 'inactivo',
          fechaRegistro: u.fecha_registro,
        };
      },
    },
  },
});

export const graphqlSchema = new GraphQLSchema({
  query: RootQuery,
  mutation: RootMutation,
});
